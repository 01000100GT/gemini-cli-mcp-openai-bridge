/**
 * API Key轮换服务 - 集成轮换管理器到现有系统
 */

import { logger } from '../utils/logger.js';
import { ApiKeyRotationManager } from './ApiKeyRotationManager.js';
import { ConfigLoader } from './ConfigLoader.js';
import { type RotationConfig, type RotationStatus, type UsageStats } from './types.js';

export class RotationService {
  private rotationManager?: ApiKeyRotationManager;
  private configLoader: ConfigLoader;
  private debugMode: boolean;
  private isEnabled = false;
  // 修复：添加初始化状态跟踪，解决异步竞态条件问题
  private isInitializing = false;
  private initializationPromise?: Promise<void>;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
    this.configLoader = new ConfigLoader(debugMode);
  }

  /**
   * 初始化轮换服务
   */
  async initialize(): Promise<void> {
    // 修复：防止重复初始化，解决竞态条件问题
    if (this.isInitializing || this.initializationPromise) {
      console.log('[rotation/RotationService] 初始化已在进行中，等待完成...');
      return this.initializationPromise;
    }
    
    this.isInitializing = true;
    console.log('[rotation/RotationService] [时序1] 开始初始化轮换服务');
    
    this.initializationPromise = this.doInitialize();
    
    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
    }
  }
  
  /**
   * 执行实际的初始化逻辑
   */
  private async doInitialize(): Promise<void> {
    try {
      console.log('[rotation/RotationService] [时序2] 检查多账号模式配置');
      // 检查是否启用多账号模式
      const isMultiAccountEnabled = this.configLoader.isMultiAccountEnabled();
      console.log(`[rotation/RotationService] [时序3] 多账号模式检查结果: ${isMultiAccountEnabled}`);
      
      if (!isMultiAccountEnabled) {
        logger.info('Multi-account rotation is disabled');
        console.log('[rotation/RotationService] [时序4] 多账号轮换已禁用，初始化完成');
        return;
      }

      console.log('[rotation/RotationService] [时序5] 开始加载轮换配置');
      // 加载配置
      const config = this.configLoader.loadRotationConfig();
      console.log(`[rotation/RotationService] [时序6] 配置加载完成，账号数量: ${config.multiAccount?.accounts.length || 0}`);
      
      if (!config.multiAccount || config.multiAccount.accounts.length === 0) {
        logger.warn('No accounts configured for rotation');
        console.log('[rotation/RotationService] [时序7] 警告：没有配置轮换账号');
        return;
      }

      console.log('[rotation/RotationService] [时序8] 开始初始化轮换管理器');
      // 初始化轮换管理器
      this.rotationManager = new ApiKeyRotationManager(config, this.debugMode);
      await this.rotationManager.initialize();
      
      console.log('[rotation/RotationService] [时序9] 轮换管理器初始化完成，设置服务为启用状态');
      this.isEnabled = true;
      logger.info('API Key rotation service initialized successfully');
      console.log('[rotation/RotationService] [时序10] API Key轮换服务初始化成功');
    } catch (error) {
      logger.error('Failed to initialize rotation service:', error);
      console.error('[rotation/RotationService] [时序ERROR] 初始化轮换服务失败:', error);
      throw error;
    }
  }

  /**
   * 获取API Key（如果启用轮换则返回轮换的Key，否则返回默认Key）
   */
  async getApiKey(): Promise<string> {
    console.log(`[rotation/RotationService] [API请求] 请求获取API Key，当前状态: enabled=${this.isEnabled}, manager=${!!this.rotationManager}, initializing=${this.isInitializing}`);
    
    // 修复：如果正在初始化，等待初始化完成
    if (this.isInitializing && this.initializationPromise) {
      console.log('[rotation/RotationService] [API请求] 检测到初始化正在进行，等待初始化完成...');
      try {
        await this.initializationPromise;
        console.log(`[rotation/RotationService] [API请求] 初始化完成，更新状态: enabled=${this.isEnabled}, manager=${!!this.rotationManager}`);
      } catch (error) {
        console.error('[rotation/RotationService] [API请求] 等待初始化完成时发生错误:', error);
      }
    }
    
    if (!this.isEnabled || !this.rotationManager) {
      console.log('[rotation/RotationService] [API请求] 轮换服务未启用，使用默认API Key');
      // 返回默认的API Key
      return this.getDefaultApiKey();
    }

    try {
      console.log('[rotation/RotationService] [API请求] 从轮换管理器获取下一个API Key');
      const apiKey = await this.rotationManager.getNextApiKey();
      console.log(`[rotation/RotationService] [API请求] 成功获取轮换API Key: ${apiKey.substring(0, 10)}...`);
      return apiKey;
    } catch (error) {
      logger.error('Failed to get rotated API key, falling back to default:', error);
      console.error('[rotation/RotationService] [API请求] 获取轮换API Key失败，回退到默认Key:', error);
      return this.getDefaultApiKey();
    }
  }

  /**
   * 报告API Key使用结果
   */
  async reportUsage(apiKey: string, success: boolean, errorType?: string): Promise<void> {
    console.log(`[rotation/RotationService] 报告API Key使用结果: key=${apiKey.substring(0, 10)}..., success=${success}, errorType=${errorType}`);
    
    if (!this.isEnabled || !this.rotationManager) {
      console.log('[rotation/RotationService] 轮换服务未启用，跳过使用报告');
      return;
    }

    try {
      await this.rotationManager.reportKeyUsage(apiKey, success, errorType);
      console.log('[rotation/RotationService] API Key使用报告成功提交');
    } catch (error) {
      logger.error('Failed to report API key usage:', error);
      console.error('[rotation/RotationService] 提交API Key使用报告失败:', error);
    }
  }

  /**
   * 获取轮换状态
   */
  getStatus(): RotationStatus | null {
    if (!this.isEnabled || !this.rotationManager) {
      return null;
    }

    return this.rotationManager.getRotationStatus();
  }

  /**
   * 获取轮换状态信息
   */
  async getRotationStatus(): Promise<RotationStatus> {
    if (!this.rotationManager) {
      return {
        totalKeys: 0,
        activeKeys: 0,
        currentIndex: 0,
        failedKeys: 0,
        totalRequests: 0,
        strategy: 'none',
        isEnabled: false
      };
    }
    
    const status = this.rotationManager.getRotationStatus();
    return {
      ...status,
      isEnabled: true
    };
  }

  /**
   * 获取使用统计信息
   */
  async getUsageStats(): Promise<UsageStats> {
    if (!this.rotationManager) {
      return {
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        keyStats: {}
      };
    }
    
    return this.rotationManager.getUsageStats();
  }

  /**
   * 重置所有API Key状态
   */
  async resetAllKeys(): Promise<void> {
    if (!this.isEnabled || !this.rotationManager) {
      throw new Error('Rotation service is not enabled');
    }

    await this.rotationManager.resetAllKeys();
  }

  /**
   * 检查轮换服务是否启用
   */
  isRotationEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 检查是否启用了多账号模式
   */
  async isMultiAccountEnabled(): Promise<boolean> {
    return this.rotationManager !== null;
  }

  /**
   * 重置指定API Key的状态
   */
  async resetKeyStatus(apiKey: string): Promise<void> {
    if (!this.rotationManager) {
      throw new Error('轮换管理器未初始化');
    }
    
    // 注意：这里需要ApiKeyRotationManager实现resetKeyStatus方法
    // 暂时使用日志记录
    console.log(`重置API Key状态: ${apiKey}`);
  }

  /**
   * 生成状态报告
   */
  generateStatusReport(): string {
    if (!this.rotationManager) {
      return '轮换服务未初始化';
    }
    
    const status = this.rotationManager.getRotationStatus();
    const stats = this.rotationManager.getUsageStats();
    
    return `
=== API Key轮换状态报告 ===
总密钥数: ${status.totalKeys}
活跃密钥数: ${status.activeKeys}
当前密钥: ${status.currentKey || '无'}
上次轮换: ${status.lastRotation || '从未轮换'}

=== 使用统计 ===
总请求数: ${stats.totalRequests}
成功请求数: ${stats.successfulRequests}
失败请求数: ${stats.failedRequests}
成功率: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%
平均响应时间: ${stats.averageResponseTime}ms
    `.trim();
  }

  /**
   * 获取默认API Key
   */
  private getDefaultApiKey(): string {
    console.log('[rotation/RotationService] 尝试获取默认API Key (GEMINI_API_KEY)');
    
    // 输出配置文件位置和相关配置项信息
    const envFilePath = process.cwd() + '/.env';
    console.log(`[rotation/RotationService] 配置文件位置: ${envFilePath}`);
    console.log(`[rotation/RotationService] 关键配置项:`, {
      MULTI_ACCOUNT_ENABLED: process.env.MULTI_ACCOUNT_ENABLED,
      GEMINI_ROTATION_STRATEGY: process.env.GEMINI_ROTATION_STRATEGY,
      GEMINI_ENABLE_FALLBACK: process.env.GEMINI_ENABLE_FALLBACK,
      GEMINI_MAX_REQUESTS_PER_KEY: process.env.GEMINI_MAX_REQUESTS_PER_KEY,
      GEMINI_ROTATION_INTERVAL: process.env.GEMINI_ROTATION_INTERVAL,
      GEMINI_MAX_CONSECUTIVE_FAILURES: process.env.GEMINI_MAX_CONSECUTIVE_FAILURES,
      GEMINI_COOLDOWN_PERIOD: process.env.GEMINI_COOLDOWN_PERIOD,
      GEMINI_PERSISTENCE_FILE: process.env.GEMINI_PERSISTENCE_FILE,
      hasGEMINI_MULTI_ACCOUNTS: !!process.env.GEMINI_MULTI_ACCOUNTS,
      hasGEMINI_API_KEY: !!process.env.GEMINI_API_KEY
    });
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('[rotation/RotationService] 错误：GEMINI_API_KEY环境变量未设置');
      throw new Error('No API key available (GEMINI_API_KEY not set)');
    }
    
    console.log(`[rotation/RotationService] 成功获取默认API Key: ${apiKey.substring(0, 10)}...`);
    return apiKey;
  }

  /**
   * 创建轮换状态报告
   */
  async createStatusReport(): Promise<string> {
    if (!this.isEnabled) {
      return 'API Key rotation is disabled';
    }

    const status = this.getStatus();
    const stats = await this.getUsageStats();
    
    if (!status || !stats) {
      return 'Rotation service is not properly initialized';
    }

    const lines = [
      '=== API Key Rotation Status ===',
      `Strategy: ${status.strategy}`,
      `Total Keys: ${status.totalKeys}`,
      `Active Keys: ${status.activeKeys}`,
      `Failed Keys: ${status.failedKeys}`,
      `Current Index: ${status.currentIndex + 1}`,
      `Total Requests: ${status.totalRequests}`,
      '',
      '=== Usage Statistics ===',
      `Total Requests: ${stats.totalRequests}`,
      `Successful: ${stats.totalSuccesses}`,
      `Failed: ${stats.totalFailures}`,
      `Success Rate: ${stats.totalRequests > 0 ? ((stats.totalSuccesses / stats.totalRequests) * 100).toFixed(2) : 0}%`,
      '',
      '=== Key Details ==='
    ];

    // 修复keyStats的遍历方式，因为它现在是Record类型
    Object.entries(stats.keyStats).forEach(([keyName, keyData]) => {
      lines.push(`Key ${keyName}: (${keyData.requests} requests, ${keyData.successes} success, ${keyData.failures} failed)`);
      if (keyData.lastUsed) {
        lines.push(`  - Last used: ${keyData.lastUsed.toISOString()}`);
      }
    });

    return lines.join('\n');
  }
}