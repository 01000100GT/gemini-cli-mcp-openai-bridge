/**
 * @license
 * Copyright 2025 Intelligent-Internet
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, AuthType, FlashFallbackHandler } from '@google/gemini-cli-core';
import { MultiAccountManager, MultiAccountConfig, AccountConfig, loadMultiAccountConfigFromEnv } from './multiAccountManager.js';
import { logger } from '../utils/logger.js';

/**
 * 增强的Config类，支持多账号管理
 */
export class EnhancedConfig extends Config {
  private multiAccountManager?: MultiAccountManager;
  private originalFlashFallbackHandler?: FlashFallbackHandler;

  /**
   * 初始化多账号管理
   */
  initializeMultiAccountManager(config?: MultiAccountConfig): void {
    const finalConfig = config || loadMultiAccountConfigFromEnv();
    
    if (finalConfig.accounts.length === 0) {
      logger.info('未配置多账号，使用单账号模式');
      return;
    }

    this.multiAccountManager = new MultiAccountManager(finalConfig);
    logger.info(`多账号管理器已初始化，共 ${finalConfig.accounts.length} 个账号`);
    
    // 显示账号详细信息
    logger.info('📋 账号列表:');
    finalConfig.accounts.forEach((account, index) => {
      const statusIcon = account.status === 'active' ? '✅' : 
                        account.status === 'quota_exceeded' ? '⚠️' : '❌';
      logger.info(`  ${index + 1}. ${statusIcon} ${account.name} (${account.id}) - ${account.authType}`);
      logger.info(`     配额: ${account.proUsageCount}/${account.proQuotaLimit}`);
    });
    
    // 显示当前账号信息
    const currentAccount = this.multiAccountManager.getCurrentAccount();
    logger.info(`🎯 当前活跃账号: ${currentAccount.name} (${currentAccount.id})`);
    
    // 显示配置信息
    logger.info(`⚙️ 轮换策略: ${finalConfig.rotationStrategy}`);
    logger.info(`⚡ Flash回退: ${finalConfig.enableFlashFallback ? '启用' : '禁用'}`);
    if (finalConfig.enableFlashFallback) {
      logger.info(`📱 Flash回退模型: ${finalConfig.flashFallbackModel}`);
    }
    
    // 设置增强的Flash回退处理器
    this.setupEnhancedFlashFallback();
  }

  /**
   * 设置增强的Flash回退处理器
   */
  private setupEnhancedFlashFallback(): void {
    if (!this.multiAccountManager) {
      return;
    }

    // 保存原始的Flash回退处理器（如果存在）
    this.originalFlashFallbackHandler = this.getFlashFallbackHandler();

    // 设置新的增强处理器
    this.setFlashFallbackHandler(async (currentModel: string, fallbackModel: string): Promise<boolean> => {
      return this.handleEnhancedFlashFallback(currentModel, fallbackModel);
    });
  }

  /**
   * 增强的Flash回退处理逻辑
   */
  private async handleEnhancedFlashFallback(currentModel: string, fallbackModel: string): Promise<boolean> {
    if (!this.multiAccountManager) {
      // 如果没有多账号管理器，使用原始处理器
      if (this.originalFlashFallbackHandler) {
        const result = await this.originalFlashFallbackHandler(currentModel, fallbackModel);
        return Boolean(result);
      }
      return true;
    }

    const config = this.multiAccountManager.exportConfig();
    
    // 记录当前账号的Pro模型使用
    this.multiAccountManager.recordProModelUsage(currentModel);
    
    // 尝试切换到下一个可用账号
    const nextAccount = this.multiAccountManager.switchToNextAccount();
    
    if (nextAccount) {
      logger.info(`🔄 切换到账号 ${nextAccount.name}，继续使用 ${currentModel} 模型`);
      
      try {
        // 切换认证到新账号
        await this.switchToAccount(nextAccount);
        return false; // 不需要回退到Flash，继续使用Pro模型
      } catch (error) {
        logger.error(`切换到账号 ${nextAccount.name} 失败:`, error);
        // 切换失败，继续尝试Flash回退
      }
    }
    
    // 所有Pro账号都用完了，检查是否启用Flash回退
    if (Boolean(config.enableFlashFallback)) {
      logger.warn(`⚡ 所有账号的 ${currentModel} 配额已用完，自动切换到 ${fallbackModel}`);
      
      // 调用原始的Flash回退处理器（如果存在）
      if (this.originalFlashFallbackHandler) {
        const result = await this.originalFlashFallbackHandler(currentModel, fallbackModel);
        return Boolean(result);
      }
      
      return true; // 接受Flash回退
    } else {
      logger.error(`❌ 所有账号的 ${currentModel} 配额已用完，且Flash回退已禁用`);
      return false; // 拒绝回退，可能会导致错误
    }
  }

  /**
   * 切换到指定账号
   */
  private async switchToAccount(account: AccountConfig): Promise<void> {
    // 设置环境变量
    if (account.authType === AuthType.USE_GEMINI && account.apiKey) {
      process.env.GEMINI_API_KEY = account.apiKey;
    } else if (account.authType === AuthType.USE_VERTEX_AI && account.projectId) {
      process.env.GOOGLE_CLOUD_PROJECT = account.projectId;
    }
    
    // 刷新认证
    await this.refreshAuth(account.authType);
    
    logger.info(`已切换到账号 ${account.name} (${account.authType})`);
  }

  /**
   * 获取当前账号信息
   */
  getCurrentAccountInfo(): AccountConfig | null {
    return this.multiAccountManager?.getCurrentAccount() || null;
  }

  /**
   * 获取所有账号信息
   */
  getAllAccountsInfo(): AccountConfig[] {
    return this.multiAccountManager?.getAllAccounts() || [];
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
  } | null {
    return this.multiAccountManager?.getAccountStats() || null;
  }

  /**
   * 根据轮换策略切换到下一个账号（每次请求前调用）
   */
  async rotateToNextAccount(): Promise<AccountConfig | null> {
    if (!this.multiAccountManager) {
      return null;
    }

    const nextAccount = this.multiAccountManager.rotateToNextAccount();
    try {
      await this.switchToAccount(nextAccount);
      return nextAccount;
    } catch (error) {
      logger.error(`轮换到账号 ${nextAccount.name} 失败:`, error);
      return null;
    }
  }

  /**
   * 手动切换到下一个账号
   */
  async switchToNextAccount(): Promise<AccountConfig | null> {
    if (!this.multiAccountManager) {
      return null;
    }

    const nextAccount = this.multiAccountManager.switchToNextAccount();
    if (nextAccount) {
      try {
        await this.switchToAccount(nextAccount);
        return nextAccount;
      } catch (error) {
        logger.error(`切换到账号 ${nextAccount.name} 失败:`, error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * 重置指定账号的配额
   */
  resetAccountQuota(accountId: string): void {
    this.multiAccountManager?.resetAccountQuota(accountId);
  }

  /**
   * 重置所有账号的配额
   */
  resetAllAccountsQuota(): void {
    this.multiAccountManager?.resetAllAccountsQuota();
  }

  /**
   * 检查当前账号是否可以使用指定模型
   */
  canUseModel(model: string): boolean {
    if (!this.multiAccountManager) {
      return true; // 单账号模式，总是可以使用
    }
    
    return this.multiAccountManager.canUseProModel(model);
  }

  /**
   * 获取有效的模型（考虑账号配额限制）
   */
  getEffectiveModel(): string {
    const currentModel = this.getModel();
    
    if (!this.multiAccountManager) {
      return currentModel; // 单账号模式
    }
    
    const config = this.multiAccountManager.exportConfig();
    
    // 如果当前模型是Pro模型且当前账号不能使用，返回Flash模型
    if (config.proModels.includes(currentModel) && !this.canUseModel(currentModel)) {
      if (config.enableFlashFallback) {
        logger.info(`当前账号无法使用 ${currentModel}，返回 ${config.flashFallbackModel}`);
        return config.flashFallbackModel;
      }
    }
    
    return currentModel;
  }

  /**
   * 记录模型使用
   */
  recordModelUsage(model: string): void {
    this.multiAccountManager?.recordProModelUsage(model);
  }

  /**
   * 初始化配置
   */
  async initialize(): Promise<void> {
    await super.initialize();
  }

  /**
   * 重写setFlashFallbackHandler方法
   */
  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    // 调用父类方法
    super.setFlashFallbackHandler(handler);
  }

  /**
   * 获取Flash回退处理器
   */
  private getFlashFallbackHandler(): FlashFallbackHandler | undefined {
    return this.flashFallbackHandler;
  }

  /**
   * 是否启用了多账号管理
   */
  isMultiAccountEnabled(): boolean {
    return this.multiAccountManager !== undefined;
  }

  /**
   * 获取多账号配置
   */
  getMultiAccountConfig(): MultiAccountConfig | null {
    return this.multiAccountManager?.exportConfig() || null;
  }

  /**
   * 更新多账号配置
   */
  updateMultiAccountConfig(config: Partial<MultiAccountConfig>): void {
    this.multiAccountManager?.updateConfig(config);
  }
}

/**
 * 创建增强的Config实例
 */
export function createEnhancedConfig(baseConfig: any, multiAccountConfig?: MultiAccountConfig): EnhancedConfig {
  const enhancedConfig = new EnhancedConfig(baseConfig);
  enhancedConfig.initializeMultiAccountManager(multiAccountConfig);
  return enhancedConfig;
}