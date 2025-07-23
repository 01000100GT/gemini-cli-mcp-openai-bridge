/**
 * @license
 * Copyright 2025 Intelligent-Internet
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { logger } from '../utils/logger.js';

/**
 * 账号配置接口
 */
export interface AccountConfig {
  /** 账号唯一标识 */
  id: string;
  /** 账号显示名称 */
  name: string;
  /** 认证类型 */
  authType: AuthType;
  /** API Key (如果使用API Key认证) */
  apiKey?: string;
  /** Google Cloud项目ID (如果使用Vertex AI) */
  projectId?: string;
  /** 账号状态 */
  status: 'active' | 'quota_exceeded' | 'disabled';
  /** Pro模型使用次数 */
  proUsageCount: number;
  /** Pro模型配额限制 */
  proQuotaLimit: number;
  /** 最后使用时间 */
  lastUsedAt?: Date;
  /** 配额重置时间 */
  quotaResetAt?: Date;
}

/**
 * 多账号管理器配置
 */
export interface MultiAccountConfig {
  /** 账号列表 */
  accounts: AccountConfig[];
  /** 当前活跃账号ID */
  currentAccountId?: string;
  /** 是否启用Flash回退 */
  enableFlashFallback: boolean;
  /** Flash回退模型 */
  flashFallbackModel: string;
  /** Pro模型列表 */
  proModels: string[];
  /** 账号轮换策略 */
  rotationStrategy: 'round_robin' | 'least_used' | 'random';
}

/**
 * 多账号管理器类
 */
export class MultiAccountManager {
  private config: MultiAccountConfig;
  private currentAccountIndex: number = 0;

  constructor(config: MultiAccountConfig) {
    this.config = config;
    this.validateConfig();
    this.initializeCurrentAccount();
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.accounts || this.config.accounts.length === 0) {
      throw new Error('至少需要配置一个账号');
    }

    // 验证账号ID唯一性
    const accountIds = this.config.accounts.map(acc => acc.id);
    const uniqueIds = new Set(accountIds);
    if (accountIds.length !== uniqueIds.size) {
      throw new Error('账号ID必须唯一');
    }

    // 验证每个账号的配置
    for (const account of this.config.accounts) {
      if (!account.id || !account.name) {
        throw new Error('账号ID和名称不能为空');
      }
      if (account.authType === AuthType.USE_GEMINI && !account.apiKey) {
        throw new Error(`账号 ${account.name} 使用API Key认证但未提供API Key`);
      }
      if (account.authType === AuthType.USE_VERTEX_AI && !account.projectId) {
        throw new Error(`账号 ${account.name} 使用Vertex AI认证但未提供项目ID`);
      }
    }
  }

  /**
   * 初始化当前账号
   */
  private initializeCurrentAccount(): void {
    if (this.config.currentAccountId) {
      const index = this.config.accounts.findIndex(
        acc => acc.id === this.config.currentAccountId
      );
      if (index !== -1) {
        this.currentAccountIndex = index;
        return;
      }
    }
    
    // 找到第一个可用的账号
    const availableIndex = this.config.accounts.findIndex(
      acc => acc.status === 'active'
    );
    this.currentAccountIndex = availableIndex !== -1 ? availableIndex : 0;
  }

  /**
   * 获取当前账号
   */
  getCurrentAccount(): AccountConfig {
    return this.config.accounts[this.currentAccountIndex];
  }

  /**
   * 获取所有账号
   */
  getAllAccounts(): AccountConfig[] {
    return [...this.config.accounts];
  }

  /**
   * 检查当前账号是否可以使用Pro模型
   */
  canUseProModel(model: string): boolean {
    const currentAccount = this.getCurrentAccount();
    
    // 检查是否是Pro模型
    if (!this.config.proModels.includes(model)) {
      return true; // 非Pro模型可以使用
    }

    // 检查账号状态
    if (currentAccount.status !== 'active') {
      return false;
    }

    // 检查配额
    if (currentAccount.proUsageCount >= currentAccount.proQuotaLimit) {
      return false;
    }

    return true;
  }

  /**
   * 记录Pro模型使用
   */
  recordProModelUsage(model: string): void {
    if (!this.config.proModels.includes(model)) {
      return; // 非Pro模型不记录
    }

    const currentAccount = this.getCurrentAccount();
    currentAccount.proUsageCount++;
    currentAccount.lastUsedAt = new Date();

    logger.info(`账号 ${currentAccount.name} Pro模型使用次数: ${currentAccount.proUsageCount}/${currentAccount.proQuotaLimit}`);

    // 检查是否达到配额限制
    if (currentAccount.proUsageCount >= currentAccount.proQuotaLimit) {
      currentAccount.status = 'quota_exceeded';
      logger.warn(`账号 ${currentAccount.name} Pro模型配额已用完`);
    }
  }

  /**
   * 根据轮换策略切换到下一个账号（每次请求前调用）
   */
  rotateToNextAccount(): AccountConfig {
    // 根据轮换策略选择下一个账号
    this.currentAccountIndex = this.getNextAccountIndex();
    const account = this.config.accounts[this.currentAccountIndex];
    this.config.currentAccountId = account.id;
    
    logger.info(`🔄 轮换到账号: ${account.name} (${account.id})`);
    return account;
  }

  /**
   * 切换到下一个可用账号（配额用完时调用）
   */
  switchToNextAccount(): AccountConfig | null {
    const startIndex = this.currentAccountIndex;
    let attempts = 0;
    const maxAttempts = this.config.accounts.length;

    while (attempts < maxAttempts) {
      // 根据轮换策略选择下一个账号
      this.currentAccountIndex = this.getNextAccountIndex();
      const account = this.config.accounts[this.currentAccountIndex];

      if (account.status === 'active' && this.canUseProModel('gemini-2.5-pro')) {
        this.config.currentAccountId = account.id;
        logger.info(`切换到账号: ${account.name}`);
        return account;
      }

      attempts++;
    }

    // 没有找到可用账号
    this.currentAccountIndex = startIndex;
    return null;
  }

  /**
   * 根据轮换策略获取下一个账号索引
   */
  private getNextAccountIndex(): number {
    switch (this.config.rotationStrategy) {
      case 'round_robin':
        return (this.currentAccountIndex + 1) % this.config.accounts.length;
      
      case 'least_used':
        // 找到使用次数最少的账号
        let minUsage = Infinity;
        let minIndex = 0;
        for (let i = 0; i < this.config.accounts.length; i++) {
          const account = this.config.accounts[i];
          if (account.status === 'active' && account.proUsageCount < minUsage) {
            minUsage = account.proUsageCount;
            minIndex = i;
          }
        }
        return minIndex;
      
      case 'random':
        const activeAccounts = this.config.accounts
          .map((acc, index) => ({ account: acc, index }))
          .filter(item => item.account.status === 'active');
        if (activeAccounts.length === 0) {
          return this.currentAccountIndex;
        }
        const randomItem = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];
        return randomItem.index;
      
      default:
        return (this.currentAccountIndex + 1) % this.config.accounts.length;
    }
  }

  /**
   * 重置账号配额
   */
  resetAccountQuota(accountId: string): void {
    const account = this.config.accounts.find(acc => acc.id === accountId);
    if (account) {
      account.proUsageCount = 0;
      account.status = 'active';
      account.quotaResetAt = new Date();
      logger.info(`账号 ${account.name} 配额已重置`);
    }
  }

  /**
   * 重置所有账号配额
   */
  resetAllAccountsQuota(): void {
    for (const account of this.config.accounts) {
      account.proUsageCount = 0;
      if (account.status === 'quota_exceeded') {
        account.status = 'active';
      }
      account.quotaResetAt = new Date();
    }
    logger.info('所有账号配额已重置');
  }

  /**
   * 获取账号统计信息
   */
  getAccountStats(): {
    totalAccounts: number;
    activeAccounts: number;
    quotaExceededAccounts: number;
    totalProUsage: number;
    totalProQuota: number;
  } {
    const stats = {
      totalAccounts: this.config.accounts.length,
      activeAccounts: 0,
      quotaExceededAccounts: 0,
      totalProUsage: 0,
      totalProQuota: 0,
    };

    for (const account of this.config.accounts) {
      if (account.status === 'active') {
        stats.activeAccounts++;
      } else if (account.status === 'quota_exceeded') {
        stats.quotaExceededAccounts++;
      }
      stats.totalProUsage += account.proUsageCount;
      stats.totalProQuota += account.proQuotaLimit;
    }

    return stats;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<MultiAccountConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
  }

  /**
   * 导出配置
   */
  exportConfig(): MultiAccountConfig {
    return JSON.parse(JSON.stringify(this.config));
  }
}

/**
 * 创建默认的多账号配置
 */
export function createDefaultMultiAccountConfig(): MultiAccountConfig {
  return {
    accounts: [],
    enableFlashFallback: true,
    flashFallbackModel: 'gemini-2.5-flash',
    proModels: ['gemini-2.5-pro', 'gemini-1.5-pro'],
    rotationStrategy: 'round_robin',
  };
}

/**
 * 替换字符串中的环境变量引用
 * 支持 ${VAR_NAME} 格式的环境变量引用
 */
function replaceEnvVariables(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger.warn(`环境变量 ${varName} 未定义，保持原值: ${match}`);
      return match;
    }
    return envValue;
  });
}

/**
 * 递归替换对象中的环境变量引用
 */
function replaceEnvVariablesInObject(obj: any): any {
  if (typeof obj === 'string') {
    return replaceEnvVariables(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(item => replaceEnvVariablesInObject(item));
  } else if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVariablesInObject(value);
    }
    return result;
  }
  return obj;
}

/**
 * 从配置文件加载多账号配置，支持环境变量替换
 */
export async function loadMultiAccountConfigFromFile(configPath: string): Promise<MultiAccountConfig> {
  try {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    
    const fullPath = resolve(configPath);
    if (!existsSync(fullPath)) {
      logger.error(`配置文件不存在: ${fullPath}`);
      return createDefaultMultiAccountConfig();
    }
    
    const configContent = readFileSync(fullPath, 'utf-8');
    const rawConfig = JSON.parse(configContent);
    
    // 替换环境变量引用
    const processedConfig = replaceEnvVariablesInObject(rawConfig);
    
    logger.info(`✅ 从配置文件加载多账号配置成功: ${fullPath}`);
    logger.info(`配置内容: ${JSON.stringify(processedConfig, null, 2)}`);
    
    return processedConfig;
  } catch (error) {
    logger.error(`加载配置文件失败: ${error instanceof Error ? error.message : String(error)}`);
    return createDefaultMultiAccountConfig();
  }
}

/**
 * 从环境变量加载多账号配置
 */
export function loadMultiAccountConfigFromEnv(): MultiAccountConfig {
  const config = createDefaultMultiAccountConfig();
  
  // 从环境变量加载账号配置
  const accountsEnv = process.env.GEMINI_MULTI_ACCOUNTS;
  if (accountsEnv) {
    try {
      const accountsData = JSON.parse(accountsEnv);
      if (Array.isArray(accountsData)) {
        config.accounts = accountsData.map((acc, index) => ({
          id: acc.id || `account_${index}`,
          name: acc.name || `Account ${index + 1}`,
          authType: acc.authType || AuthType.USE_GEMINI,
          apiKey: acc.apiKey,
          projectId: acc.projectId,
          status: acc.status || 'active',
          proUsageCount: acc.proUsageCount || 0,
          proQuotaLimit: acc.proQuotaLimit || 50, // 默认50次
          lastUsedAt: acc.lastUsedAt ? new Date(acc.lastUsedAt) : undefined,
          quotaResetAt: acc.quotaResetAt ? new Date(acc.quotaResetAt) : undefined,
        }));
      }
    } catch (error) {
      logger.error('解析多账号配置失败:', error);
    }
  }

  // 其他配置项
  if (process.env.GEMINI_FLASH_FALLBACK_MODEL) {
    config.flashFallbackModel = process.env.GEMINI_FLASH_FALLBACK_MODEL;
  }
  
  if (process.env.GEMINI_ROTATION_STRATEGY) {
    const strategy = process.env.GEMINI_ROTATION_STRATEGY as 'round_robin' | 'least_used' | 'random';
    if (['round_robin', 'least_used', 'random'].includes(strategy)) {
      config.rotationStrategy = strategy;
    }
  }

  if (process.env.GEMINI_ENABLE_FLASH_FALLBACK === 'false') {
    config.enableFlashFallback = false;
  }

  return config;
}