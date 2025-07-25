/**
 * API Key轮换管理器
 * 负责管理多个API Key的轮换、状态跟踪和故障恢复
 */

import { logger } from '../utils/logger.js';
import { PersistenceService } from './PersistenceService.js';
import {
  type ApiKeyInfo,
  type RotationConfig,
  type RotationStatus,
  type UsageStats,
  type PersistenceData,
  type MultiAccountConfig
} from './types.js';

export class ApiKeyRotationManager {
  private keys: ApiKeyInfo[] = [];
  private currentIndex = 0;
  private totalRequests = 0;
  private config: RotationConfig;
  private persistence: PersistenceService;
  private debugMode: boolean;

  constructor(config: RotationConfig, debugMode = false) {
    this.config = config;
    this.debugMode = debugMode;
    this.persistence = new PersistenceService(config.persistenceFile);
  }

  /**
   * 初始化轮换管理器
   */
  async initialize(): Promise<void> {
    console.log('[rotation/ApiKeyRotationManager] 开始初始化轮换管理器');
    try {
      // 加载持久化数据
      console.log('[rotation/ApiKeyRotationManager] 加载持久化数据');
      const persistedData = await this.loadPersistedData();
      console.log(`[rotation/ApiKeyRotationManager] 持久化数据加载结果: ${persistedData ? '成功' : '无数据'}`);
      
      // 初始化API Keys
      console.log('[rotation/ApiKeyRotationManager] 初始化API Keys');
      this.initializeApiKeys();
      
      // 恢复状态
      if (persistedData) {
        console.log('[rotation/ApiKeyRotationManager] 恢复之前保存的状态');
        this.restoreState(persistedData);
      }
      
      // 验证API Keys
      console.log('[rotation/ApiKeyRotationManager] 验证API Keys');
      await this.validateApiKeys();
      
      // 修复：初始化完成后立即保存状态，确保创建持久化文件
      console.log('[rotation/ApiKeyRotationManager] 初始化完成后保存初始状态');
      await this.saveState();
      
      logger.info(`API Key rotation initialized with ${this.keys.length} keys`);
      console.log(`[rotation/ApiKeyRotationManager] 轮换管理器初始化完成，共${this.keys.length}个API Key`);
      logger.debug(this.debugMode, 'Rotation config:', this.config);
    } catch (error) {
      logger.error('Failed to initialize API Key rotation:', error);
      console.error('[rotation/ApiKeyRotationManager] 初始化轮换管理器失败:', error);
      throw error;
    }
  }

  /**
   * 获取下一个可用的API Key
   */
  async getNextApiKey(): Promise<string> {
    console.log(`[rotation/ApiKeyRotationManager] 请求获取下一个API Key，当前索引: ${this.currentIndex}`);
    
    if (this.keys.length === 0) {
      console.error('[rotation/ApiKeyRotationManager] 错误：没有可用的API Key');
      throw new Error('No API keys available');
    }

    const startIndex = this.currentIndex;
    let attempts = 0;
    const maxAttempts = this.keys.length;
    console.log(`[rotation/ApiKeyRotationManager] 开始轮换查找，最大尝试次数: ${maxAttempts}`);

    while (attempts < maxAttempts) {
      const currentKey = this.keys[this.currentIndex];
      console.log(`[rotation/ApiKeyRotationManager] 尝试第${attempts + 1}次，检查索引${this.currentIndex}的Key状态: ${currentKey.status}`);
      
      // 检查当前Key是否可用
      if (this.isKeyAvailable(currentKey)) {
        console.log(`[rotation/ApiKeyRotationManager] Key ${this.currentIndex + 1}/${this.keys.length} 可用，开始使用`);
        
        // 更新使用统计
        this.updateKeyUsage(currentKey);
        
        // 保存状态
        await this.saveState();
        
        logger.debug(this.debugMode, `Using API key ${this.currentIndex + 1}/${this.keys.length}`);
        console.log(`[rotation/ApiKeyRotationManager] 成功获取API Key: ${currentKey.key.substring(0, 10)}...`);
        
        return currentKey.key;
      }
      
      // 移动到下一个Key
      console.log(`[rotation/ApiKeyRotationManager] Key ${this.currentIndex + 1} 不可用，移动到下一个`);
      this.moveToNextKey();
      attempts++;
    }

    console.error('[rotation/ApiKeyRotationManager] 错误：所有API Key都不可用');
    throw new Error('No available API keys found');
  }

  /**
   * 报告API Key使用结果
   */
  async reportKeyUsage(apiKey: string, success: boolean, errorType?: string): Promise<void> {
    console.log(`[rotation/ApiKeyRotationManager] 报告API Key使用结果: key=${apiKey.substring(0, 10)}..., success=${success}, errorType=${errorType}`);
    
    const keyInfo = this.keys.find(k => k.key === apiKey);
    if (!keyInfo) {
      logger.warn('Attempted to report usage for unknown API key');
      console.warn(`[rotation/ApiKeyRotationManager] 警告：尝试报告未知API Key的使用结果: ${apiKey.substring(0, 10)}...`);
      return;
    }

    const keyIndex = this.getKeyIndex(keyInfo) + 1;
    
    if (success) {
      console.log(`[rotation/ApiKeyRotationManager] Key ${keyIndex} 使用成功，更新统计信息`);
      keyInfo.successCount++;
      keyInfo.lastSuccess = new Date();
      keyInfo.consecutiveFailures = 0;
      
      // 如果之前被标记为失败，现在恢复
      if (keyInfo.status === 'failed') {
        keyInfo.status = 'active';
        logger.info(`API key ${keyIndex} recovered`);
        console.log(`[rotation/ApiKeyRotationManager] Key ${keyIndex} 从失败状态恢复为活跃状态`);
      }
    } else {
      console.log(`[rotation/ApiKeyRotationManager] Key ${keyIndex} 使用失败，连续失败次数: ${keyInfo.consecutiveFailures + 1}`);
      keyInfo.failureCount++;
      keyInfo.lastFailure = new Date();
      keyInfo.consecutiveFailures++;
      keyInfo.lastError = errorType;
      
      // 检查是否需要暂时禁用这个Key
      if (keyInfo.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        keyInfo.status = 'failed';
        keyInfo.cooldownUntil = new Date(Date.now() + this.config.cooldownPeriod);
        logger.warn(`API key ${keyIndex} disabled due to consecutive failures`);
        console.warn(`[rotation/ApiKeyRotationManager] Key ${keyIndex} 因连续失败被禁用，冷却时间: ${this.config.cooldownPeriod}ms`);
      }
    }

    await this.saveState();
    console.log(`[rotation/ApiKeyRotationManager] Key ${keyIndex} 使用报告处理完成`);
  }

  /**
   * 获取轮换状态
   */
  getRotationStatus(): RotationStatus {
    return {
      totalKeys: this.keys.length,
      currentIndex: this.currentIndex,
      activeKeys: this.keys.filter(k => k.status === 'active').length,
      failedKeys: this.keys.filter(k => k.status === 'failed').length,
      totalRequests: this.totalRequests,
      strategy: this.config.strategy,
      isEnabled: true
    };
  }

  /**
   * 获取使用统计
   */
  getUsageStats(): UsageStats {
    const now = new Date();
    const totalSuccesses = this.keys.reduce((sum, k) => sum + k.successCount, 0);
    const totalFailures = this.keys.reduce((sum, k) => sum + k.failureCount, 0);
    
    const stats: UsageStats = {
      totalRequests: this.totalRequests,
      totalSuccesses,
      totalFailures,
      successfulRequests: totalSuccesses,
      failedRequests: totalFailures,
      averageResponseTime: 0,
      keyStats: this.keys.reduce((acc, key, index) => {
        acc[`key_${index}`] = {
          requests: key.requestCount,
          successes: key.successCount,
          failures: key.failureCount,
          lastUsed: key.lastUsed || new Date()
        };
        return acc;
      }, {} as Record<string, { requests: number; successes: number; failures: number; lastUsed: Date; }>)
    };

    return stats;
  }

  /**
   * 重置所有API Key状态
   */
  async resetAllKeys(): Promise<void> {
    this.keys.forEach(key => {
      key.status = 'active';
      key.consecutiveFailures = 0;
      key.cooldownUntil = undefined;
      key.lastError = undefined;
    });
    
    await this.saveState();
    logger.info('Reset all API key statuses');
  }

  /**
   * 从环境变量初始化API Keys
   */
  private initializeApiKeys(): void {
    console.log('[rotation/ApiKeyRotationManager] 开始初始化API Keys');
    this.keys = [];
    
    if (this.config.multiAccount) {
      console.log(`[rotation/ApiKeyRotationManager] 使用多账号配置，账号数量: ${this.config.multiAccount.accounts.length}`);
      // 多账号配置
      this.config.multiAccount.accounts.forEach((account, index) => {
        console.log(`[rotation/ApiKeyRotationManager] 初始化第${index + 1}个API Key: ${account.apiKey.substring(0, 10)}...`);
        this.keys.push({
          key: account.apiKey,
          status: 'active',
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
          consecutiveFailures: 0,
          lastUsed: undefined,
          lastSuccess: undefined,
          lastFailure: undefined,
          cooldownUntil: undefined,
          lastError: undefined
        });
      });
    }
    
    if (this.keys.length === 0) {
      console.error('[rotation/ApiKeyRotationManager] 错误：没有配置API Key');
      throw new Error('No API keys configured');
    }
    
    logger.info(`Initialized ${this.keys.length} API keys`);
    console.log(`[rotation/ApiKeyRotationManager] API Keys初始化完成，共${this.keys.length}个Key`);
  }

  /**
   * 检查API Key是否可用
   */
  private isKeyAvailable(key: ApiKeyInfo): boolean {
    if (key.status === 'failed') {
      // 检查冷却期是否结束
      if (key.cooldownUntil && new Date() < key.cooldownUntil) {
        return false;
      }
      // 冷却期结束，重置状态
      key.status = 'active';
      key.cooldownUntil = undefined;
      logger.info(`API key ${this.getKeyIndex(key) + 1} cooldown period ended`);
    }
    
    return key.status === 'active';
  }

  /**
   * 更新Key使用统计
   */
  private updateKeyUsage(key: ApiKeyInfo): void {
    key.requestCount++;
    key.lastUsed = new Date();
    this.totalRequests++;
  }

  /**
   * 移动到下一个Key
   */
  private moveToNextKey(): void {
    switch (this.config.strategy) {
      case 'round-robin':
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        break;
      case 'random':
        this.currentIndex = Math.floor(Math.random() * this.keys.length);
        break;
      case 'least-used':
        this.currentIndex = this.findLeastUsedKeyIndex();
        break;
      default:
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    }
  }

  /**
   * 找到使用次数最少的Key索引
   */
  private findLeastUsedKeyIndex(): number {
    let minUsage = Infinity;
    let minIndex = 0;
    
    this.keys.forEach((key, index) => {
      if (key.status === 'active' && key.requestCount < minUsage) {
        minUsage = key.requestCount;
        minIndex = index;
      }
    });
    
    return minIndex;
  }

  /**
   * 获取Key的索引
   */
  private getKeyIndex(key: ApiKeyInfo): number {
    return this.keys.indexOf(key);
  }

  /**
   * 验证API Keys
   */
  private async validateApiKeys(): Promise<void> {
    // 这里可以添加API Key验证逻辑
    // 例如发送测试请求验证Key的有效性
    logger.debug(this.debugMode, 'API key validation completed');
  }

  /**
   * 加载持久化数据
   */
  private async loadPersistedData(): Promise<PersistenceData | null> {
    try {
      return await this.persistence.loadData();
    } catch (error) {
      logger.error('Failed to load persisted data:', error);
      return null;
    }
  }

  /**
   * 恢复状态
   */
  private restoreState(data: PersistenceData): void {
    if (data.keys.length === this.keys.length) {
      // 恢复Key状态
      data.keys.forEach((persistedKey, index) => {
        if (index < this.keys.length) {
          Object.assign(this.keys[index], persistedKey, {
            // 保持当前的API Key值
            key: this.keys[index].key
          });
        }
      });
      
      this.currentIndex = data.currentIndex;
      this.totalRequests = data.totalRequests;
      
      logger.info('Restored API key rotation state from persistence');
    } else {
      logger.warn('Persisted data key count mismatch, starting fresh');
    }
  }

  /**
   * 保存状态
   */
  private async saveState(): Promise<void> {
    console.log('[DEBUG] /rotation/ApiKeyRotationManager.ts - saveState: 开始保存轮换状态');
    try {
      const data: PersistenceData = {
         currentIndex: this.currentIndex,
         lastUsedTime: new Date().toISOString(), // 添加缺失的lastUsedTime属性
         totalRequests: this.totalRequests,
         keys: this.keys.map(key => ({ ...key }))
       };
      
      console.log('[DEBUG] /rotation/ApiKeyRotationManager.ts - saveState: 准备保存的数据', {
        currentIndex: data.currentIndex,
        totalRequests: data.totalRequests,
        keysCount: data.keys.length,
        persistenceFile: this.config.persistenceFile
      });
      
      await this.persistence.saveData(data);
      console.log('[DEBUG] /rotation/ApiKeyRotationManager.ts - saveState: 轮换状态保存成功');
    } catch (error) {
      console.error('[DEBUG] /rotation/ApiKeyRotationManager.ts - saveState: 保存轮换状态失败', error);
      logger.error('Failed to save rotation state:', error);
    }
  }
}