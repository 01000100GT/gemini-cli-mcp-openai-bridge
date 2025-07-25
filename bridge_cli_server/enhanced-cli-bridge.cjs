/**
 * 增强版Gemini CLI Bridge API服务
 * 完整支持gemini CLI的所有功能参数
 * 包含轮换账号功能和完整的OpenAI兼容接口
 */

const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

/**
 * Gemini CLI参数映射类
 * 负责将OpenAI API参数转换为gemini CLI参数
 */
class GeminiCliParameterMapper {
  constructor() {
    // 支持的模型映射
    this.modelMapping = {
      'gpt-4': 'gemini-2.5-pro',
      'gpt-4-turbo': 'gemini-2.5-pro',
      'gpt-3.5-turbo': 'gemini-2.5-flash',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-pro': 'gemini-2.5-pro',
      'gemini-flash': 'gemini-2.5-flash'
    };
    
    console.log('[GeminiCliParameterMapper] 初始化参数映射器');
  }

  /**
   * 将OpenAI请求参数转换为gemini CLI参数
   * @param {Object} openaiRequest - OpenAI格式的请求参数
   * @returns {Array} gemini CLI命令参数数组
   */
  mapToGeminiCliArgs(openaiRequest) {
    const args = [];
    
    console.log('[GeminiCliParameterMapper] 开始映射参数:', JSON.stringify(openaiRequest, null, 2));
    
    // 模型参数映射
    if (openaiRequest.model) {
      const geminiModel = this.modelMapping[openaiRequest.model] || openaiRequest.model;
      args.push('--model', geminiModel);
      console.log(`[GeminiCliParameterMapper] 映射模型: ${openaiRequest.model} -> ${geminiModel}`);
    }
    
    // 调试模式
    if (openaiRequest.debug || openaiRequest.stream) {
      args.push('--debug');
      console.log('[GeminiCliParameterMapper] 启用调试模式');
    }
    
    // 沙盒模式 - 从自定义参数中获取
    if (openaiRequest.sandbox) {
      args.push('--sandbox');
      console.log('[GeminiCliParameterMapper] 启用沙盒模式');
      
      if (openaiRequest.sandbox_image) {
        args.push('--sandbox-image', openaiRequest.sandbox_image);
        console.log(`[GeminiCliParameterMapper] 设置沙盒镜像: ${openaiRequest.sandbox_image}`);
      }
    }
    
    // 包含所有文件上下文
    if (openaiRequest.all_files || openaiRequest.include_all_files) {
      args.push('--all-files');
      console.log('[GeminiCliParameterMapper] 启用所有文件上下文');
    }
    
    // 显示内存使用情况
    if (openaiRequest.show_memory_usage) {
      args.push('--show-memory-usage');
      console.log('[GeminiCliParameterMapper] 启用内存使用显示');
    }
    
    // YOLO模式（自动接受所有操作）
    if (openaiRequest.yolo || openaiRequest.auto_accept) {
      args.push('--yolo');
      console.log('[GeminiCliParameterMapper] 启用YOLO模式');
    }
    
    // 检查点功能
    if (openaiRequest.checkpointing) {
      args.push('--checkpointing');
      console.log('[GeminiCliParameterMapper] 启用检查点功能');
    }
    
    // MCP服务器名称限制
    if (openaiRequest.allowed_mcp_servers && Array.isArray(openaiRequest.allowed_mcp_servers)) {
      openaiRequest.allowed_mcp_servers.forEach(server => {
        args.push('--allowed-mcp-server-names', server);
      });
      console.log(`[GeminiCliParameterMapper] 设置允许的MCP服务器: ${openaiRequest.allowed_mcp_servers.join(', ')}`);
    }
    
    // 扩展配置
    if (openaiRequest.extensions && Array.isArray(openaiRequest.extensions)) {
      openaiRequest.extensions.forEach(ext => {
        args.push('--extensions', ext);
      });
      console.log(`[GeminiCliParameterMapper] 设置扩展: ${openaiRequest.extensions.join(', ')}`);
    }
    
    // 遥测配置
    if (openaiRequest.telemetry !== undefined) {
      if (openaiRequest.telemetry) {
        args.push('--telemetry');
        console.log('[GeminiCliParameterMapper] 启用遥测');
      }
      
      if (openaiRequest.telemetry_target) {
        args.push('--telemetry-target', openaiRequest.telemetry_target);
        console.log(`[GeminiCliParameterMapper] 设置遥测目标: ${openaiRequest.telemetry_target}`);
      }
      
      if (openaiRequest.telemetry_otlp_endpoint) {
        args.push('--telemetry-otlp-endpoint', openaiRequest.telemetry_otlp_endpoint);
        console.log(`[GeminiCliParameterMapper] 设置OTLP端点: ${openaiRequest.telemetry_otlp_endpoint}`);
      }
      
      if (openaiRequest.telemetry_log_prompts !== undefined) {
        args.push('--telemetry-log-prompts', openaiRequest.telemetry_log_prompts.toString());
        console.log(`[GeminiCliParameterMapper] 设置遥测日志提示: ${openaiRequest.telemetry_log_prompts}`);
      }
    }
    
    console.log('[GeminiCliParameterMapper] 最终CLI参数:', args);
    return args;
  }

  /**
   * 提取用户消息内容
   * @param {Array} messages - OpenAI格式的消息数组
   * @returns {string} 用户消息内容
   */
  extractUserMessage(messages) {
    if (!messages || !Array.isArray(messages)) {
      console.log('[GeminiCliParameterMapper] 消息格式无效');
      return '';
    }
    
    // 提取所有用户消息并合并
    const userMessages = messages
      .filter(msg => msg.role === 'user')
      .map(msg => {
        if (typeof msg.content === 'string') {
          return msg.content;
        } else if (Array.isArray(msg.content)) {
          // 处理多模态内容
          return msg.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
        }
        return JSON.stringify(msg.content);
      })
      .join('\n\n');
    
    console.log(`[GeminiCliParameterMapper] 提取用户消息: ${userMessages.substring(0, 100)}...`);
    return userMessages;
  }
}

/**
 * 简单的API Key轮换管理器
 * 从配置文件中读取多个API Key并进行轮换
 */
class SimpleApiKeyRotator {
  constructor(configFile = './rotation-state.json') {
    this.apiKeys = [];
    this.currentIndex = 0;
    this.usageStats = new Map();
    // 使用传入的配置文件路径或默认路径
    this.configFile = path.resolve(configFile);
    
    console.log('[SimpleApiKeyRotator] 初始化API Key轮换器');
  }

  /**
   * 初始化轮换器，加载配置
   */
  async initialize() {
    try {
      console.log('[SimpleApiKeyRotator] 开始初始化，加载配置文件:', this.configFile);
      
      // 尝试读取配置文件
      const data = await fs.readFile(this.configFile, 'utf8');
      const config = JSON.parse(data);
      
      if (config.apiKeys && Array.isArray(config.apiKeys)) {
        this.apiKeys = config.apiKeys.filter(key => key.status === 'active');
        this.currentIndex = config.currentIndex || 0;
        
        // 确保索引在有效范围内
        if (this.currentIndex >= this.apiKeys.length) {
          this.currentIndex = 0;
        }
        
        console.log(`[SimpleApiKeyRotator] 加载了 ${this.apiKeys.length} 个活跃API Key`);
        console.log(`[SimpleApiKeyRotator] 当前索引: ${this.currentIndex}`);
        
        // 初始化使用统计
        this.apiKeys.forEach(key => {
          this.usageStats.set(key.key, {
            requests: key.requestCount || 0,
            successes: key.successCount || 0,
            failures: key.failureCount || 0,
            lastUsed: key.lastUsed ? new Date(key.lastUsed) : null
          });
        });
        
        return true;
      } else {
        console.log('[SimpleApiKeyRotator] 配置文件中没有找到有效的API Key配置');
        return false;
      }
    } catch (error) {
      console.error('[SimpleApiKeyRotator] 初始化失败:', error.message);
      return false;
    }
  }

  /**
   * 获取下一个可用的API Key
   * @returns {string|null} API Key或null
   */
  getNextApiKey() {
    if (this.apiKeys.length === 0) {
      console.log('[SimpleApiKeyRotator] 没有可用的API Key');
      return null;
    }
    
    const currentKey = this.apiKeys[this.currentIndex];
    const apiKey = currentKey.key;
    
    console.log(`[SimpleApiKeyRotator] 获取API Key: 索引=${this.currentIndex}, key=${apiKey.substring(0, 10)}...`);
    
    // 移动到下一个索引
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    
    // 更新使用统计
    const stats = this.usageStats.get(apiKey) || { requests: 0, successes: 0, failures: 0, lastUsed: null };
    stats.requests++;
    stats.lastUsed = new Date();
    this.usageStats.set(apiKey, stats);
    
    return apiKey;
  }

  /**
   * 报告API Key使用结果
   * @param {string} apiKey - 使用的API Key
   * @param {boolean} success - 是否成功
   */
  reportUsage(apiKey, success) {
    const stats = this.usageStats.get(apiKey);
    if (stats) {
      if (success) {
        stats.successes++;
        console.log(`[SimpleApiKeyRotator] 报告成功使用: ${apiKey.substring(0, 10)}... (成功: ${stats.successes})`);
      } else {
        stats.failures++;
        console.log(`[SimpleApiKeyRotator] 报告失败使用: ${apiKey.substring(0, 10)}... (失败: ${stats.failures})`);
      }
    }
  }

  /**
   * 获取使用统计
   * @returns {Object} 使用统计信息
   */
  getUsageStats() {
    const totalStats = {
      totalKeys: this.apiKeys.length,
      currentIndex: this.currentIndex,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      keyDetails: []
    };
    
    this.usageStats.forEach((stats, apiKey) => {
      totalStats.totalRequests += stats.requests;
      totalStats.totalSuccesses += stats.successes;
      totalStats.totalFailures += stats.failures;
      
      totalStats.keyDetails.push({
        key: apiKey.substring(0, 10) + '...',
        requests: stats.requests,
        successes: stats.successes,
        failures: stats.failures,
        lastUsed: stats.lastUsed ? stats.lastUsed.toISOString() : null
      });
    });
    
    return totalStats;
  }
}

// 创建全局实例
const parameterMapper = new GeminiCliParameterMapper();
const apiKeyRotator = new SimpleApiKeyRotator('./rotation-state.json');

/**
 * 执行Gemini CLI命令
 * @param {string} userMessage - 用户消息
 * @param {Array} cliArgs - CLI参数数组
 * @param {string} apiKey - 要使用的API Key
 * @returns {Promise<string>} Gemini的响应
 */
function executeGeminiCli(userMessage, cliArgs = [], apiKey = null) {
  console.log('🚀 [executeGeminiCli] 开始执行Gemini CLI命令');
  console.log(`📝 [executeGeminiCli] 用户消息: ${userMessage.substring(0, 100)}...`);
  console.log(`⚙️ [executeGeminiCli] CLI参数: ${cliArgs.join(' ')}`);
  console.log(`🔑 [executeGeminiCli] 使用API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : '默认'}`);
  
  return new Promise((resolve, reject) => {
    // 构建完整的命令参数
    const fullArgs = [...cliArgs, '--prompt', userMessage];
    
    console.log(`🔧 [executeGeminiCli] 完整命令: gemini ${fullArgs.join(' ')}`);
    
    // 设置环境变量
    const env = { ...process.env };
    if (apiKey) {
      env.GEMINI_API_KEY = apiKey;
      console.log(`🔐 [executeGeminiCli] 设置环境变量 GEMINI_API_KEY`);
    }
    
    const child = spawn('gemini', fullArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`📤 [executeGeminiCli] 收到输出: ${text.trim()}`);
    });
    
    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log(`⚠️ [executeGeminiCli] 错误输出: ${text.trim()}`);
    });
    
    child.on('close', (code) => {
      console.log(`🏁 [executeGeminiCli] 进程结束，退出码: ${code}`);
      
      if (code === 0) {
        console.log(`✅ [executeGeminiCli] 执行成功，输出长度: ${output.length}`);
        resolve(output);
      } else {
        console.error(`❌ [executeGeminiCli] 执行失败，退出码: ${code}`);
        console.error(`❌ [executeGeminiCli] 错误输出: ${errorOutput}`);
        reject(new Error(`Gemini CLI执行失败，退出码: ${code}, 错误: ${errorOutput}`));
      }
    });
    
    child.on('error', (err) => {
      console.error(`💥 [executeGeminiCli] 进程错误: ${err.message}`);
      reject(err);
    });
    
    // 设置超时
    setTimeout(() => {
      console.log('⏰ [executeGeminiCli] 执行超时，终止进程');
      child.kill('SIGTERM');
      reject(new Error('Gemini CLI执行超时'));
    }, 60000); // 60秒超时
  });
}

module.exports = {
  GeminiCliParameterMapper,
  SimpleApiKeyRotator,
  executeGeminiCli,
  parameterMapper,
  apiKeyRotator
};