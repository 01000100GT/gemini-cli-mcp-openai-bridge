/**
 * @fileoverview 回退状态持久化服务
 * @description 负责回退模式状态的保存、加载和管理
 */

import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { FallbackState } from '../types/fallback.js';
import { logger } from '../utils/logger.js';

/**
 * 回退状态持久化服务类
 * 提供回退状态的持久化存储功能
 */
export class FallbackPersistence {
  private filePath: string;
  private lockFilePath: string;
  
  /**
   * 构造函数
   * @param filePath 持久化文件路径
   */
  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.lockFilePath = `${this.filePath}.lock`;
    console.log(`[fallback/FallbackPersistence] 初始化持久化服务，文件路径: ${this.filePath}`);
    this.ensureDirectoryExists();
  }
  
  /**
   * 确保目录存在
   * 如果目录不存在则创建
   */
  private ensureDirectoryExists(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        console.log(`[fallback/FallbackPersistence] 创建目录: ${dir}`);
        require('fs').mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 创建目录失败:', error);
      logger.error('Failed to create directory for fallback persistence', error);
    }
  }
  
  /**
   * 获取文件锁
   * 防止并发访问导致的数据竞争
   * @returns 是否成功获取锁
   */
  private async acquireLock(): Promise<boolean> {
    try {
      // 检查锁文件是否存在
      if (existsSync(this.lockFilePath)) {
        // 检查锁文件的创建时间，如果超过30秒则认为是僵尸锁
        const stats = await fs.stat(this.lockFilePath);
        const lockAge = Date.now() - stats.mtime.getTime();
        if (lockAge > 30000) { // 30秒超时
          console.log('[fallback/FallbackPersistence] 检测到僵尸锁，强制释放');
          await this.releaseLock();
        } else {
          console.log('[fallback/FallbackPersistence] 文件被锁定，等待释放');
          return false;
        }
      }
      
      // 创建锁文件
      await fs.writeFile(this.lockFilePath, Date.now().toString());
      console.log('[fallback/FallbackPersistence] 成功获取文件锁');
      return true;
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 获取文件锁失败:', error);
      return false;
    }
  }
  
  /**
   * 释放文件锁
   */
  private async releaseLock(): Promise<void> {
    try {
      if (existsSync(this.lockFilePath)) {
        await fs.unlink(this.lockFilePath);
        console.log('[fallback/FallbackPersistence] 成功释放文件锁');
      }
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 释放文件锁失败:', error);
    }
  }
  
  /**
   * 保存回退状态
   * @param state 要保存的回退状态
   */
  async saveState(state: FallbackState): Promise<void> {
    console.log('[fallback/FallbackPersistence] 开始保存回退状态:', state);
    
    // 尝试获取锁，最多重试3次
    let lockAcquired = false;
    for (let i = 0; i < 3; i++) {
      lockAcquired = await this.acquireLock();
      if (lockAcquired) break;
      
      // 等待100ms后重试
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!lockAcquired) {
      const error = new Error('无法获取文件锁，保存状态失败');
      console.error('[fallback/FallbackPersistence] 保存状态失败:', error.message);
      logger.error('Failed to acquire lock for saving fallback state', error);
      throw error;
    }
    
    try {
      // 更新最后更新时间
      const stateToSave = {
        ...state,
        lastUpdated: new Date().toISOString()
      };
      
      const data = JSON.stringify(stateToSave, null, 2);
      await fs.writeFile(this.filePath, data, 'utf8');
      
      console.log('[fallback/FallbackPersistence] 回退状态保存成功');
      logger.info('Fallback state saved successfully', { filePath: this.filePath });
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 保存回退状态失败:', error);
      logger.error('Failed to save fallback state', error);
      throw error;
    } finally {
      await this.releaseLock();
    }
  }
  
  /**
   * 加载回退状态
   * @returns 加载的回退状态，如果文件不存在或加载失败则返回null
   */
  async loadState(): Promise<FallbackState | null> {
    console.log('[fallback/FallbackPersistence] 开始加载回退状态');
    
    try {
      if (!existsSync(this.filePath)) {
        console.log('[fallback/FallbackPersistence] 持久化文件不存在，返回null');
        return null;
      }
      
      const data = await fs.readFile(this.filePath, 'utf8');
      const state = JSON.parse(data) as FallbackState;
      
      console.log('[fallback/FallbackPersistence] 回退状态加载成功:', state);
      logger.info('Fallback state loaded successfully', { state });
      
      return state;
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 加载回退状态失败:', error);
      logger.error('Failed to load fallback state', error);
      return null;
    }
  }
  
  /**
   * 清除回退状态
   * 删除持久化文件
   */
  async clearState(): Promise<void> {
    console.log('[fallback/FallbackPersistence] 开始清除回退状态');
    
    try {
      if (existsSync(this.filePath)) {
        await fs.unlink(this.filePath);
        console.log('[fallback/FallbackPersistence] 回退状态文件删除成功');
        logger.info('Fallback state file deleted successfully');
      } else {
        console.log('[fallback/FallbackPersistence] 回退状态文件不存在，无需删除');
      }
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 清除回退状态失败:', error);
      logger.error('Failed to clear fallback state', error);
      throw error;
    }
  }
  
  /**
   * 检查持久化文件是否存在
   * @returns 如果文件存在返回true
   */
  exists(): boolean {
    const exists = existsSync(this.filePath);
    console.log(`[fallback/FallbackPersistence] 检查文件存在性: ${exists}`);
    return exists;
  }
  
  /**
   * 获取文件路径
   * @returns 持久化文件的完整路径
   */
  getFilePath(): string {
    return this.filePath;
  }
  
  /**
   * 重置持久化数据
   * 清除状态并重新初始化
   */
  async resetData(): Promise<void> {
    console.log('[fallback/FallbackPersistence] 开始重置持久化数据');
    
    try {
      await this.clearState();
      await this.releaseLock(); // 确保释放任何可能存在的锁
      
      console.log('[fallback/FallbackPersistence] 持久化数据重置完成');
      logger.info('Fallback persistence data reset completed');
    } catch (error) {
      console.error('[fallback/FallbackPersistence] 重置持久化数据失败:', error);
      logger.error('Failed to reset fallback persistence data', error);
      throw error;
    }
  }
}