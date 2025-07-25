/**
 * @fileoverview 基于SQLite的回退状态持久化服务
 * @description 使用SQLite数据库替代文件锁机制，提供更可靠的并发控制和数据持久化
 */

// 修复ES模块导入问题：使用动态导入better-sqlite3
// @ts-ignore
import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { FallbackState } from '../types/fallback.js';
import { logger } from '../utils/logger.js';

/**
 * 基于SQLite的回退状态持久化服务类
 * 提供线程安全的回退状态存储功能，解决文件锁并发问题
 */
export class SqliteFallbackPersistence {
  private db: any;
  private dbPath: string;
  
  /**
   * 构造函数
   * @param dbPath SQLite数据库文件路径
   */
  constructor(dbPath: string) {
    this.dbPath = resolve(dbPath);
    console.log(`[fallback/SqliteFallbackPersistence] 初始化SQLite持久化服务，数据库路径: ${this.dbPath}`);
    
    // 确保目录存在
    this.ensureDirectoryExists();
    
    // 初始化数据库连接
    this.initializeDatabase();
  }
  
  /**
   * 确保数据库目录存在
   * 修复原有的ES模块兼容性问题，使用import方式而非require
   */
  private ensureDirectoryExists(): void {
    try {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        console.log(`[fallback/SqliteFallbackPersistence] 创建数据库目录: ${dir}`);
        // 修复ES模块兼容性问题：使用import的fs而非require
        mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 创建数据库目录失败:', error);
      logger.error('Failed to create database directory for SQLite fallback persistence', error);
      throw error;
    }
  }
  
  /**
   * 初始化SQLite数据库连接和表结构
   * 创建回退状态表，支持ACID事务
   */
  private initializeDatabase(): void {
    try {
      console.log('[fallback/SqliteFallbackPersistence] 初始化SQLite数据库连接');
      
      // 创建数据库连接，启用WAL模式提高并发性能
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');
      
      // 创建回退状态表
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS fallback_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          is_fallback_active BOOLEAN NOT NULL DEFAULT 0,
          current_model TEXT,
          fallback_start_time TEXT,
          last_updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          state_data TEXT NOT NULL DEFAULT '{}'
        )
      `;
      
      // 创建统计信息表
      const createStatsTableSQL = `
        CREATE TABLE IF NOT EXISTS fallback_stats (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          total_fallbacks INTEGER NOT NULL DEFAULT 0,
          total_resets INTEGER NOT NULL DEFAULT 0,
          last_fallback_time TEXT,
          last_reset_time TEXT,
          last_updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          stats_data TEXT NOT NULL DEFAULT '{}'
        )
      `;
      
      this.db.exec(createTableSQL);
      this.db.exec(createStatsTableSQL);
      
      // 创建索引提高查询性能
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_last_updated ON fallback_state(last_updated)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_stats_last_updated ON fallback_stats(last_updated)');
      
      console.log('[fallback/SqliteFallbackPersistence] SQLite数据库初始化完成');
      logger.info('SQLite fallback persistence database initialized successfully');
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 初始化数据库失败:', error);
      logger.error('Failed to initialize SQLite fallback persistence database', error);
      throw error;
    }
  }
  
  /**
   * 保存回退状态
   * 使用SQLite事务确保数据一致性，无需手动文件锁
   * @param state 要保存的回退状态
   */
  async saveState(state: FallbackState): Promise<void> {
    console.log('[fallback/SqliteFallbackPersistence] 开始保存回退状态:', state);
    
    try {
      // 使用事务确保原子性操作
      const transaction = this.db.transaction(() => {
        const now = new Date().toISOString();
        
        // 准备要保存的状态数据
        const stateToSave = {
          ...state,
          lastUpdated: now
        };
        
        // 使用UPSERT操作（INSERT OR REPLACE）
        const upsertSQL = `
          INSERT OR REPLACE INTO fallback_state (
            id, is_fallback_active, current_model, fallback_start_time, 
            last_updated, state_data
          ) VALUES (1, ?, ?, ?, ?, ?)
        `;
        
        const stmt = this.db.prepare(upsertSQL);
        stmt.run(
          state.isInFallbackMode ? 1 : 0,
          state.currentModel || null,
          state.fallbackStartTime || null,
          now,
          JSON.stringify(stateToSave)
        );
        
        console.log('[fallback/SqliteFallbackPersistence] 回退状态保存成功');
      });
      
      // 执行事务
      transaction();
      
      logger.info('Fallback state saved successfully to SQLite', { 
        dbPath: this.dbPath,
        state: state
      });
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 保存回退状态失败:', error);
      logger.error('Failed to save fallback state to SQLite', error);
      throw error;
    }
  }
  
  /**
   * 加载回退状态
   * 从SQLite数据库读取最新的回退状态
   * @returns 加载的回退状态，如果不存在则返回null
   */
  async loadState(): Promise<FallbackState | null> {
    console.log('[fallback/SqliteFallbackPersistence] 开始加载回退状态');
    
    try {
      const selectSQL = `
        SELECT is_fallback_active, current_model, fallback_start_time, 
               last_updated, state_data 
        FROM fallback_state 
        WHERE id = 1
      `;
      
      const stmt = this.db.prepare(selectSQL);
      const row = stmt.get() as any;
      
      if (!row) {
        console.log('[fallback/SqliteFallbackPersistence] 数据库中无回退状态记录，返回null');
        return null;
      }
      
      // 解析状态数据
      let parsedState: FallbackState;
      try {
        parsedState = JSON.parse(row.state_data);
      } catch (parseError) {
        console.warn('[fallback/SqliteFallbackPersistence] 解析状态数据失败，使用基础数据:', parseError);
        // 如果JSON解析失败，使用基础字段构建状态
        parsedState = {
          isInFallbackMode: Boolean(row.is_fallback_active),
          consecutiveFailures: 0,
          currentModel: row.current_model,
          fallbackModel: row.current_model || '',
          fallbackStartTime: row.fallback_start_time,
          lastSwitchTime: null,
          switchCount: 0,
          lastError: null,
          lastUpdated: row.last_updated
        };
      }
      
      console.log('[fallback/SqliteFallbackPersistence] 回退状态加载成功:', parsedState);
      logger.info('Fallback state loaded successfully from SQLite', { state: parsedState });
      
      return parsedState;
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 加载回退状态失败:', error);
      logger.error('Failed to load fallback state from SQLite', error);
      return null;
    }
  }
  
  /**
   * 清除回退状态
   * 删除数据库中的回退状态记录
   */
  async clearState(): Promise<void> {
    console.log('[fallback/SqliteFallbackPersistence] 开始清除回退状态');
    
    try {
      const deleteSQL = 'DELETE FROM fallback_state WHERE id = 1';
      const stmt = this.db.prepare(deleteSQL);
      const result = stmt.run();
      
      if (result.changes > 0) {
        console.log('[fallback/SqliteFallbackPersistence] 回退状态记录删除成功');
        logger.info('Fallback state record deleted successfully from SQLite');
      } else {
        console.log('[fallback/SqliteFallbackPersistence] 无回退状态记录需要删除');
      }
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 清除回退状态失败:', error);
      logger.error('Failed to clear fallback state from SQLite', error);
      throw error;
    }
  }
  
  /**
   * 检查是否存在回退状态记录
   * @returns 如果存在记录返回true
   */
  exists(): boolean {
    try {
      const countSQL = 'SELECT COUNT(*) as count FROM fallback_state WHERE id = 1';
      const stmt = this.db.prepare(countSQL);
      const result = stmt.get() as { count: number };
      
      const exists = result.count > 0;
      console.log(`[fallback/SqliteFallbackPersistence] 检查记录存在性: ${exists}`);
      return exists;
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 检查记录存在性失败:', error);
      return false;
    }
  }
  
  /**
   * 获取数据库文件路径
   * @returns SQLite数据库文件的完整路径
   */
  getDbPath(): string {
    return this.dbPath;
  }
  
  /**
   * 保存统计信息
   * @param stats 要保存的统计信息
   */
  async saveStats(stats: any): Promise<void> {
    console.log('[fallback/SqliteFallbackPersistence] 开始保存统计信息:', stats);
    
    try {
      const transaction = this.db.transaction(() => {
        const now = new Date().toISOString();
        
        const statsToSave = {
          ...stats,
          lastUpdated: now
        };
        
        const upsertSQL = `
          INSERT OR REPLACE INTO fallback_stats (
            id, total_fallbacks, total_resets, last_fallback_time,
            last_reset_time, last_updated, stats_data
          ) VALUES (1, ?, ?, ?, ?, ?, ?)
        `;
        
        const stmt = this.db.prepare(upsertSQL);
        stmt.run(
          stats.totalFallbacks || 0,
          stats.totalResets || 0,
          stats.lastFallbackTime || null,
          stats.lastResetTime || null,
          now,
          JSON.stringify(statsToSave)
        );
        
        console.log('[fallback/SqliteFallbackPersistence] 统计信息保存成功');
      });
      
      transaction();
      logger.info('Fallback stats saved successfully to SQLite', { stats });
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 保存统计信息失败:', error);
      logger.error('Failed to save fallback stats to SQLite', error);
      throw error;
    }
  }
  
  /**
   * 加载统计信息
   * @returns 加载的统计信息，如果不存在则返回null
   */
  async loadStats(): Promise<any | null> {
    console.log('[fallback/SqliteFallbackPersistence] 开始加载统计信息');
    
    try {
      const selectSQL = `
        SELECT total_fallbacks, total_resets, last_fallback_time,
               last_reset_time, last_updated, stats_data
        FROM fallback_stats
        WHERE id = 1
      `;
      
      const stmt = this.db.prepare(selectSQL);
      const row = stmt.get() as any;
      
      if (!row) {
        console.log('[fallback/SqliteFallbackPersistence] 数据库中无统计信息记录，返回null');
        return null;
      }
      
      let parsedStats: any;
      try {
        parsedStats = JSON.parse(row.stats_data);
      } catch (parseError) {
        console.warn('[fallback/SqliteFallbackPersistence] 解析统计数据失败，使用基础数据:', parseError);
        parsedStats = {
          totalFallbacks: row.total_fallbacks || 0,
          totalResets: row.total_resets || 0,
          lastFallbackTime: row.last_fallback_time,
          lastResetTime: row.last_reset_time,
          lastUpdated: row.last_updated,
          errorCounts: {
            quota_exceeded: 0,
            rate_limit: 0,
            server_error: 0,
            network_error: 0,
            unknown: 0
          }
        };
      }
      
      console.log('[fallback/SqliteFallbackPersistence] 统计信息加载成功:', parsedStats);
      logger.info('Fallback stats loaded successfully from SQLite', { stats: parsedStats });
      
      return parsedStats;
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 加载统计信息失败:', error);
      logger.error('Failed to load fallback stats from SQLite', error);
      return null;
    }
  }
  
  /**
   * 清除统计信息
   */
  async clearStats(): Promise<void> {
    console.log('[fallback/SqliteFallbackPersistence] 开始清除统计信息');
    
    try {
      const deleteSQL = 'DELETE FROM fallback_stats WHERE id = 1';
      const stmt = this.db.prepare(deleteSQL);
      const result = stmt.run();
      
      if (result.changes > 0) {
        console.log('[fallback/SqliteFallbackPersistence] 统计信息记录删除成功');
        logger.info('Fallback stats record deleted successfully from SQLite');
      } else {
        console.log('[fallback/SqliteFallbackPersistence] 无统计信息记录需要删除');
      }
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 清除统计信息失败:', error);
      logger.error('Failed to clear fallback stats from SQLite', error);
      throw error;
    }
  }
  
  /**
   * 重置持久化数据
   * 清除所有状态并重新初始化数据库
   */
  async resetData(): Promise<void> {
    console.log('[fallback/SqliteFallbackPersistence] 开始重置持久化数据');
    
    try {
      // 清除所有数据
      await this.clearState();
      await this.clearStats();
      
      // 重置数据库统计信息
      this.db.exec('VACUUM');
      
      console.log('[fallback/SqliteFallbackPersistence] 持久化数据重置完成');
      logger.info('SQLite fallback persistence data reset completed');
      
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 重置持久化数据失败:', error);
      logger.error('Failed to reset SQLite fallback persistence data', error);
      throw error;
    }
  }
  
  /**
   * 关闭数据库连接
   * 在应用程序退出时调用以确保数据完整性
   */
  close(): void {
    try {
      if (this.db) {
        this.db.close();
        console.log('[fallback/SqliteFallbackPersistence] SQLite数据库连接已关闭');
        logger.info('SQLite fallback persistence database connection closed');
      }
    } catch (error) {
      console.error('[fallback/SqliteFallbackPersistence] 关闭数据库连接失败:', error);
      logger.error('Failed to close SQLite fallback persistence database connection', error);
    }
  }
}