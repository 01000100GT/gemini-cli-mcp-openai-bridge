#!/usr/bin/env node

/**
 * 多账号功能测试脚本
 */

const { loadMultiAccountConfigFromEnv } = require('./dist/config/multiAccountManager.js');
const { EnhancedConfig, createEnhancedConfig } = require('./dist/config/enhancedConfig.js');
const { loadServerConfig } = require('./dist/config/config.js');

async function testMultiAccountConfig() {
  console.log('🧪 开始测试多账号配置...');
  
  try {
    // 测试环境变量配置加载
    console.log('\n1. 测试环境变量配置加载:');
    const multiAccountConfig = loadMultiAccountConfigFromEnv();
    console.log('✅ 多账号配置加载成功:', {
      accountCount: multiAccountConfig.accounts.length,
      rotationStrategy: multiAccountConfig.rotationStrategy,
      enableFlashFallback: multiAccountConfig.enableFlashFallback
    });
    
    // 测试基础配置加载
    console.log('\n2. 测试基础配置加载:');
    const baseConfig = await loadServerConfig(
      { merged: {} }, // settings
      [], // extensions
      'test-session-' + Date.now(),
      true, // debugMode
      false, // loadInternalPrompt
      'gemini-2.5-pro' // toolsModel
    );
    console.log('✅ 基础配置加载成功');
    
    // 测试增强配置创建
    console.log('\n3. 测试增强配置创建:');
    const enhancedConfig = createEnhancedConfig(baseConfig, multiAccountConfig);
    console.log('✅ 增强配置创建成功');
    
    // 测试账号信息获取
    console.log('\n4. 测试账号信息获取:');
    const currentAccount = enhancedConfig.getCurrentAccountInfo();
    const allAccounts = enhancedConfig.getAllAccountsInfo();
    const stats = enhancedConfig.getAccountStats();
    
    console.log('当前账号:', currentAccount);
    console.log('所有账号数量:', allAccounts.length);
    console.log('账号统计:', stats);
    
    // 测试模型可用性检查
    console.log('\n5. 测试模型可用性检查:');
    const canUsePro = enhancedConfig.canUseModel('gemini-2.5-pro');
    const canUseFlash = enhancedConfig.canUseModel('gemini-2.5-flash');
    const effectiveModel = enhancedConfig.getEffectiveModel();
    
    console.log('可以使用Pro模型:', canUsePro);
    console.log('可以使用Flash模型:', canUseFlash);
    console.log('有效模型:', effectiveModel);
    
    console.log('\n🎉 所有测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  }
}

// 设置测试环境变量
process.env.GEMINI_MULTI_ACCOUNTS = JSON.stringify([
  {
    "id": "test_account_1",
    "name": "测试账号1",
    "authType": "gemini-api-key",
    "apiKey": "test-api-key-1",
    "status": "active",
    "proUsageCount": 0,
    "proQuotaLimit": 50
  },
  {
    "id": "test_account_2",
    "name": "测试账号2",
    "authType": "gemini-api-key",
    "apiKey": "test-api-key-2",
    "status": "active",
    "proUsageCount": 25,
    "proQuotaLimit": 50
  }
]);

process.env.GEMINI_ROTATION_STRATEGY = 'least_used';
process.env.GEMINI_FLASH_FALLBACK_MODEL = 'gemini-2.5-flash';
process.env.GEMINI_ENABLE_FLASH_FALLBACK = 'true';

// 运行测试
testMultiAccountConfig();