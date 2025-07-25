/**
 * @fileoverview 回退管理器
 * @description 集成回退服务到现有系统，提供统一的回退管理接口
 */

import { FallbackService } from './FallbackService.js';
import { ConfigLoader } from '../rotation/ConfigLoader.js';
import { FallbackConfig, FallbackState, ModelSwitchEvent, FallbackStats } from '../types/fallback.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * 回退管理器类
 * 提供回退功能的统一管理接口
 */
export class FallbackManager extends EventEmitter {
  private fallbackService: FallbackService | null = null;
  private configLoader: ConfigLoader;
  private config: FallbackConfig;
  private autoResetTimer: NodeJS.Timeout | null = null;
  
  /**
   * 构造函数
   * @param configLoader 配置加载器实例
   */
  constructor(configLoader?: ConfigLoader) {
    super();
    this.configLoader = configLoader || new ConfigLoader();
    this.config = this.configLoader.loadFallbackConfig();
    
    console.log('[fallback/FallbackManager] 回退管理器初始化');
    console.log('[fallback/FallbackManager] 配置:', {
      enabled: this.config.enabled,
      primaryModel: this.config.primaryModel,
      fallbackModel: this.config.fallbackModel
    });
    
    if (this.config.enabled) {
      this.initializeFallbackService();
    } else {
      console.log('[fallback/FallbackManager] 回退功能已禁用');
    }
  }
  
  /**
   * 初始化回退服务
   */
  private initializeFallbackService(): void {
    try {
      const persistenceFile = this.configLoader.getFallbackPersistenceFile();
      this.fallbackService = new FallbackService(this.config, persistenceFile);
      
      // 监听回退服务事件
      this.fallbackService.on('modelSwitched', (event: ModelSwitchEvent) => {
        console.log('[fallback/FallbackManager] 模型切换事件:', event);
        this.emit('modelSwitched', event);
        
        // 启动自动重置定时器
        if (this.config.autoResetEnabled) {
          this.startAutoResetTimer();
        }
      });
      
      this.fallbackService.on('modelReset', (event: ModelSwitchEvent) => {
        console.log('[fallback/FallbackManager] 模型重置事件:', event);
        this.emit('modelReset', event);
        
        // 清除自动重置定时器
        this.clearAutoResetTimer();
      });
      
      this.fallbackService.on('dataCleared', () => {
        console.log('[fallback/FallbackManager] 数据清除事件');
        this.emit('dataCleared');
        this.clearAutoResetTimer();
      });
      
      console.log('[fallback/FallbackManager] 回退服务初始化成功');
      logger.info('Fallback service initialized successfully');
    } catch (error) {
      console.error('[fallback/FallbackManager] 回退服务初始化失败:', error);
      logger.error('Failed to initialize fallback service', error);
      throw error;
    }
  }
  
  /**
   * 启动自动重置定时器
   */
  private startAutoResetTimer(): void {
    this.clearAutoResetTimer();
    
    if (!this.config.autoResetEnabled || !this.fallbackService) {
      return;
    }
    
    console.log(`[fallback/FallbackManager] 启动自动重置定时器，延迟: ${this.config.autoResetDelay}ms`);
    
    this.autoResetTimer = setTimeout(async () => {
      try {
        console.log('[fallback/FallbackManager] 执行自动重置到主模型');
        await this.resetToPrimary();
        logger.info('Auto reset to primary model completed');
      } catch (error) {
        console.error('[fallback/FallbackManager] 自动重置失败:', error);
        logger.error('Auto reset to primary model failed', error);
      }
    }, this.config.autoResetDelay);
  }
  
  /**
   * 清除自动重置定时器
   */
  private clearAutoResetTimer(): void {
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
      console.log('[fallback/FallbackManager] 自动重置定时器已清除');
    }
  }
  
  /**
   * 检查错误是否应该触发回退
   * @param error 错误对象
   * @returns 是否应该触发回退
   */
  shouldTriggerFallback(error: any): boolean {
    if (!this.config.enabled || !this.fallbackService) {
      return false;
    }
    
    return this.fallbackService.shouldTriggerFallback(error);
  }
  
  /**
   * 触发回退到备用模型
   * @param error 触发回退的错误
   * @returns 回退结果信息
   */
  async triggerFallback(error: any): Promise<{ success: boolean; newModel: string; previousModel: string }> {
    if (!this.config.enabled || !this.fallbackService) {
      throw new Error('回退功能未启用或服务未初始化');
    }
    
    console.log('[fallback/FallbackManager] 触发回退到备用模型');
    
    try {
      const result = await this.fallbackService.triggerFallback(error);
      
      console.log('[fallback/FallbackManager] 回退触发成功:', result);
      logger.info('Fallback triggered successfully', result);
      
      return result;
    } catch (error) {
      console.error('[fallback/FallbackManager] 回退触发失败:', error);
      logger.error('Fallback trigger failed', error);
      throw error;
    }
  }
  
  /**
   * 执行模型回退
   * @param error 触发回退的错误
   * @returns 回退后的模型名称
   */
  async performFallback(error: any): Promise<string> {
    if (!this.config.enabled || !this.fallbackService) {
      throw new Error('回退功能未启用或服务未初始化');
    }
    
    console.log('[fallback/FallbackManager] 执行模型回退');
    
    try {
      const newModel = await this.fallbackService.performFallback(error);
      
      console.log('[fallback/FallbackManager] 模型回退成功，新模型:', newModel);
      logger.info('Model fallback performed successfully', { newModel });
      
      return newModel;
    } catch (fallbackError) {
      console.error('[fallback/FallbackManager] 模型回退失败:', fallbackError);
      logger.error('Model fallback failed', fallbackError);
      throw fallbackError;
    }
  }
  
  /**
   * 重置到主模型
   * @returns 主模型名称
   */
  async resetToPrimary(): Promise<string> {
    if (!this.config.enabled || !this.fallbackService) {
      throw new Error('回退功能未启用或服务未初始化');
    }
    
    console.log('[fallback/FallbackManager] 重置到主模型');
    
    try {
      const primaryModel = await this.fallbackService.resetToPrimary();
      
      console.log('[fallback/FallbackManager] 重置到主模型成功:', primaryModel);
      logger.info('Reset to primary model successfully', { primaryModel });
      
      return primaryModel;
    } catch (error) {
      console.error('[fallback/FallbackManager] 重置到主模型失败:', error);
      logger.error('Reset to primary model failed', error);
      throw error;
    }
  }
  
  /**
   * 获取当前模型
   * @returns 当前使用的模型名称
   */
  getCurrentModel(): string {
    if (!this.config.enabled || !this.fallbackService) {
      return this.config.primaryModel;
    }
    
    return this.fallbackService.getCurrentModel();
  }
  
  /**
   * 检查是否处于回退模式
   * @returns 是否处于回退模式
   */
  isInFallbackMode(): boolean {
    if (!this.config.enabled || !this.fallbackService) {
      return false;
    }
    
    return this.fallbackService.isInFallbackMode();
  }
  
  /**
   * 获取回退状态
   * @returns 当前回退状态
   */
  getState(): FallbackState | null {
    if (!this.config.enabled || !this.fallbackService) {
      return null;
    }
    
    return this.fallbackService.getState();
  }
  
  /**
   * 获取统计信息
   * @returns 回退统计信息
   */
  getStats(): FallbackStats | null {
    if (!this.config.enabled || !this.fallbackService) {
      return null;
    }
    
    return this.fallbackService.getStats();
  }
  
  /**
   * 获取配置信息
   * @returns 当前配置
   */
  getConfig(): FallbackConfig {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   * @param newConfig 新的配置
   */
  async updateConfig(newConfig: Partial<FallbackConfig>): Promise<void> {
    console.log('[fallback/FallbackManager] 更新配置:', newConfig);
    
    const oldEnabled = this.config.enabled;
    this.config = { ...this.config, ...newConfig };
    
    // 如果启用状态发生变化
    if (oldEnabled !== this.config.enabled) {
      if (this.config.enabled && !this.fallbackService) {
        // 从禁用变为启用，初始化服务
        this.initializeFallbackService();
      } else if (!this.config.enabled && this.fallbackService) {
        // 从启用变为禁用，销毁服务
        await this.destroy();
      }
    }
    
    // 更新服务配置
    if (this.fallbackService) {
      this.fallbackService.updateConfig(newConfig);
    }
    
    logger.info('Fallback configuration updated', { newConfig });
  }
  
  /**
   * 重新加载配置
   */
  async reloadConfig(): Promise<void> {
    console.log('[fallback/FallbackManager] 重新加载配置');
    
    try {
      const newConfig = this.configLoader.loadFallbackConfig();
      await this.updateConfig(newConfig);
      
      console.log('[fallback/FallbackManager] 配置重新加载成功');
      logger.info('Fallback configuration reloaded successfully');
    } catch (error) {
      console.error('[fallback/FallbackManager] 配置重新加载失败:', error);
      logger.error('Failed to reload fallback configuration', error);
      throw error;
    }
  }
  
  /**
   * 清除所有数据
   */
  async clearAllData(): Promise<void> {
    console.log('[fallback/FallbackManager] 清除所有数据');
    
    if (this.fallbackService) {
      await this.fallbackService.clearAllData();
    }
    
    this.clearAutoResetTimer();
    
    console.log('[fallback/FallbackManager] 所有数据清除完成');
    logger.info('All fallback data cleared successfully');
  }
  
  /**
   * 获取健康状态
   * @returns 健康状态信息
   */
  getHealthStatus(): {
    enabled: boolean;
    serviceInitialized: boolean;
    currentModel: string;
    isInFallbackMode: boolean;
    autoResetActive: boolean;
  } {
    return {
      enabled: this.config.enabled,
      serviceInitialized: !!this.fallbackService,
      currentModel: this.getCurrentModel(),
      isInFallbackMode: this.isInFallbackMode(),
      autoResetActive: !!this.autoResetTimer
    };
  }
  
  /**
   * 销毁管理器
   * 清理所有资源
   */
  async destroy(): Promise<void> {
    console.log('[fallback/FallbackManager] 销毁回退管理器');
    
    this.clearAutoResetTimer();
    
    if (this.fallbackService) {
      this.fallbackService.destroy();
      this.fallbackService = null;
    }
    
    this.removeAllListeners();
    
    console.log('[fallback/FallbackManager] 回退管理器销毁完成');
    logger.info('Fallback manager destroyed successfully');
  }
}