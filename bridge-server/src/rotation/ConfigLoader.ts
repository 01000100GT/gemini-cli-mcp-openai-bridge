/**
 * 配置加载器 - 负责从环境变量和配置文件加载多账号配置
 */

import { logger } from '../utils/logger.js';
import { type RotationConfig, type MultiAccountConfig } from './types.js';
import { type FallbackConfig } from '../types/fallback.js';

export class ConfigLoader {
  private debugMode: boolean;

  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }

  /**
   * 加载轮换配置
   */
  loadRotationConfig(): RotationConfig {
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadRotationConfig: 开始加载轮换配置');
    const multiAccount = this.loadMultiAccountConfig();
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadRotationConfig: 多账号配置加载完成', { hasMultiAccount: !!multiAccount, accountCount: multiAccount?.accounts.length || 0 });
    
    const config: RotationConfig = {
      strategy: this.getRotationStrategy(),
      maxRequestsPerKey: this.getMaxRequestsPerKey(),
      rotationInterval: this.getRotationInterval(),
      enableFallback: this.getEnableFallback(),
      maxConsecutiveFailures: this.getMaxConsecutiveFailures(),
      cooldownPeriod: this.getCooldownPeriod(),
      persistenceFile: this.getPersistenceFile(),
      multiAccount
    };

    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadRotationConfig: 轮换配置构建完成', {
      strategy: config.strategy,
      accountCount: multiAccount?.accounts.length || 0,
      enableFallback: config.enableFallback,
      maxRequestsPerKey: config.maxRequestsPerKey,
      rotationInterval: config.rotationInterval
    });

    logger.debug(this.debugMode, 'Loaded rotation config:', {
      strategy: config.strategy,
      accountCount: multiAccount?.accounts.length || 0,
      enableFallback: config.enableFallback
    });

    return config;
  }

  /**
   * 检查是否启用多账号模式
   */
  isMultiAccountEnabled(): boolean {
    const enabled = process.env.MULTI_ACCOUNT_ENABLED === 'true';
    const hasMultiAccounts = !!process.env.GEMINI_MULTI_ACCOUNTS;
    const hasIndividualKeys = this.hasIndividualApiKeys();
    
    console.log('[DEBUG] /rotation/ConfigLoader.ts - isMultiAccountEnabled: 检查多账号模式', {
      enabled,
      hasMultiAccounts,
      hasIndividualKeys,
      result: enabled && (hasMultiAccounts || hasIndividualKeys)
    });
    
    return enabled && (hasMultiAccounts || hasIndividualKeys);
  }

  /**
   * 加载多账号配置
   */
  private loadMultiAccountConfig(): MultiAccountConfig | undefined {
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: 开始加载多账号配置');
    if (!this.isMultiAccountEnabled()) {
      console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: 多账号模式未启用，返回undefined');
      return undefined;
    }

    // 优先从 GEMINI_MULTI_ACCOUNTS 加载
    const multiAccountsJson = process.env.GEMINI_MULTI_ACCOUNTS;
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: 检查GEMINI_MULTI_ACCOUNTS环境变量', { hasJson: !!multiAccountsJson });
    if (multiAccountsJson) {
      try {
        console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: 解析GEMINI_MULTI_ACCOUNTS JSON');
        const parsed = JSON.parse(multiAccountsJson);
        const config = this.validateMultiAccountConfig(parsed);
        console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: JSON配置验证成功', { accountCount: config.accounts.length });
        return config;
      } catch (error) {
        console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: JSON解析失败', error);
        logger.error('Failed to parse GEMINI_MULTI_ACCOUNTS:', error);
      }
    }

    // 从单独的环境变量加载
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: 尝试从单独环境变量加载');
    const config = this.loadFromIndividualEnvVars();
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadMultiAccountConfig: 单独环境变量加载完成', { hasConfig: !!config, accountCount: config?.accounts.length || 0 });
    return config;
  }

  /**
   * 从单独的环境变量加载配置
   */
  private loadFromIndividualEnvVars(): MultiAccountConfig | undefined {
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadFromIndividualEnvVars: 开始从单独环境变量加载账号');
    const accounts = [];
    let index = 1;
    
    while (true) {
      const apiKey = process.env[`ACCOUNT_${index}_API_KEY`];
      console.log(`[DEBUG] /rotation/ConfigLoader.ts - loadFromIndividualEnvVars: 检查ACCOUNT_${index}_API_KEY`, { hasKey: !!apiKey });
      if (!apiKey) {
        break;
      }
      
      const account = {
        id: `account_${index}`,
        name: process.env[`ACCOUNT_${index}_NAME`] || `Account ${index}`,
        apiKey,
        quota: this.parseQuota(process.env[`ACCOUNT_${index}_QUOTA`]),
        status: (process.env[`ACCOUNT_${index}_STATUS`] as any) || 'active'
      };
      
      console.log(`[DEBUG] /rotation/ConfigLoader.ts - loadFromIndividualEnvVars: 添加账号${index}`, { id: account.id, name: account.name, status: account.status });
      accounts.push(account);
      
      index++;
    }
    
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadFromIndividualEnvVars: 环境变量扫描完成', { totalAccounts: accounts.length });
    
    if (accounts.length === 0) {
      console.log('[DEBUG] /rotation/ConfigLoader.ts - loadFromIndividualEnvVars: 未找到任何账号，返回undefined');
      return undefined;
    }
    
    const config = {
      enabled: true,
      accounts,
      fallbackModel: process.env.GEMINI_FLASH_FALLBACK_MODEL || 'gemini-1.5-flash'
    };
    
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadFromIndividualEnvVars: 多账号配置构建完成', { accountCount: config.accounts.length, fallbackModel: config.fallbackModel });
    
    return config;
  }

  /**
   * 验证多账号配置
   */
  private validateMultiAccountConfig(config: any): MultiAccountConfig {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid multi-account configuration');
    }
    
    if (!Array.isArray(config.accounts)) {
      throw new Error('Multi-account configuration must have accounts array');
    }
    
    const validatedAccounts = config.accounts.map((account: any, index: number) => {
      if (!account.apiKey) {
        throw new Error(`Account ${index + 1} missing API key`);
      }
      
      return {
        id: account.id || `account_${index + 1}`,
        name: account.name || `Account ${index + 1}`,
        apiKey: account.apiKey,
        quota: this.parseQuota(account.quota),
        status: account.status || 'active'
      };
    });
    
    return {
      enabled: config.enabled !== false,
      accounts: validatedAccounts,
      fallbackModel: config.fallbackModel || 'gemini-1.5-flash'
    };
  }

  /**
   * 解析配额配置
   */
  private parseQuota(quotaStr: string | undefined): { daily?: number; monthly?: number } {
    if (!quotaStr) {
      return {};
    }
    
    try {
      if (typeof quotaStr === 'string') {
        return JSON.parse(quotaStr);
      }
      return quotaStr;
    } catch {
      // 尝试解析为数字（日配额）
      const num = parseInt(quotaStr, 10);
      if (!isNaN(num)) {
        return { daily: num };
      }
      return {};
    }
  }

  /**
   * 检查是否有单独的API Key环境变量
   */
  private hasIndividualApiKeys(): boolean {
    return !!process.env.ACCOUNT_1_API_KEY;
  }

  /**
   * 获取轮换策略
   */
  private getRotationStrategy(): 'round-robin' | 'random' | 'least-used' {
    const strategy = process.env.GEMINI_ROTATION_STRATEGY;
    if (strategy === 'random' || strategy === 'least-used') {
      return strategy;
    }
    return 'round-robin';
  }

  /**
   * 获取单个Key最大请求数
   */
  private getMaxRequestsPerKey(): number | undefined {
    const value = process.env.GEMINI_MAX_REQUESTS_PER_KEY;
    return value ? parseInt(value, 10) : undefined;
  }

  /**
   * 获取轮换间隔
   */
  private getRotationInterval(): number | undefined {
    const value = process.env.GEMINI_ROTATION_INTERVAL;
    return value ? parseInt(value, 10) : undefined;
  }

  /**
   * 获取是否启用回退
   */
  private getEnableFallback(): boolean {
    return process.env.GEMINI_ENABLE_FALLBACK !== 'false';
  }

  /**
   * 获取最大连续失败次数
   */
  private getMaxConsecutiveFailures(): number {
    const value = process.env.GEMINI_MAX_CONSECUTIVE_FAILURES;
    return value ? parseInt(value, 10) : 3;
  }

  /**
   * 获取冷却期（毫秒）
   */
  private getCooldownPeriod(): number {
    const value = process.env.GEMINI_COOLDOWN_PERIOD;
    return value ? parseInt(value, 10) : 300000; // 默认5分钟
  }

  /**
   * 获取持久化文件路径
   */
  private getPersistenceFile(): string {
    return process.env.GEMINI_PERSISTENCE_FILE || '.gemini/api-keys-usage.json';
  }

  /**
   * 加载回退模型配置
   */
  loadFallbackConfig(): FallbackConfig {
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadFallbackConfig: 开始加载回退模型配置');
    
    const config: FallbackConfig = {
      enabled: this.getFallbackEnabled(),
      primaryModel: this.getPrimaryModel(),
      fallbackModel: this.getFallbackModel(),
      triggerConditions: this.getTriggerConditions(),
      maxRetries: this.getMaxRetries(),
      retryDelay: this.getRetryDelay(),
      cooldownMinutes: this.getFallbackCooldownMinutes(),
      autoResetEnabled: this.getAutoResetEnabled(),
      autoResetDelay: this.getAutoResetDelay(),
      persistenceEnabled: this.getFallbackPersistenceEnabled()
    };
    
    console.log('[DEBUG] /rotation/ConfigLoader.ts - loadFallbackConfig: 回退模型配置加载完成', {
      enabled: config.enabled,
      primaryModel: config.primaryModel,
      fallbackModel: config.fallbackModel,
      maxRetries: config.maxRetries
    });
    
    return config;
  }

  /**
   * 获取回退功能是否启用
   */
  private getFallbackEnabled(): boolean {
    const value = process.env.GEMINI_FALLBACK_ENABLED;
    if (value === undefined) {
      return true; // 默认启用
    }
    return value.toLowerCase() !== 'false';
  }

  /**
   * 获取主模型
   */
  private getPrimaryModel(): string {
    return process.env.GEMINI_MODEL || process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-pro';
  }

  /**
   * 获取回退模型
   */
  private getFallbackModel(): string {
    return process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
  }

  /**
   * 获取触发条件
   */
  private getTriggerConditions(): string[] {
    const conditions = process.env.GEMINI_FALLBACK_TRIGGERS;
    if (conditions) {
      return conditions.split(',').map(c => c.trim());
    }
    // 默认触发条件
    return ['quota_exceeded', 'rate_limit', 'server_error'];
  }

  /**
   * 获取最大重试次数
   */
  private getMaxRetries(): number {
    const value = process.env.GEMINI_FALLBACK_MAX_RETRIES;
    return value ? parseInt(value, 10) : 3;
  }

  /**
   * 获取重试延迟（毫秒）
   */
  private getRetryDelay(): number {
    const value = process.env.GEMINI_FALLBACK_RETRY_DELAY;
    return value ? parseInt(value, 10) : 1000; // 默认1秒
  }

  /**
   * 获取回退冷却时间（分钟）
   */
  private getFallbackCooldownMinutes(): number {
    const cooldown = process.env.GEMINI_FALLBACK_COOLDOWN_MINUTES;
    return cooldown ? parseInt(cooldown, 10) : 5; // 默认5分钟
  }

  /**
   * 获取自动重置是否启用
   */
  private getAutoResetEnabled(): boolean {
    const value = process.env.GEMINI_FALLBACK_AUTO_RESET;
    if (value === undefined) {
      return true; // 默认启用自动重置
    }
    return value.toLowerCase() !== 'false';
  }

  /**
   * 获取自动重置延迟（毫秒）
   */
  private getAutoResetDelay(): number {
    const value = process.env.GEMINI_FALLBACK_AUTO_RESET_DELAY;
    return value ? parseInt(value, 10) : 300000; // 默认5分钟
  }

  /**
   * 获取回退持久化是否启用
   */
  private getFallbackPersistenceEnabled(): boolean {
    const value = process.env.GEMINI_FALLBACK_PERSISTENCE_ENABLED;
    if (value === undefined) {
      return true; // 默认启用持久化
    }
    return value.toLowerCase() !== 'false';
  }

  /**
   * 获取回退持久化文件路径
   */
  getFallbackPersistenceFile(): string {
    return process.env.GEMINI_FALLBACK_PERSISTENCE_FILE || '.gemini/fallback-state.json';
  }
}