/**
 * @fileoverview 回退模型功能相关的类型定义
 * @description 定义了回退模型配置、状态和事件相关的接口
 */

/**
 * 回退模型配置接口
 * 用于配置模型回退功能的各项参数
 */
export interface FallbackConfig {
  /** 是否启用回退功能 */
  enabled: boolean;
  /** 主模型名称（默认使用的模型） */
  primaryModel: string;
  /** 回退模型名称（主模型失败时使用） */
  fallbackModel: string;
  /** 触发条件 */
  triggerConditions: string[];
  /** 回退前的最大重试次数 */
  maxRetries: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;  
  /** 回退模式的冷却时间（分钟） */
  cooldownMinutes: number;
  /** 是否启用自动重置 */
  autoResetEnabled: boolean;
  /** 自动重置延迟（毫秒） */
  autoResetDelay: number;
  /** 是否启用持久化 */
  persistenceEnabled: boolean;
  /** 回退状态持久化文件路径 */
  persistenceFile?: string;
}

/**
 * 模型切换事件接口
 * 记录模型切换的详细信息
 */
export interface ModelSwitchEvent {
  /** 切换前的模型 */
  fromModel: string;
  /** 切换后的模型 */
  toModel: string;
  /** 切换原因 */
  reason: 'quota_exceeded' | 'rate_limit' | 'consecutive_failures' | 'manual';
  /** 切换时间戳 */
  timestamp: Date;
  /** 触发切换的错误信息（可选） */
  error?: Error;
  /** 当前连续失败次数 */
  consecutiveFailures?: number;
  /** 使用的API Key索引 */
  apiKeyIndex?: number;
  /** 错误类型 */
  errorType: ErrorType;
}

/**
 * 回退状态接口
 * 用于持久化回退模式的状态信息
 */
export interface FallbackState {
  /** 是否处于回退模式 */
  isInFallbackMode: boolean;
  /** 回退开始时间（ISO字符串格式） */
  fallbackStartTime?: string;
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 最后一次切换的原因 */
  lastSwitchReason?: string;
  /** 当前使用的模型 */
  currentModel: string;
  /** 回退模型 */
  fallbackModel: string;
  /** 最后切换时间 */
  lastSwitchTime: string | null;
  /** 切换次数 */
  switchCount: number;
  /** 最后的错误信息 */
  lastError: {
    message: string;
    timestamp: string;
    type: ErrorType;
  } | null;
  /** 最后更新时间 */
  lastUpdated: string;
}

/**
 * 错误类型枚举
 * 定义了可能触发回退的错误类型
 */
export enum ErrorType {
  /** 配额超限错误 */
  QUOTA_EXCEEDED = 'quota_exceeded',
  /** 限速错误 */
  RATE_LIMIT = 'rate_limit',
  /** Pro模型配额超限 */
  PRO_QUOTA_EXCEEDED = 'pro_quota_exceeded',
  /** 通用配额超限 */
  GENERIC_QUOTA_EXCEEDED = 'generic_quota_exceeded',
  /** 服务器错误 */
  SERVER_ERROR = 'server_error',
  /** 网络错误 */
  NETWORK_ERROR = 'network_error',
  /** 未知错误 */
  UNKNOWN_ERROR = 'unknown_error',
  /** 未知错误 */
  UNKNOWN = 'unknown'
}

/**
 * 回退统计信息接口
 * 用于监控和分析回退功能的使用情况
 */
export interface FallbackStats {
  /** 总回退次数 */
  totalFallbacks: number;
  /** 总恢复次数 */
  totalRestores: number;
  /** 当前回退持续时间（毫秒） */
  currentFallbackDuration?: number;
  /** 平均回退持续时间（毫秒） */
  averageFallbackDuration: number;
  /** 按错误类型分组的回退次数 */
  fallbacksByErrorType: Record<ErrorType, number>;
  /** 最后一次回退时间 */
  lastFallbackTime?: Date;
  /** 最后一次恢复时间 */
  lastRestoreTime?: Date;
  /** 总切换次数 */
  totalSwitches: number;
  /** 成功切换次数 */
  successfulSwitches: number;
  /** 失败切换次数 */
  failedSwitches: number;
  /** 最后切换时间 */
  lastSwitchTime: string | null;
  /** 错误计数 */
  errorCounts: {
    [key in ErrorType]: number;
  };
}