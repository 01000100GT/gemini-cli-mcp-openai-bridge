/**
 * 增强版Gemini CLI API服务器
 * 完整支持gemini CLI的所有功能，包含轮换账号和OpenAI兼容接口
 */

// 加载环境变量配置
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { 
  GeminiCliParameterMapper, 
  SimpleApiKeyRotator, 
  executeGeminiCli,
  parameterMapper,
  apiKeyRotator 
} = require('./enhanced-cli-bridge.cjs');

/**
 * 增强版API服务器类
 * 提供完整的OpenAI兼容接口，支持所有gemini CLI功能
 */
class EnhancedGeminiApiServer {
  constructor(port = 8765) {
    this.port = port;
    this.app = express();
    this.isInitialized = false;
    
    console.log(`[EnhancedGeminiApiServer] 初始化服务器，端口: ${port}`);
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * 设置中间件
   */
  setupMiddleware() {
    console.log('[EnhancedGeminiApiServer] 设置中间件');
    
    // CORS支持
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));
    
    // JSON解析
    this.app.use(express.json({ limit: '10mb' }));
    
    // 请求日志
    this.app.use((req, res, next) => {
      console.log('\n' + '='.repeat(80));
      console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
      if (req.body && Object.keys(req.body).length > 0) {
        console.log(`📋 [请求体] ${JSON.stringify(req.body, null, 2)}`);
      }
      console.log('='.repeat(80));
      next();
    });
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    console.log('[EnhancedGeminiApiServer] 设置路由');
    
    // 健康检查
    this.app.get('/health', this.handleHealthCheck.bind(this));
    
    // 服务信息
    this.app.get('/info', this.handleServiceInfo.bind(this));
    
    // OpenAI兼容接口 - 模型列表
    this.app.get('/v1/models', this.handleModels.bind(this));
    
    // OpenAI兼容接口 - 聊天完成
    this.app.post('/v1/chat/completions', this.handleChatCompletions.bind(this));
    
    // Gemini CLI功能接口
    this.app.post('/v1/gemini/execute', this.handleGeminiExecute.bind(this));
    
    // 扩展列表接口
    this.app.get('/v1/gemini/extensions', this.handleListExtensions.bind(this));
    
    // 轮换状态接口
    this.app.get('/v1/rotation/status', this.handleRotationStatus.bind(this));
    
    // 轮换统计接口
    this.app.get('/v1/rotation/stats', this.handleRotationStats.bind(this));
    
    // 错误处理
    this.app.use(this.handleError.bind(this));
  }

  /**
   * 健康检查处理器
   */
  handleHealthCheck(req, res) {
    console.log('🏥 [健康检查] 处理健康检查请求');
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'enhanced-gemini-cli-bridge',
      version: '1.0.0',
      features: {
        rotation: this.isInitialized,
        openai_compatible: true,
        full_cli_support: true,
        extensions: true,
        sandbox: true,
        telemetry: true
      }
    });
    
    console.log('✅ [健康检查] 请求处理完成');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 服务信息处理器
   */
  handleServiceInfo(req, res) {
    console.log('ℹ️ [服务信息] 处理服务信息请求');
    
    res.json({
      name: 'Enhanced Gemini CLI Bridge',
      description: '完整支持gemini CLI功能的OpenAI兼容API服务',
      version: '1.0.0',
      supported_features: {
        models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        cli_parameters: {
          model: '模型选择',
          debug: '调试模式',
          sandbox: '沙盒模式',
          all_files: '包含所有文件上下文',
          show_memory_usage: '显示内存使用情况',
          yolo: '自动接受所有操作',
          checkpointing: '检查点功能',
          extensions: '扩展支持',
          telemetry: '遥测功能',
          mcp_servers: 'MCP服务器支持'
        },
        rotation: {
          enabled: this.isInitialized,
          strategy: 'round-robin',
          fallback: true
        }
      },
      endpoints: {
        '/health': '健康检查',
        '/info': '服务信息',
        '/v1/models': 'OpenAI兼容模型列表',
        '/v1/chat/completions': 'OpenAI兼容聊天接口',
        '/v1/gemini/execute': 'Gemini CLI直接执行',
        '/v1/gemini/extensions': '扩展列表',
        '/v1/rotation/status': '轮换状态',
        '/v1/rotation/stats': '轮换统计'
      }
    });
    
    console.log('✅ [服务信息] 请求处理完成');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 模型列表处理器
   */
  handleModels(req, res) {
    console.log('📋 [模型列表] 处理模型列表请求');
    
    res.json({
      object: 'list',
      data: [
        {
          id: 'gemini-2.5-pro',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'google',
          description: 'Gemini 2.5 Pro - 最强大的模型，适合复杂任务'
        },
        {
          id: 'gemini-2.5-flash',
          object: 'model', 
          created: Math.floor(Date.now() / 1000),
          owned_by: 'google',
          description: 'Gemini 2.5 Flash - 快速响应模型，适合简单任务'
        },
        {
          id: 'gpt-4',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'google',
          description: 'GPT-4兼容接口，映射到Gemini 2.5 Pro'
        },
        {
          id: 'gpt-3.5-turbo',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'google',
          description: 'GPT-3.5兼容接口，映射到Gemini 2.5 Flash'
        }
      ]
    });
    
    console.log('✅ [模型列表] 请求处理完成');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 聊天完成处理器
   */
  async handleChatCompletions(req, res) {
    const apiKey = this.isInitialized ? apiKeyRotator.getNextApiKey() : null;
    try {
      console.log('💬 [聊天完成] 开始处理聊天完成请求');

      const { messages, stream = false, ...requestBody } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: { message: 'messages字段是必需的且必须是数组', type: 'invalid_request_error' } });
      }

      const { cliArgs, userMessage, hasFunctionCall } = parameterMapper.mapToGeminiCliArgs(requestBody, messages);

      if (!userMessage.trim()) {
        return res.status(400).json({ error: { message: '没有找到有效的用户消息', type: 'invalid_request_error' } });
      }

      console.log(`🚀 [聊天完成] 执行Gemini CLI，参数: ${cliArgs.join(' ')}`);
      const geminiOutput = await executeGeminiCli(userMessage, cliArgs, apiKey, hasFunctionCall);

      if (this.isInitialized && apiKey) {
        apiKeyRotator.reportUsage(apiKey, true);
      }

      if (stream) {
        this.handleStreamResponse(res, geminiOutput, requestBody.model);
      } else {
        this.handleJsonResponse(res, geminiOutput, requestBody, userMessage, hasFunctionCall);
      }

      console.log('✅ [聊天完成] 请求处理完成');
      console.log('='.repeat(80) + '\n');
    } catch (error) {
      console.error('❌ [聊天完成] 处理请求时发生错误:', error);
      if (this.isInitialized && apiKey) {
        apiKeyRotator.reportUsage(apiKey, false);
      }
      console.log('='.repeat(80) + '\n');
      res.status(500).json({ error: { message: error.message || '内部服务器错误', type: 'api_error', code: 'execution_failed' } });
    }
  }

  /**
   * 处理流式响应
   */
  handleStreamResponse(res, geminiOutput, model) {
    console.log('🌊 [聊天完成] 处理流式响应');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 检查是否包含思考过程（通过特定标识符判断）
    const hasReasoningContent = this.extractReasoningContent(geminiOutput);
    
    if (hasReasoningContent.reasoning) {
      // 发送思考过程消息
      const reasoningMessage = {
        type: 'say',
        say: 'reasoning',
        text: hasReasoningContent.reasoning,
        ts: Date.now()
      };
      res.write(`data: ${JSON.stringify(reasoningMessage)}\n\n`);
      
      // 发送最终回复
      if (hasReasoningContent.finalResponse) {
        const finalMessage = {
          type: 'say',
          say: 'text',
          text: hasReasoningContent.finalResponse,
          ts: Date.now()
        };
        res.write(`data: ${JSON.stringify(finalMessage)}\n\n`);
      }
    } else {
      // 标准OpenAI格式响应
      const streamData = {
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: geminiOutput },
          finish_reason: 'stop'
        }]
      };
      res.write(`data: ${JSON.stringify(streamData)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  }

  /**
   * 处理JSON响应
   */
  handleJsonResponse(res, geminiOutput, requestBody, userMessage, hasFunctionCall) {
    console.log('📄 [聊天完成] 处理非流式响应');
    let parsedResponse = geminiOutput;
    let toolCalls = null;
    let finishReason = 'stop';

    if (hasFunctionCall) {
      const { tools, functions } = requestBody;
      const parseResult = parameterMapper.parseFunctionCallResponse(geminiOutput, { tools, functions });
      parsedResponse = parseResult.content;
      toolCalls = parseResult.tool_calls;
      finishReason = parseResult.finish_reason;
    }

    const message = { role: 'assistant', content: parsedResponse };
    if (toolCalls && toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    const response = {
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestBody.model,
      choices: [{
        index: 0,
        message: message,
        finish_reason: finishReason
      }],
      usage: {
        prompt_tokens: userMessage.length,
        completion_tokens: geminiOutput.length,
        total_tokens: userMessage.length + geminiOutput.length
      }
    };

    res.json(response);
  }

  /**
   * 提取思考过程内容
   * @param {string} output - Gemini的原始输出
   * @returns {Object} 包含reasoning和finalResponse的对象
   */
  extractReasoningContent(output) {
    // 尝试解析JSON格式的输出
    try {
      const parsed = JSON.parse(output);
      
      // 检查是否有思考过程标识
      if (parsed.candidates && Array.isArray(parsed.candidates) && parsed.candidates.length > 0 && parsed.candidates[0] && parsed.candidates[0].content) {
        const content = parsed.candidates[0].content;
        const parts = content.parts || [];
        
        let reasoning = '';
        let finalResponse = '';
        
        // 查找思考过程和最终回复
        for (const part of parts) {
          if (part.text) {
            const text = part.text;
            
            // 检查是否包含思考过程标识符
            if (text.includes('思考过程') || text.includes('分析') || text.includes('推理') || 
                text.includes('thinking') || text.includes('reasoning') || text.includes('analysis')) {
              reasoning = text;
            } else {
              finalResponse += text;
            }
          }
        }
        
        if (reasoning) {
          return { reasoning: reasoning.trim(), finalResponse: finalResponse.trim() };
        }
      }
    } catch (e) {
      // 如果不是JSON格式，尝试文本解析
      const lines = output.split('\n');
      let reasoning = '';
      let finalResponse = '';
      let inReasoningSection = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 检查思考过程开始标识
        if (trimmedLine.includes('思考过程') || trimmedLine.includes('分析') || 
            trimmedLine.includes('thinking') || trimmedLine.includes('reasoning')) {
          inReasoningSection = true;
          reasoning += line + '\n';
        } else if (inReasoningSection && (trimmedLine.includes('回复') || trimmedLine.includes('答案') || 
                   trimmedLine.includes('response') || trimmedLine.includes('answer'))) {
          inReasoningSection = false;
          finalResponse += line + '\n';
        } else if (inReasoningSection) {
          reasoning += line + '\n';
        } else {
          finalResponse += line + '\n';
        }
      }
      
      if (reasoning.trim()) {
        return { reasoning: reasoning.trim(), finalResponse: finalResponse.trim() };
      }
    }
    
    return { reasoning: null, finalResponse: output };
  }

  /**
   * Gemini CLI直接执行处理器
   */
  async handleGeminiExecute(req, res) {
    try {
      console.log('⚡ [Gemini执行] 开始处理直接执行请求');
      
      const { prompt, args = [], use_rotation = true } = req.body;
      
      if (!prompt) {
        return res.status(400).json({
          error: {
            message: 'prompt字段是必需的',
            type: 'invalid_request_error'
          }
        });
      }
      
      // 获取API Key
      let apiKey = null;
      if (use_rotation && this.isInitialized) {
        apiKey = apiKeyRotator.getNextApiKey();
      }
      
      // 执行CLI命令（直接执行模式，不涉及function calling）
      const output = await executeGeminiCli(prompt, args, apiKey, false);
      
      // 报告使用结果
      if (use_rotation && this.isInitialized && apiKey) {
        apiKeyRotator.reportUsage(apiKey, true);
      }
      
      res.json({
        success: true,
        output: output,
        prompt: prompt,
        args: args,
        api_key_used: apiKey ? apiKey.substring(0, 10) + '...' : null,
        timestamp: new Date().toISOString()
      });
      
      console.log('✅ [Gemini执行] 请求处理完成');
      console.log('='.repeat(80) + '\n');
      
    } catch (error) {
      console.error('❌ [Gemini执行] 执行失败:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      console.log('='.repeat(80) + '\n');
    }
  }

  /**
   * 扩展列表处理器
   */
  async handleListExtensions(req, res) {
    try {
      console.log('🔌 [扩展列表] 获取扩展列表');
      
      // 执行gemini --list-extensions命令（系统命令，不涉及function calling）
      const output = await executeGeminiCli('', ['--list-extensions'], null, false);
      
      res.json({
        success: true,
        extensions: output,
        timestamp: new Date().toISOString()
      });
      
      console.log('✅ [扩展列表] 请求处理完成');
      console.log('='.repeat(80) + '\n');
      
    } catch (error) {
      console.error('❌ [扩展列表] 获取失败:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      console.log('='.repeat(80) + '\n');
    }
  }

  /**
   * 轮换状态处理器
   */
  handleRotationStatus(req, res) {
    console.log('🔄 [轮换状态] 获取轮换状态');
    
    if (!this.isInitialized) {
      res.json({
        enabled: false,
        message: '轮换功能未初始化'
      });
      
      console.log('✅ [轮换状态] 请求处理完成');
      console.log('='.repeat(80) + '\n');
      return;
    }
    
    const stats = apiKeyRotator.getUsageStats();
    
    res.json({
      enabled: true,
      ...stats,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ [轮换状态] 请求处理完成');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 轮换统计处理器
   */
  handleRotationStats(req, res) {
    console.log('📊 [轮换统计] 获取详细统计');
    
    if (!this.isInitialized) {
      res.json({
        enabled: false,
        message: '轮换功能未初始化'
      });
      
      console.log('✅ [轮换统计] 请求处理完成');
      console.log('='.repeat(80) + '\n');
      return;
    }
    
    const stats = apiKeyRotator.getUsageStats();
    
    res.json({
      enabled: true,
      summary: {
        total_keys: stats.totalKeys,
        current_index: stats.currentIndex,
        total_requests: stats.totalRequests,
        success_rate: stats.totalRequests > 0 ? 
          ((stats.totalSuccesses / stats.totalRequests) * 100).toFixed(2) + '%' : '0%'
      },
      details: stats.keyDetails,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ [轮换统计] 请求处理完成');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 错误处理器
   */
  handleError(err, req, res, next) {
    console.error('💥 [错误处理] 未处理的错误:', err);
    
    res.status(500).json({
      error: {
        message: '内部服务器错误',
        type: 'internal_error',
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * 初始化服务器
   */
  async initialize() {
    console.log('🔧 [EnhancedGeminiApiServer] 开始初始化服务器');
    
    try {
      // 初始化API Key轮换器
      const rotationInitialized = await apiKeyRotator.initialize();
      this.isInitialized = rotationInitialized;
      
      if (rotationInitialized) {
        console.log('✅ [EnhancedGeminiApiServer] API Key轮换器初始化成功');
      } else {
        console.log('⚠️ [EnhancedGeminiApiServer] API Key轮换器初始化失败，将使用默认配置');
      }
      
      console.log('✅ [EnhancedGeminiApiServer] 服务器初始化完成');
      return true;
      
    } catch (error) {
      console.error('❌ [EnhancedGeminiApiServer] 初始化失败:', error);
      return false;
    }
  }

  /**
   * 启动服务器
   */
  async start() {
    console.log('🚀 [EnhancedGeminiApiServer] 启动服务器');
    
    // 先初始化
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, () => {
        console.log(`✅ [EnhancedGeminiApiServer] 服务器启动成功，监听端口 ${this.port}`);
        console.log(`🌐 [EnhancedGeminiApiServer] 服务地址: http://localhost:${this.port}`);
        console.log(`📋 [EnhancedGeminiApiServer] API文档:`);
        console.log(`   - 健康检查: http://localhost:${this.port}/health`);
        console.log(`   - 服务信息: http://localhost:${this.port}/info`);
        console.log(`   - 模型列表: http://localhost:${this.port}/v1/models`);
        console.log(`   - 聊天API: http://localhost:${this.port}/v1/chat/completions`);
        console.log(`   - Gemini执行: http://localhost:${this.port}/v1/gemini/execute`);
        console.log(`   - 扩展列表: http://localhost:${this.port}/v1/gemini/extensions`);
        console.log(`   - 轮换状态: http://localhost:${this.port}/v1/rotation/status`);
        console.log(`   - 轮换统计: http://localhost:${this.port}/v1/rotation/stats`);
        
        resolve(server);
      });
      
      server.on('error', (err) => {
        console.error('❌ [EnhancedGeminiApiServer] 服务器启动失败:', err);
        reject(err);
      });
      
      // 优雅关闭
      process.on('SIGINT', () => {
        console.log('\n🛑 [EnhancedGeminiApiServer] 收到关闭信号，正在关闭服务器...');
        server.close(() => {
          console.log('✅ [EnhancedGeminiApiServer] 服务器已关闭');
          process.exit(0);
        });
      });
    });
  }
}

// 主函数
async function main() {
  console.log('🌟 启动增强版Gemini CLI Bridge API服务');
  
  try {
    const port = process.env.ENHANCED_CLI_SERVER_PORT || 8765;
    const server = new EnhancedGeminiApiServer(port);
    await server.start();
    
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

module.exports = {
  EnhancedGeminiApiServer
};