#!/usr/bin/env node
/**
 * API Key轮换功能测试脚本
 * 用于验证轮换服务的基本功能
 */

import { RotationService } from './RotationService.js';
import { logger } from '../utils/logger.js';

/**
 * 测试API Key轮换功能
 */
async function testRotation(): Promise<void> {
  console.log('🚀 开始测试API Key轮换功能...');
  
  try {
    // 初始化轮换服务
    const rotationService = new RotationService();
    await rotationService.initialize();
    console.log('✅ 轮换服务初始化成功');
    
    // 检查是否启用了多账号模式
    const isEnabled = await rotationService.isMultiAccountEnabled();
    console.log(`📊 多账号模式: ${isEnabled ? '已启用' : '未启用'}`);
    
    if (!isEnabled) {
      console.log('ℹ️ 多账号模式未启用，使用默认API Key');
      return;
    }
    
    // 获取轮换状态
    const status = await rotationService.getRotationStatus();
    console.log('📈 轮换状态:', {
      totalKeys: status.totalKeys,
      activeKeys: status.activeKeys,
      isEnabled: status.isEnabled
    });
    
    // 测试获取API Key
    console.log('\n🔑 测试API Key获取...');
    for (let i = 0; i < 3; i++) {
      try {
        const apiKey = await rotationService.getApiKey();
        console.log(`第${i + 1}次获取: ${apiKey.substring(0, 10)}...`);
        
        // 模拟使用成功
        await rotationService.reportUsage(apiKey, true);
        console.log(`✅ 报告使用成功`);
      } catch (error) {
        console.error(`❌ 第${i + 1}次获取失败:`, error);
      }
    }
    
    // 获取使用统计
    const stats = await rotationService.getUsageStats();
    console.log('\n📊 使用统计:', stats);
    
    console.log('\n🎉 测试完成!');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testRotation().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

export { testRotation };