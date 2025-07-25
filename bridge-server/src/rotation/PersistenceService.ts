/**
 * PersistenceService - 负责持久化存储和恢复API Key的使用记录
 * 支持文件锁定、备份和数据恢复功能
 * @author AI Assistant
 */

import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { logger } from '../utils/logger.js';
import { type PersistenceData, type ApiKeyInfo } from './types.js';

export class PersistenceService {
  private filePath: string;
  private lockFilePath: string;

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.lockFilePath = `${this.filePath}.lock`;
    this.ensureDirectoryExists();
  }

  /**
   * 确保目录存在
   */
  private ensureDirectoryExists(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.debug(false, `Created directory: ${dir}`);
    }
  }

  /**
   * 获取文件锁
   */
  private async acquireLock(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 100;

    for (let i = 0; i < maxRetries; i++) {
      try {
        if (!existsSync(this.lockFilePath)) {
          writeFileSync(this.lockFilePath, process.pid.toString(), 'utf-8');
          return;
        }

        // 检查锁文件是否过期（超过30秒）
        const lockStat = statSync(this.lockFilePath);
        const lockAge = Date.now() - lockStat.mtime.getTime();
        if (lockAge > 30000) {
          unlinkSync(this.lockFilePath);
          logger.warn('Removed stale lock file');
          continue;
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } catch (error) {
        // 如果锁文件不存在或其他错误，继续尝试
        continue;
      }
    }

    throw new Error('Failed to acquire lock after maximum retries');
  }

  /**
   * 释放文件锁
   */
  private releaseLock(): void {
    try {
      if (existsSync(this.lockFilePath)) {
        unlinkSync(this.lockFilePath);
      }
    } catch (error) {
      logger.warn('Failed to release lock file:', error);
    }
  }

  /**
   * 加载持久化数据
   */
  async loadData(): Promise<PersistenceData | null> {
    console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 开始加载持久化数据', { filePath: this.filePath });
    await this.acquireLock();
    console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 获取文件锁成功');
    
    try {
      if (!existsSync(this.filePath)) {
        console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 持久化文件不存在，返回null');
        logger.debug(false, 'Persistence file does not exist, returning null');
        return null;
      }

      console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 读取持久化文件内容');
      const content = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content) as PersistenceData;
      
      console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 持久化数据解析成功', {
         currentIndex: data.currentIndex,
         totalRequests: data.totalRequests,
         keysCount: data.keys.length
       });
      
      logger.debug(false, 'Loaded persistence data', {
        currentIndex: data.currentIndex,
        totalRequests: data.totalRequests,
        keysCount: data.keys.length
      });
      
      return data;
    } catch (error) {
      console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 加载持久化数据失败', error);
      logger.error('Failed to load persistence data:', error);
      return null;
    } finally {
      this.releaseLock();
      console.log('[DEBUG] /rotation/PersistenceService.ts - loadData: 释放文件锁');
    }
  }

  /**
   * 保存持久化数据
   */
  async saveData(data: PersistenceData): Promise<void> {
    console.log('[DEBUG] /rotation/PersistenceService.ts - saveData: 开始保存持久化数据', {
      filePath: this.filePath,
      currentIndex: data.currentIndex,
      totalRequests: data.totalRequests,
      keysCount: data.keys.length
    });
    await this.acquireLock();
    console.log('[DEBUG] /rotation/PersistenceService.ts - saveData: 获取文件锁成功');
    
    try {
      const content = JSON.stringify(data, null, 2);
      writeFileSync(this.filePath, content, 'utf-8');
      console.log('[DEBUG] /rotation/PersistenceService.ts - saveData: 持久化数据写入文件成功');
      
      logger.debug(false, 'Saved persistence data', {
        currentIndex: data.currentIndex,
        totalRequests: data.totalRequests,
        keysCount: data.keys.length
      });
    } catch (error) {
      console.log('[DEBUG] /rotation/PersistenceService.ts - saveData: 保存持久化数据失败', error);
      logger.error('Failed to save persistence data:', error);
      throw error;
    } finally {
      this.releaseLock();
      console.log('[DEBUG] /rotation/PersistenceService.ts - saveData: 释放文件锁');
    }
  }

  /**
   * 创建备份文件
   */
  async createBackup(): Promise<void> {
    if (!existsSync(this.filePath)) {
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.filePath}.backup.${timestamp}`;
      
      const content = readFileSync(this.filePath, 'utf-8');
      writeFileSync(backupPath, content, 'utf-8');
      
      logger.info(`Created backup: ${backupPath}`);
      
      // 清理旧备份文件
      await this.cleanupBackups();
    } catch (error) {
      logger.error('Failed to create backup:', error);
    }
  }

  /**
   * 清理旧备份文件（保留最近5个）
   */
  private async cleanupBackups(): Promise<void> {
    try {
      const dir = dirname(this.filePath);
      const baseName = join(dir, 'api-keys-usage');
      
      const files = readdirSync(dir)
        .filter(file => file.startsWith('api-keys-usage.backup.'))
        .map(file => ({
          name: file,
          path: join(dir, file),
          mtime: statSync(join(dir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // 保留最近5个备份文件
      const filesToDelete = files.slice(5);
      
      for (const file of filesToDelete) {
        unlinkSync(file.path);
        logger.debug(false, `Deleted old backup: ${file.name}`);
      }
      
      if (filesToDelete.length > 0) {
        logger.info(`Cleaned up ${filesToDelete.length} old backup files`);
      }
    } catch (error) {
      logger.warn('Failed to cleanup backup files:', error);
    }
  }

  /**
   * 重置数据文件
   */
  async resetData(): Promise<void> {
    console.log('[DEBUG] /rotation/PersistenceService.ts - resetData: 开始重置持久化数据文件', { filePath: this.filePath });
    try {
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath);
        console.log('[DEBUG] /rotation/PersistenceService.ts - resetData: 持久化文件删除成功');
      } else {
        console.log('[DEBUG] /rotation/PersistenceService.ts - resetData: 持久化文件不存在，无需删除');
      }
      logger.info('Reset persistence data file');
    } catch (error) {
      console.log('[DEBUG] /rotation/PersistenceService.ts - resetData: 重置持久化数据失败', error);
      logger.error('Failed to reset persistence data:', error);
      throw error;
    }
  }
}