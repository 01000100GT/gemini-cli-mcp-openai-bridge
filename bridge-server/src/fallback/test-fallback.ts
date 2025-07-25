/**
 * @fileoverview 回退功能测试脚本
 * @description 用于测试回退模型功能的基本工作流程
 */

import { FallbackManager } from './FallbackManager.js';
import { ErrorType } from '../types/fallback.js';

/**
 * 测试回退功能
 */
async function testFallbackFeature() {
  console.log('=== 开始测试回退功能 ===');
  
  try {
    // 创建回退管理器
    const fallbackManager = new FallbackManager();
    
    console.log('\n1. 检查初始状态:');
    console.log('当前模型:', fallbackManager.getCurrentModel());
    console.log('回退状态:', fallbackManager.getState());
    
    // 模拟配额超限错误
    const quotaError = new Error('Quota exceeded for model gemini-2.0-flash-exp');
    (quotaError as any).status = 429;
    
    console.log('\n2. 检查是否应该触发回退:');
    const shouldFallback = await fallbackManager.shouldTriggerFallback(quotaError);
    console.log('是否应该回退:', shouldFallback);
    
    if (shouldFallback) {
      console.log('\n3. 触发回退:');
      const fallbackResult = await fallbackManager.triggerFallback(quotaError);
      console.log('回退结果:', fallbackResult);
      
      console.log('\n4. 检查回退后状态:');
      console.log('当前模型:', fallbackManager.getCurrentModel());
      console.log('回退状态:', fallbackManager.getState());
      console.log('统计信息:', fallbackManager.getStats());
      
      // 等待一段时间后重置
      console.log('\n5. 重置到主模型:');
      await fallbackManager.resetToPrimary();
      
      console.log('\n6. 检查重置后状态:');
      console.log('当前模型:', fallbackManager.getCurrentModel());
      console.log('回退状态:', fallbackManager.getState());
    }
    
    console.log('\n=== 回退功能测试完成 ===');
    
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 如果直接运行此文件，则执行测试
if (process.argv[1] && process.argv[1].endsWith('test-fallback.ts') || process.argv[1].endsWith('test-fallback.js')) {
  testFallbackFeature();
}

export { testFallbackFeature };