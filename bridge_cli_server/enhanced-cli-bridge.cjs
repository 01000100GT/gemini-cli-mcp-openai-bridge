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
  mapToGeminiCliArgs(requestBody, messages) {
    const { model, tools, functions, tool_choice, function_call, ...otherParams } = requestBody;
    const args = [];

    // 定义gemini-cli支持的参数列表
    const supportedParams = [
      'model', 'prompt', 'prompt-interactive', 'sandbox', 'sandbox-image',
      'debug', 'all-files', 'show-memory-usage', 'yolo', 'telemetry',
      'telemetry-target', 'telemetry-otlp-endpoint', 'telemetry-log-prompts',
      'checkpointing', 'experimental-acp', 'allowed-mcp-server-names',
      'extensions', 'list-extensions', 'ide-mode', 'proxy', 'version', 'help'
    ];

    const userMessage = this.extractUserMessage(messages);
    const hasFunctionCall = tools || functions || tool_choice || function_call;

    if (hasFunctionCall) {
      args.push('--json');
      const allFunctions = [];
      if (tools) allFunctions.push(...tools.map(t => t.function));
      if (functions) allFunctions.push(...functions);
      if (allFunctions.length > 0) {
        args.push('--tools', JSON.stringify({ function_declarations: allFunctions }));
      }
    }

    if (model) {
      args.push('--model', this.modelMapping[model] || model);
    }

    Object.entries(otherParams).forEach(([key, value]) => {
      const cliOption = key.replace(/_/g, '-');
      if (supportedParams.includes(cliOption)) {
        const cliOptionWithPrefix = `--${cliOption}`;
        if (value === true) {
          args.push(cliOptionWithPrefix);
        } else if (value !== false && value !== null && value !== undefined) {
          args.push(cliOptionWithPrefix, value.toString());
        }
      }
    });

    return { cliArgs: args, userMessage, hasFunctionCall };
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

  /**
   * 增强消息以支持function calling
   * @param {string} userMessage - 原始用户消息
   * @param {Object} toolsConfig - tools配置对象
   * @returns {string} 增强后的消息
   */
  enhanceMessageWithTools(userMessage, toolsConfig) {
    // 此函数现在仅用于保持接口一致性，实际的工具处理已移至 mapToGeminiCliArgs
    console.log('[GeminiCliParameterMapper] enhanceMessageWithTools 已被调用，但逻辑已转移');
    return userMessage;
  }

  /**
   * 解析Gemini响应中的function call
   * @param {string} geminiOutput - Gemini的原始输出
   * @param {Object} toolsConfig - tools配置对象
   * @returns {Object} 解析结果
   */
  parseFunctionCallResponse(geminiOutput, toolsConfig) {
    console.log(`[GeminiCliParameterMapper] 开始解析原生function call响应`);

    try {
      // Gemini CLI的--json输出原生就是JSON
      const parsedOutput = JSON.parse(geminiOutput);

      // 检查是否存在 tool_code
      if (parsedOutput.candidates && parsedOutput.candidates[0].content && parsedOutput.candidates[0].content.parts) {
        const parts = parsedOutput.candidates[0].content.parts;
        const functionCallParts = parts.filter(part => part.function_call);

        if (functionCallParts.length > 0) {
          const toolCalls = functionCallParts.map(part => ({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: part.function_call.name,
              arguments: JSON.stringify(part.function_call.args || {})
            }
          }));

          const textParts = parts.filter(part => part.text).map(part => part.text).join('\n');

          return {
            content: textParts || null,
            tool_calls: toolCalls,
            finish_reason: 'tool_calls'
          };
        }
      }

      // 如果没有function call，提取常规文本内容
      if (parsedOutput.candidates && parsedOutput.candidates[0].content && parsedOutput.candidates[0].content.parts) {
         const textContent = parsedOutput.candidates[0].content.parts.filter(p => p.text).map(p => p.text).join('');
         return {
            content: textContent,
            tool_calls: null,
            finish_reason: 'stop'
         };
      }

    } catch (error) {
      console.error(`[GeminiCliParameterMapper] 解析原生Gemini JSON输出失败:`, error.message);
      // 如果解析失败，可能不是JSON输出，直接返回原始文本
      return {
        content: geminiOutput,
        tool_calls: null,
        finish_reason: 'stop'
      };
    }

    // 默认返回
    return {
      content: geminiOutput,
      tool_calls: null,
      finish_reason: 'stop'
    };
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
    
    console.log('[SimpleApiKeyRotator] 初始化API Key轮换器: ', this.configFile);
  }

  /**
   * 初始化轮换器，加载配置
   * 优先从环境变量GEMINI_MULTI_ACCOUNTS读取，fallback到配置文件
   */
  async initialize() {
    try {
      console.log('[SimpleApiKeyRotator] 开始初始化API Key轮换器');
      
      // 优先尝试从环境变量读取配置
      const envConfig = process.env.GEMINI_MULTI_ACCOUNTS;
      if (envConfig) {
        console.log('[SimpleApiKeyRotator] 从环境变量GEMINI_MULTI_ACCOUNTS加载配置: ', envConfig);
        
        try {
          const multiAccountsConfig = JSON.parse(envConfig);
          
          if (multiAccountsConfig.enabled && multiAccountsConfig.accounts && Array.isArray(multiAccountsConfig.accounts)) {
            // 将环境变量格式转换为rotation-state.json格式
            const activeAccounts = multiAccountsConfig.accounts.filter(account => account.status === 'active');
            
            this.apiKeys = activeAccounts.map(account => ({
              key: account.apiKey,
              id: account.id,
              name: account.name,
              status: account.status,
              requestCount: 0,
              successCount: 0,
              failureCount: 0,
              quota: account.quota || { daily: 100, monthly: 3000 }
            }));
            
            this.currentIndex = 0;
            
            console.log(`[SimpleApiKeyRotator] 从环境变量加载了 ${this.apiKeys.length} 个活跃API Key`);
            
            // 初始化使用统计
            this.apiKeys.forEach(key => {
              this.usageStats.set(key.key, {
                requests: 0,
                successes: 0,
                failures: 0,
                lastUsed: null
              });
              console.log(`[SimpleApiKeyRotator] 初始化API Key统计: ${key.name} (${key.key.substring(0, 10)}...)`);
            });
            
            return true;
          }
        } catch (envParseError) {
          console.error('[SimpleApiKeyRotator] 解析环境变量GEMINI_MULTI_ACCOUNTS失败:', envParseError.message);
          console.log('[SimpleApiKeyRotator] 将尝试从配置文件加载');
        }
      }
      
      // Fallback: 从配置文件读取
      console.log('[SimpleApiKeyRotator] 从配置文件加载:', this.configFile);
      
      const data = await fs.readFile(this.configFile, 'utf8');
      const rawConfig = JSON.parse(data);
      console.log('[SimpleApiKeyRotator] 开始解析配置文件中的环境变量引用');
      const config = this.resolveObjectEnvironmentVariables(rawConfig);
      
      if (config.apiKeys && Array.isArray(config.apiKeys)) {
        this.apiKeys = config.apiKeys.filter(key => key.status === 'active');
        this.currentIndex = config.currentIndex || 0;
        
        // 确保索引在有效范围内
        if (this.currentIndex >= this.apiKeys.length) {
          this.currentIndex = 0;
        }
        
        console.log(`[SimpleApiKeyRotator] 从配置文件加载了 ${this.apiKeys.length} 个活跃API Key`);
        console.log(`[SimpleApiKeyRotator] 当前索引: ${this.currentIndex}`);
        
        // 初始化使用统计
        this.apiKeys.forEach(key => {
          this.usageStats.set(key.key, {
            requests: key.requestCount || 0,
            successes: key.successCount || 0,
            failures: key.failureCount || 0,
            lastUsed: key.lastUsed ? new Date(key.lastUsed) : null
          });
          console.log(`[SimpleApiKeyRotator] 初始化API Key统计: ${key.name} (${key.key.substring(0, 10)}...)`);
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
   * 解析字符串中的环境变量引用
   * 将 ${VARIABLE_NAME} 格式替换为实际的环境变量值
   * @param {string} str - 包含环境变量引用的字符串
   * @returns {string} 解析后的字符串
   */
  resolveEnvironmentVariables(str) {
    if (typeof str !== 'string') {
      return str;
    }
    
    // 匹配 ${VARIABLE_NAME} 格式的环境变量引用
    return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        console.warn(`[SimpleApiKeyRotator] 环境变量 ${varName} 未定义，保持原始值: ${match}`);
        return match;
      }
      console.log(`[SimpleApiKeyRotator] 解析环境变量: ${varName} -> ${envValue.substring(0, 10)}...`);
      return envValue;
    });
  }

  /**
   * 递归解析对象中的环境变量引用
   * @param {any} obj - 要解析的对象
   * @returns {any} 解析后的对象
   */
  resolveObjectEnvironmentVariables(obj) {
    if (typeof obj === 'string') {
      return this.resolveEnvironmentVariables(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObjectEnvironmentVariables(item));
    } else if (obj && typeof obj === 'object') {
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObjectEnvironmentVariables(value);
      }
      return resolved;
    }
    return obj;
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
 * 从Gemini响应中提取文本内容
 * @param {Object} parsedOutput - 解析后的Gemini JSON响应
 * @returns {string} 提取的文本内容
 */
function extractTextFromGeminiResponse(parsedOutput) {
  try {
    if (parsedOutput.candidates && Array.isArray(parsedOutput.candidates) && parsedOutput.candidates.length > 0 && parsedOutput.candidates[0]) {
      const candidate = parsedOutput.candidates[0];
      
      if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
        // 合并所有文本部分
        const textParts = candidate.content.parts
          .filter(part => part && part.text)
          .map(part => part.text)
          .join('\n');
        
        console.log(`📄 [extractTextFromGeminiResponse] 提取到文本内容，长度: ${textParts.length}`);
        return textParts;
      }
    }
    
    console.log(`⚠️ [extractTextFromGeminiResponse] 未找到有效的文本内容`);
    return null;
  } catch (error) {
    console.error(`❌ [extractTextFromGeminiResponse] 提取文本时发生错误: ${error.message}`);
    return null;
  }
}

/**
 * 计算执行超时时间
 * @param {Array} cliArgs - CLI参数数组
 * @param {boolean} hasTools - 是否包含function calling
 * @returns {number} 超时时间（毫秒）
 */
function calculateTimeout(cliArgs = [], hasTools = false) {
  let timeout = parseInt(process.env.DEFAULT_TIMEOUT) || 60;
  
  // Function Calling 需要更长时间
  if (hasTools) {
    timeout = parseInt(process.env.FUNCTION_CALL_TIMEOUT) || 120;
    console.log(`[calculateTimeout] 检测到Function Calling，使用超时: ${timeout}秒`);
  }
  
  // 复杂操作需要更长时间
  const complexArgs = ['--sandbox', '--all-files', '--show-memory-usage', '--checkpointing'];
  const hasComplexArgs = complexArgs.some(arg => cliArgs.includes(arg));
  
  if (hasComplexArgs) {
    timeout = parseInt(process.env.COMPLEX_QUERY_TIMEOUT) || 180;
    console.log(`[calculateTimeout] 检测到复杂操作参数，使用超时: ${timeout}秒`);
  }
  
  // 应用最大超时限制
  const maxTimeout = parseInt(process.env.MAX_TIMEOUT) || 300;
  if (timeout > maxTimeout) {
    timeout = maxTimeout;
    console.log(`[calculateTimeout] 超时时间超过最大限制，调整为: ${timeout}秒`);
  }
  
  console.log(`[calculateTimeout] 最终超时设置: ${timeout}秒`);
  return timeout * 1000; // 转换为毫秒
}

/**
 * 执行Gemini CLI命令
 * @param {string} userMessage - 用户消息
 * @param {Array} cliArgs - CLI参数数组
 * @param {string} apiKey - 要使用的API Key
 * @param {boolean} hasTools - 是否包含function calling
 * @returns {Promise<string>} Gemini的响应
 */
function executeGeminiCli(userMessage, cliArgs = [], apiKey = null, hasTools = false) {
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
    
    // 获取工作目录配置，优先使用环境变量，否则使用系统临时目录
    const workDir = process.env.GEMINI_WORK_DIR || require('os').tmpdir();
    console.log(`📁 [executeGeminiCli] 使用工作目录: ${workDir}`);
    
    const geminiPath = path.resolve(__dirname, 'node_modules/.bin/gemini');
    const child = spawn(geminiPath, fullArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env,
      cwd: workDir  // 使用配置的工作目录，避免扫描项目文件
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
        
        // 处理输出，无论是否有工具调用都进行智能解析
        try {
          // 首先尝试解析为JSON
          const parsedOutput = JSON.parse(output);
          
          if (hasTools) {
            console.log('🛠️ [executeGeminiCli] 检测到工具调用，处理结构化输出');
            // 对于工具调用，保持原始JSON结构
            resolve(output);
          } else {
            console.log('💭 [executeGeminiCli] 处理常规对话输出');
            // 对于常规对话，提取文本内容
            const textContent = extractTextFromGeminiResponse(parsedOutput);
            resolve(textContent || output);
          }
        } catch (e) {
          console.log(`📝 [executeGeminiCli] 输出不是JSON格式，直接返回文本内容`);
          // 如果不是JSON，直接返回原始输出
          resolve(output);
        }
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
    
    // 计算并设置动态超时
    const timeoutMs = calculateTimeout(cliArgs, hasTools);
    const timeoutHandle = setTimeout(() => {
      console.log(`⏰ [executeGeminiCli] 执行超时（${timeoutMs/1000}秒），终止进程`);
      child.kill('SIGTERM');
      reject(new Error(`Gemini CLI执行超时（${timeoutMs/1000}秒）`));
    }, timeoutMs);
  });
}

module.exports = {
  GeminiCliParameterMapper,
  SimpleApiKeyRotator,
  executeGeminiCli,
  parameterMapper,
  apiKeyRotator
};