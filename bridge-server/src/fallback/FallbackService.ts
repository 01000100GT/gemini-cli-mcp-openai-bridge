/**
 * @fileoverview 回退模型服务
 * @description 核心回退服务，负责模型切换、状态管理和错误处理
 */

import { FallbackConfig, FallbackState, ModelSwitchEvent, ErrorType, FallbackStats } from '../types/fallback.js';
// 修改：使用SQLite持久化替代文件锁机制，解决并发问题
import { SqliteFallbackPersistence } from './SqliteFallbackPersistence.js';
import { shouldTriggerFallback, getErrorType } from './errorDetection.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * 回退服务类
 * 提供模型回退的核心功能
 */
export class FallbackService extends EventEmitter {
  private config: FallbackConfig;
  private state: FallbackState;
  // 修改：使用SQLite持久化服务替代原有的文件锁机制
  private persistence: SqliteFallbackPersistence;
  private stats: FallbackStats;
  
  /**
   * 构造函数
   * @param config 回退配置
   * @param persistenceFilePath 持久化文件路径
   */
  constructor(config: FallbackConfig, persistenceFilePath: string) {
    super();
    this.config = config;
    // 修改：创建SQLite持久化实例，将.json文件路径改为.db文件路径
    const dbPath = persistenceFilePath.replace(/\.json$/, '.db');
    this.persistence = new SqliteFallbackPersistence(dbPath);
    console.log('[fallback/FallbackService] 使用SQLite持久化，数据库路径:', dbPath);
    
    // 初始化状态
    this.state = {
      isInFallbackMode: false,
      currentModel: config.primaryModel,
      fallbackModel: config.fallbackModel,
      lastSwitchTime: null,
      switchCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastUpdated: new Date().toISOString()
    };
    
    // 初始化统计信息
    this.stats = {
      totalFallbacks: 0,
      totalRestores: 0,
      averageFallbackDuration: 0,
      fallbacksByErrorType: {
        [ErrorType.QUOTA_EXCEEDED]: 0,
        [ErrorType.RATE_LIMIT]: 0,
        [ErrorType.PRO_QUOTA_EXCEEDED]: 0,
        [ErrorType.GENERIC_QUOTA_EXCEEDED]: 0,
        [ErrorType.SERVER_ERROR]: 0,
        [ErrorType.NETWORK_ERROR]: 0,
        [ErrorType.UNKNOWN_ERROR]: 0,
        [ErrorType.UNKNOWN]: 0
      },
      totalSwitches: 0,
      successfulSwitches: 0,
      failedSwitches: 0,
      lastSwitchTime: null,
      errorCounts: {
        [ErrorType.QUOTA_EXCEEDED]: 0,
        [ErrorType.RATE_LIMIT]: 0,
        [ErrorType.PRO_QUOTA_EXCEEDED]: 0,
        [ErrorType.GENERIC_QUOTA_EXCEEDED]: 0,
        [ErrorType.SERVER_ERROR]: 0,
        [ErrorType.NETWORK_ERROR]: 0,
        [ErrorType.UNKNOWN_ERROR]: 0,
        [ErrorType.UNKNOWN]: 0
      }
    };
    
    console.log('[fallback/FallbackService] 回退服务初始化完成');
    console.log('[fallback/FallbackService] 主模型:', config.primaryModel);
    console.log('[fallback/FallbackService] 回退模型:', config.fallbackModel);
    console.log('[fallback/FallbackService] 启用状态:', config.enabled);
    
    // 加载持久化状态
    this.loadPersistedState();
  }
  
  /**
   * 加载持久化状态
   */
  private async loadPersistedState(): Promise<void> {
    try {
      const persistedState = await this.persistence.loadState();
      if (persistedState) {
        this.state = { ...this.state, ...persistedState };
        console.log('[fallback/FallbackService] 成功加载持久化状态:', this.state);
        logger.info('Loaded persisted fallback state', { state: this.state });
      } else {
        console.log('[fallback/FallbackService] 未找到持久化状态，使用默认状态');
      }
    } catch (error) {
      console.error('[fallback/FallbackService] 加载持久化状态失败:', error);
      logger.error('Failed to load persisted fallback state', error);
    }
  }
  
  /**
   * 保存当前状态
   */
  private async saveState(): Promise<void> {
    try {
      await this.persistence.saveState(this.state);
      console.log('[fallback/FallbackService] 状态保存成功');
    } catch (error) {
      console.error('[fallback/FallbackService] 状态保存失败:', error);
      logger.error('Failed to save fallback state', error);
    }
  }
  
  /**
   * 检查错误是否应该触发回退
   * @param error 错误对象
   * @returns 是否应该触发回退
   */
  shouldTriggerFallback(error: any): boolean {
    if (!this.config.enabled) {
      console.log('[fallback/FallbackService] 回退功能未启用，跳过回退检查');
      return false;
    }
    
    if (this.state.isInFallbackMode) {
      console.log('[fallback/FallbackService] 已处于回退模式，不再触发回退');
      return false;
    }
    
    const shouldTrigger = shouldTriggerFallback(error);
    console.log('[fallback/FallbackService] 回退触发检查结果:', shouldTrigger);
    
    if (shouldTrigger) {
      const errorType = getErrorType(error);
      console.log('[fallback/FallbackService] 错误类型:', errorType);
      this.stats.errorCounts[errorType]++;
    }
    
    return shouldTrigger;
  }
  
  /**
   * 触发回退到备用模型
   * @param error 触发回退的错误
   * @returns 回退结果信息
   */
  async triggerFallback(error: any): Promise<{ success: boolean; newModel: string; previousModel: string }> {
    if (!this.config.enabled) {
      throw new Error('Fallback is not enabled');
    }

    if (this.state.isInFallbackMode) {
      throw new Error('Already in fallback mode');
    }

    const previousModel = this.state.currentModel;
    const newModel = this.state.fallbackModel;

    try {
      // 执行回退
      await this.performFallback(error);
      
      return {
        success: true,
        newModel,
        previousModel
      };
    } catch (fallbackError) {
      console.error('[fallback/FallbackService] 回退执行失败:', fallbackError);
      return {
        success: false,
        newModel: previousModel, // 保持原模型
        previousModel
      };
    }
  }
  
  /**
   * 执行模型回退
   * @param error 触发回退的错误
   * @returns 回退后的模型名称
   */
  async performFallback(error: any): Promise<string> {
    console.log('[fallback/FallbackService] 开始执行模型回退');
    console.log('[fallback/FallbackService] 触发错误:', error?.message || error);
    
    if (!this.config.enabled) {
      const errorMsg = '回退功能未启用';
      console.error('[fallback/FallbackService]', errorMsg);
      throw new Error(errorMsg);
    }
    
    if (this.state.isInFallbackMode) {
      const errorMsg = '已处于回退模式，无法再次回退';
      console.error('[fallback/FallbackService]', errorMsg);
      throw new Error(errorMsg);
    }
    
    try {
      // 更新统计信息
      this.stats.totalSwitches++;
      
      // 更新状态
      const previousModel = this.state.currentModel;
      this.state.isInFallbackMode = true;
      this.state.currentModel = this.state.fallbackModel;
      this.state.lastSwitchTime = new Date().toISOString();
      this.state.switchCount++;
      this.state.lastError = {
        message: error?.message || String(error),
        timestamp: new Date().toISOString(),
        type: getErrorType(error)
      };
      
      // 保存状态
      await this.saveState();
      
      // 更新统计信息
      this.stats.successfulSwitches++;
      this.stats.lastSwitchTime = this.state.lastSwitchTime;
      
      // 创建切换事件
      const switchEvent: ModelSwitchEvent = {
        fromModel: previousModel,
        toModel: this.state.currentModel,
        timestamp: new Date(),
        reason: 'quota_exceeded',
        errorType: this.state.lastError.type
      };
      
      // 发出事件
      this.emit('modelSwitched', switchEvent);
      
      console.log('[fallback/FallbackService] 模型回退成功');
      console.log('[fallback/FallbackService] 从模型:', previousModel);
      console.log('[fallback/FallbackService] 切换到模型:', this.state.currentModel);
      
      logger.info('Model fallback performed successfully', {
        fromModel: previousModel,
        toModel: this.state.currentModel,
        reason: error?.message,
        switchCount: this.state.switchCount
      });
      
      return this.state.currentModel;
    } catch (fallbackError) {
      this.stats.failedSwitches++;
      console.error('[fallback/FallbackService] 执行回退失败:', fallbackError);
      logger.error('Failed to perform model fallback', fallbackError);
      throw fallbackError;
    }
  }
  
  /**
   * 重置回退状态
   * 将模型切换回主模型
   */
  async resetToPrimary(): Promise<string> {
    console.log('[fallback/FallbackService] 开始重置到主模型');
    
    if (!this.state.isInFallbackMode) {
      console.log('[fallback/FallbackService] 当前未处于回退模式，无需重置');
      return this.state.currentModel;
    }
    
    try {
      const previousModel = this.state.currentModel;
      
      // 重置状态
      this.state.isInFallbackMode = false;
      this.state.currentModel = this.config.primaryModel;
      this.state.lastSwitchTime = new Date().toISOString();
      this.state.lastError = null;
      
      // 保存状态
      await this.saveState();
      
      // 创建切换事件
      const switchEvent: ModelSwitchEvent = {
        fromModel: previousModel,
        toModel: this.state.currentModel,
        timestamp: new Date(),
        reason: 'manual',
        errorType: ErrorType.UNKNOWN
      };
      
      // 发出事件
      this.emit('modelReset', switchEvent);
      
      console.log('[fallback/FallbackService] 成功重置到主模型:', this.state.currentModel);
      logger.info('Reset to primary model successfully', {
        fromModel: previousModel,
        toModel: this.state.currentModel
      });
      
      return this.state.currentModel;
    } catch (error) {
      console.error('[fallback/FallbackService] 重置到主模型失败:', error);
      logger.error('Failed to reset to primary model', error);
      throw error;
    }
  }
  
  /**
   * 获取当前模型
   * @returns 当前使用的模型名称
   */
  getCurrentModel(): string {
    return this.state.currentModel;
  }
  
  /**
   * 检查是否处于回退模式
   * @returns 是否处于回退模式
   */
  isInFallbackMode(): boolean {
    return this.state.isInFallbackMode;
  }
  
  /**
   * 获取回退状态
   * @returns 当前回退状态
   */
  getState(): FallbackState {
    return { ...this.state };
  }
  
  /**
   * 获取统计信息
   * @returns 回退统计信息
   */
  getStats(): FallbackStats {
    return { ...this.stats };
  }
  
  /**
   * 更新配置
   * @param newConfig 新的配置
   */
  updateConfig(newConfig: Partial<FallbackConfig>): void {
    console.log('[fallback/FallbackService] 更新配置:', newConfig);
    
    this.config = { ...this.config, ...newConfig };
    
    // 如果主模型或回退模型发生变化，需要更新状态
    if (newConfig.primaryModel && !this.state.isInFallbackMode) {
      this.state.currentModel = newConfig.primaryModel;
    }
    
    if (newConfig.fallbackModel) {
      this.state.fallbackModel = newConfig.fallbackModel;
      if (this.state.isInFallbackMode) {
        this.state.currentModel = newConfig.fallbackModel;
      }
    }
    
    logger.info('Fallback configuration updated', { newConfig });
  }
  
  /**
   * 清除所有数据
   * 重置状态和统计信息
   */
  async clearAllData(): Promise<void> {
    console.log('[fallback/FallbackService] 开始清除所有数据');
    
    try {
      // 重置状态
      this.state = {
        isInFallbackMode: false,
        currentModel: this.config.primaryModel,
        fallbackModel: this.config.fallbackModel,
        lastSwitchTime: null,
        switchCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastUpdated: new Date().toISOString()
      };
      
      // 重置统计信息
      this.stats = {
        totalFallbacks: 0,
        totalRestores: 0,
        averageFallbackDuration: 0,
        fallbacksByErrorType: {
          [ErrorType.QUOTA_EXCEEDED]: 0,
          [ErrorType.RATE_LIMIT]: 0,
          [ErrorType.PRO_QUOTA_EXCEEDED]: 0,
          [ErrorType.GENERIC_QUOTA_EXCEEDED]: 0,
          [ErrorType.SERVER_ERROR]: 0,
          [ErrorType.NETWORK_ERROR]: 0,
          [ErrorType.UNKNOWN_ERROR]: 0,
          [ErrorType.UNKNOWN]: 0
        },
        totalSwitches: 0,
        successfulSwitches: 0,
        failedSwitches: 0,
        lastSwitchTime: null,
        errorCounts: {
          [ErrorType.QUOTA_EXCEEDED]: 0,
          [ErrorType.RATE_LIMIT]: 0,
          [ErrorType.PRO_QUOTA_EXCEEDED]: 0,
          [ErrorType.GENERIC_QUOTA_EXCEEDED]: 0,
          [ErrorType.SERVER_ERROR]: 0,
          [ErrorType.NETWORK_ERROR]: 0,
          [ErrorType.UNKNOWN_ERROR]: 0,
          [ErrorType.UNKNOWN]: 0
        }
      };
      
      // 清除持久化数据
      await this.persistence.clearState();
      
      console.log('[fallback/FallbackService] 所有数据清除完成');
      logger.info('All fallback data cleared successfully');
      
      // 发出清除事件
      this.emit('dataCleared');
    } catch (error) {
      console.error('[fallback/FallbackService] 清除数据失败:', error);
      logger.error('Failed to clear fallback data', error);
      throw error;
    }
  }
  
  /**
   * 获取配置信息
   * @returns 当前配置
   */
  getConfig(): FallbackConfig {
    return { ...this.config };
  }
  
  /**
   * 销毁服务
   * 清理资源
   */
  destroy(): void {
    console.log('[fallback/FallbackService] 销毁回退服务');
    this.removeAllListeners();
    logger.info('Fallback service destroyed');
  }
}