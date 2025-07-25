/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API Key信息接口
 */
export interface ApiKeyInfo {
  key: string;
  status: 'active' | 'failed' | 'cooldown';
  requestCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastUsed?: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
  cooldownUntil?: Date;
  lastError?: string;
}

/**
 * 轮换状态接口
 */
export interface RotationStatus {
  totalKeys: number;
  activeKeys: number;
  currentIndex: number;
  failedKeys: number;
  totalRequests: number;
  strategy: string;
  currentKey?: string;
  lastRotation?: Date;
  isEnabled: boolean;
}

export interface UsageStats {
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  keyStats: Record<string, {
    requests: number;
    successes: number;
    failures: number;
    lastUsed: Date;
  }>;
}

/**
 * 轮换配置接口
 */
export interface RotationConfig {
  strategy: 'round-robin' | 'random' | 'least-used';
  maxRequestsPerKey?: number;
  rotationInterval?: number;
  enableFallback: boolean;
  maxConsecutiveFailures: number;
  cooldownPeriod: number;
  persistenceFile: string;
  multiAccount?: MultiAccountConfig;
}

/**
 * 持久化数据结构
 */
export interface PersistenceData {
  /** 当前Key索引 */
  currentIndex: number;
  /** 最后使用时间 */
  lastUsedTime: string;
  /** 总请求次数 */
  totalRequests: number;
  /** Key信息列表 */
  keys: ApiKeyInfo[];
}

/**
 * 账号信息接口
 */
export interface AccountInfo {
  /** 账号ID */
  id: string;
  /** 账号名称 */
  name: string;
  /** API密钥 */
  apiKey: string;
  /** 配额限制 */
  quota?: {
    /** 日配额 */
    daily?: number;
    /** 月配额 */
    monthly?: number;
  };
  /** 账号状态 */
  status: 'active' | 'inactive' | 'exceeded';
}

/**
 * 多账号配置接口
 */
export interface MultiAccountConfig {
  /** 是否启用多账号 */
  enabled: boolean;
  /** 账号列表 */
  accounts: AccountInfo[];
  /** 回退模型 */
  fallbackModel?: string;
}