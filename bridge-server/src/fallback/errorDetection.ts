/**
 * @fileoverview 错误检测工具函数
 * @description 提供各种错误类型的检测功能，用于判断是否需要触发模型回退
 */

import { ErrorType } from '../types/fallback.js';
import { logger } from '../utils/logger.js';

/**
 * 检测是否为配额超限错误
 * @param error 错误对象
 * @returns 如果是配额超限错误返回true
 */
export function isQuotaExceededError(error: Error | unknown): boolean {
  console.log('[fallback/errorDetection] 检测配额超限错误:', error);
  
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  
  // 检测常见的配额超限错误关键词
  const quotaKeywords = [
    'quota exceeded',
    'quota limit',
    'daily quota',
    'usage limit',
    'rate limit exceeded',
    'too many requests'
  ];
  
  const isQuotaError = quotaKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (isQuotaError) {
    console.log('[fallback/errorDetection] 检测到配额超限错误');
    logger.warn('Detected quota exceeded error', { error: errorMessage });
  }
  
  return isQuotaError;
}

/**
 * 检测是否为限速错误（429错误）
 * @param error 错误对象
 * @returns 如果是限速错误返回true
 */
export function isRateLimitError(error: Error | unknown): boolean {
  console.log('[fallback/errorDetection] 检测限速错误:', error);
  
  if (!error) return false;
  
  // 检查HTTP状态码
  const status = getErrorStatus(error);
  if (status === 429) {
    console.log('[fallback/errorDetection] 检测到429限速错误');
    logger.warn('Detected 429 rate limit error', { status });
    return true;
  }
  
  // 检查错误消息中的限速关键词
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  
  const rateLimitKeywords = [
    '429',
    'rate limit',
    'too many requests',
    'request limit',
    'throttled'
  ];
  
  const isRateLimit = rateLimitKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (isRateLimit) {
    console.log('[fallback/errorDetection] 检测到限速错误关键词');
    logger.warn('Detected rate limit error by keywords', { error: errorMessage });
  }
  
  return isRateLimit;
}

/**
 * 检测是否为Pro模型配额超限错误
 * @param error 错误对象
 * @returns 如果是Pro模型配额超限错误返回true
 */
export function isProQuotaExceededError(error: Error | unknown): boolean {
  console.log('[fallback/errorDetection] 检测Pro模型配额超限错误:', error);
  
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  
  // 检测Pro模型特定的配额错误
  const proQuotaKeywords = [
    'pro quota',
    'pro model quota',
    'gemini-pro quota',
    'gemini-2.5-pro quota',
    'pro daily quota'
  ];
  
  const isProQuota = proQuotaKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (isProQuota) {
    console.log('[fallback/errorDetection] 检测到Pro模型配额超限错误');
    logger.warn('Detected Pro model quota exceeded error', { error: errorMessage });
  }
  
  return isProQuota;
}

/**
 * 检测是否为通用配额超限错误（非Pro模型特定）
 * @param error 错误对象
 * @returns 如果是通用配额超限错误返回true
 */
export function isGenericQuotaExceededError(error: Error | unknown): boolean {
  console.log('[fallback/errorDetection] 检测通用配额超限错误:', error);
  
  // 如果是Pro模型配额错误，则不是通用配额错误
  if (isProQuotaExceededError(error)) {
    return false;
  }
  
  // 检查是否为配额超限错误
  return isQuotaExceededError(error);
}

/**
 * 检测是否为服务器错误（5xx错误）
 * @param error 错误对象
 * @returns 如果是服务器错误返回true
 */
export function isServerError(error: Error | unknown): boolean {
  console.log('[fallback/errorDetection] 检测服务器错误:', error);
  
  if (!error) return false;
  
  const status = getErrorStatus(error);
  const isServer = status !== undefined && status >= 500 && status < 600;
  
  if (isServer) {
    console.log(`[fallback/errorDetection] 检测到服务器错误，状态码: ${status}`);
    logger.warn('Detected server error', { status });
  }
  
  return isServer;
}

/**
 * 从错误对象中提取HTTP状态码
 * @param error 错误对象
 * @returns HTTP状态码，如果无法提取则返回undefined
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  
  // 检查直接的status属性
  if ('status' in error && typeof error.status === 'number') {
    console.log(`[fallback/errorDetection] 从error.status获取状态码: ${error.status}`);
    return error.status;
  }
  
  // 检查response.status属性（常见于axios错误）
  if ('response' in error && 
      typeof error.response === 'object' && 
      error.response !== null &&
      'status' in error.response && 
      typeof (error.response as any).status === 'number') {
    const status = (error.response as any).status;
    console.log(`[fallback/errorDetection] 从error.response.status获取状态码: ${status}`);
    return status;
  }
  
  // 尝试从错误消息中解析状态码
  if (error instanceof Error && error.message) {
    const statusMatch = error.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      if (status >= 100 && status < 600) {
        console.log(`[fallback/errorDetection] 从错误消息解析状态码: ${status}`);
        return status;
      }
    }
  }
  
  return undefined;
}

/**
 * 判断错误类型
 * @param error 错误对象
 * @returns 错误类型枚举值
 */
export function getErrorType(error: Error | unknown): ErrorType {
  console.log('[fallback/errorDetection] 判断错误类型:', error);
  
  if (isProQuotaExceededError(error)) {
    return ErrorType.PRO_QUOTA_EXCEEDED;
  }
  
  if (isGenericQuotaExceededError(error)) {
    return ErrorType.GENERIC_QUOTA_EXCEEDED;
  }
  
  if (isRateLimitError(error)) {
    return ErrorType.RATE_LIMIT;
  }
  
  if (isServerError(error)) {
    return ErrorType.SERVER_ERROR;
  }
  
  // 检查网络错误
  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('network') || 
        lowerMessage.includes('connection') ||
        lowerMessage.includes('timeout')) {
      return ErrorType.NETWORK_ERROR;
    }
  }
  
  return ErrorType.UNKNOWN_ERROR;
}

/**
 * 检查是否应该触发回退的错误
 * @param error 错误对象
 * @returns 如果应该触发回退返回true
 */
export function shouldTriggerFallback(error: Error | unknown): boolean {
  console.log('[fallback/errorDetection] 检查是否应该触发回退:', error);
  
  const errorType = getErrorType(error);
  
  // 定义会触发回退的错误类型
  const fallbackTriggerTypes = [
    ErrorType.QUOTA_EXCEEDED,
    ErrorType.RATE_LIMIT,
    ErrorType.PRO_QUOTA_EXCEEDED,
    ErrorType.GENERIC_QUOTA_EXCEEDED,
    ErrorType.SERVER_ERROR
  ];
  
  const shouldFallback = fallbackTriggerTypes.includes(errorType);
  
  if (shouldFallback) {
    console.log(`[fallback/errorDetection] 错误类型 ${errorType} 应该触发回退`);
    logger.info('Error should trigger fallback', { errorType, error: error instanceof Error ? error.message : String(error) });
  } else {
    console.log(`[fallback/errorDetection] 错误类型 ${errorType} 不需要触发回退`);
  }
  
  return shouldFallback;
}