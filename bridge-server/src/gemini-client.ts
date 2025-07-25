/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config, GeminiChat } from '@google/gemini-cli-core';
import {
  type Content,
  type Part,
  type Tool,
  type FunctionDeclaration,
  type GenerateContentConfig,
  FunctionCallingConfigMode,
} from '@google/genai';
import {
  type OpenAIMessage,
  type MessageContentPart,
  type OpenAIChatCompletionRequest,
  type StreamChunk,
} from './types.js';
import { RotationService } from './rotation/RotationService.js';
import { FallbackManager } from './fallback/FallbackManager.js';
import { logger } from './utils/logger.js';

/**
 * Recursively removes fields from a JSON schema that are not supported by the
 * Gemini API.
 * @param schema The JSON schema to sanitize.
 * @returns A new schema object without the unsupported fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeGeminiSchema(schema: any): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  // Create a new object, filtering out unsupported keys at the current level.
  const newSchema: { [key: string]: any } = {};
  for (const key in schema) {
    if (key !== '$schema' && key !== 'additionalProperties') {
      newSchema[key] = schema[key];
    }
  }

  // Recurse into nested 'properties' and 'items'.
  if (newSchema.properties) {
    const newProperties: { [key: string]: any } = {};
    for (const key in newSchema.properties) {
      newProperties[key] = sanitizeGeminiSchema(newSchema.properties[key]);
    }
    newSchema.properties = newProperties;
  }

  if (newSchema.items) {
    newSchema.items = sanitizeGeminiSchema(newSchema.items);
  }

  return newSchema;
}

export class GeminiApiClient {
  private readonly config: Config;
  private readonly debugMode: boolean;
  // 添加API Key轮换服务
  private rotationService: RotationService | null = null;
  // 添加回退管理器
  private fallbackManager: FallbackManager | null = null;
  // 修复：添加初始化状态跟踪，解决异步竞态条件问题
  private isInitializing = false;
  private initializationPromise?: Promise<void>;

  constructor(config: Config, debugMode = false) {
    this.config = config;
    this.debugMode = debugMode;
    // 修复：启动异步初始化但不阻塞构造函数
    this.initializationPromise = this.initializeServices();
  }

  /**
   * 初始化服务（API Key轮换和回退管理）
   * 如果启用了多账号模式，则创建轮换服务实例
   * 如果启用了回退功能，则创建回退管理器实例
   */
  private async initializeServices(): Promise<void> {
    await this.initializeRotationService();
    await this.initializeFallbackManager();
  }

  /**
   * 初始化API Key轮换服务
   * 如果启用了多账号模式，则创建轮换服务实例
   */
  private async initializeRotationService(): Promise<void> {
    this.isInitializing = true;
    console.log('[GeminiApiClient] [客户端时序1] 开始初始化API Key轮换服务');
    
    try {
      console.log('[GeminiApiClient] [客户端时序2] 创建RotationService实例');
      this.rotationService = new RotationService();
      
      console.log('[GeminiApiClient] [客户端时序3] 调用RotationService.initialize()');
      await this.rotationService.initialize();
      
      console.log('[GeminiApiClient] [客户端时序4] API Key轮换服务初始化成功');
      logger.debug(this.debugMode, 'API Key轮换服务初始化成功');
    } catch (error) {
      console.error('[GeminiApiClient] [客户端时序ERROR] API Key轮换服务初始化失败:', error);
      logger.warn(this.debugMode, 'API Key轮换服务初始化失败，使用默认配置', error);
      this.rotationService = null;
    } finally {
      console.log('[GeminiApiClient] [客户端时序5] 初始化流程完成');
    }
  }

  /**
   * 初始化回退管理器
   * 如果启用了回退功能，则创建回退管理器实例
   */
  private async initializeFallbackManager(): Promise<void> {
    try {
      console.log('[GeminiApiClient] [回退时序1] 开始初始化回退管理器');
      
      this.fallbackManager = new FallbackManager();
      
      // 监听回退事件
      this.fallbackManager.on('modelSwitched', (event) => {
        console.log('[GeminiApiClient] [回退事件] 模型切换:', event);
        logger.info('Model switched due to fallback', event);
      });
      
      this.fallbackManager.on('modelReset', (event) => {
        console.log('[GeminiApiClient] [回退事件] 模型重置:', event);
        logger.info('Model reset to primary', event);
      });
      
      console.log('[GeminiApiClient] [回退时序2] 回退管理器初始化成功');
      logger.info('Fallback manager initialized successfully');
    } catch (error) {
      console.error('[GeminiApiClient] [回退时序ERROR] 回退管理器初始化失败:', error);
      logger.error('Failed to initialize fallback manager', error);
      // 回退管理器初始化失败不应该阻止整个客户端工作
      this.fallbackManager = null;
    } finally {
      this.isInitializing = false;
      console.log('[GeminiApiClient] [回退时序3] 回退管理器初始化流程结束');
    }
  }

  /**
   * Converts OpenAI tool definitions to Gemini tool definitions.
   */
  private convertOpenAIToolsToGemini(
    openAITools?: OpenAIChatCompletionRequest['tools'],
  ): Tool[] | undefined {
    if (!openAITools || openAITools.length === 0) {
      return undefined;
    }

    const functionDeclarations: FunctionDeclaration[] = openAITools
      .filter(tool => tool.type === 'function' && tool.function)
      .map(tool => {
        const sanitizedParameters = sanitizeGeminiSchema(
          tool.function.parameters,
        );
        return {
          name: tool.function.name,
          description: tool.function.description,
          parameters: sanitizedParameters,
        };
      });

    if (functionDeclarations.length === 0) {
      return undefined;
    }

    return [{ functionDeclarations }];
  }

  /**
   * Parses the original function name from a tool_call_id.
   * ID format: "call_{functionName}_{uuid}"
   */
  private parseFunctionNameFromId(toolCallId: string): string {
    const parts = toolCallId.split('_');
    if (parts.length > 2 && parts[0] === 'call') {
      // Reassemble the function name which might contain underscores.
      return parts.slice(1, parts.length - 1).join('_');
    }
    // Fallback mechanism, not ideal but better than sending a wrong name.
    return 'unknown_tool_from_id';
  }

  /**
   * Converts an OpenAI-formatted message to a Gemini-formatted Content object.
   */
  private openAIMessageToGemini(msg: OpenAIMessage): Content {
    // Handle assistant messages, which can contain both text and tool calls
    if (msg.role === 'assistant') {
      const parts: Part[] = [];

      // Handle text content. It can be null when tool_calls are present.
      if (msg.content && typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }

      // Handle tool calls
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const toolCall of msg.tool_calls) {
          if (toolCall.type === 'function' && toolCall.function) {
            try {
              // Gemini API's functionCall.args expects an object, not a string.
              // OpenAI's arguments is a JSON string, so it needs to be parsed.
              const argsObject = JSON.parse(toolCall.function.arguments);
              parts.push({
                functionCall: {
                  name: toolCall.function.name,
                  args: argsObject,
                },
              });
            } catch (e) {
              logger.warn(
                'Failed to parse tool call arguments',
                {
                  arguments: toolCall.function.arguments,
                },
                e,
              );
            }
          }
        }
      }
      return { role: 'model', parts };
    }

    // Handle tool responses
    if (msg.role === 'tool') {
      const functionName = this.parseFunctionNameFromId(msg.tool_call_id || '');
      let responsePayload: Record<string, unknown>;

      try {
        const parsed = JSON.parse(msg.content as string);

        // The Gemini API expects an object for the response.
        // If the parsed content is a non-null, non-array object, use it directly.
        // Otherwise, wrap primitives, arrays, or null in an object.
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          responsePayload = parsed as Record<string, unknown>;
        } else {
          responsePayload = { output: parsed };
        }
      } catch (e) {
        // If parsing fails, it's a plain string. Wrap it.
        responsePayload = { output: msg.content };
      }

      return {
        role: 'user', // A tool response must be in a 'user' role message for Gemini API history.
        parts: [
          {
            functionResponse: {
              name: functionName,
              // Pass the parsed or wrapped object as the response value.
              response: responsePayload,
            },
          },
        ],
      };
    }

    // Handle user and system messages
    const role = 'user'; // system and user roles are mapped to 'user'

    if (typeof msg.content === 'string') {
      return { role, parts: [{ text: msg.content }] };
    }

    if (Array.isArray(msg.content)) {
      const parts = msg.content.reduce<Part[]>((acc, part: MessageContentPart) => {
        if (part.type === 'text') {
          acc.push({ text: part.text || '' });
        } else if (part.type === 'image_url' && part.image_url) {
          const imageUrl = part.image_url.url;
          if (imageUrl.startsWith('data:')) {
            const [mimePart, dataPart] = imageUrl.split(',');
            const mimeType = mimePart.split(':')[1].split(';')[0];
            acc.push({ inlineData: { mimeType, data: dataPart } });
          } else {
            // Gemini API prefers inlineData, but fileData is a possible fallback.
            acc.push({ fileData: { mimeType: 'image/jpeg', fileUri: imageUrl } });
          }
        }
        return acc;
      }, []);

      return { role, parts };
    }

    return { role, parts: [{ text: '' }] };
  }

  /**
   * 发送流式请求到Gemini API
   * 支持API Key轮换和错误重试
   */
  public async sendMessageStream({
    model,
    messages,
    tools,
    tool_choice,
  }: {
    model: string;
    messages: OpenAIMessage[];
    tools?: OpenAIChatCompletionRequest['tools'];
    tool_choice?: any;
  }): Promise<AsyncGenerator<StreamChunk>> {
    console.log('[GeminiApiClient] [请求时序1] 收到sendMessageStream请求');
    
    // 修复：等待初始化完成
    if (this.isInitializing && this.initializationPromise) {
      console.log('[GeminiApiClient] [请求时序2] 检测到初始化正在进行，等待完成...');
      await this.initializationPromise;
      console.log('[GeminiApiClient] [请求时序3] 初始化等待完成');
    }
    
    // 如果启用了API Key轮换，获取当前可用的API Key
    let currentApiKey: string | null = null;
    if (this.rotationService) {
      try {
        console.log('[GeminiApiClient] [请求时序4] 开始获取轮换API Key');
        currentApiKey = await this.rotationService.getApiKey();
        console.log('[GeminiApiClient] [请求时序5] 成功获取轮换API Key');
        logger.debug(this.debugMode, '获取到轮换API Key', { keyPrefix: currentApiKey?.substring(0, 10) + '...' });
      } catch (error) {
        console.error('[GeminiApiClient] [请求时序ERROR] 获取轮换API Key失败:', error);
        logger.warn(this.debugMode, '获取轮换API Key失败，使用默认配置', error);
      }
    } else {
      console.log('[GeminiApiClient] [请求时序4] 轮换服务未启用，跳过API Key获取');
    }

    console.log('[GeminiApiClient] [请求时序6] 开始执行实际请求');
    return this.executeStreamRequest({
      model,
      messages,
      tools,
      tool_choice,
      apiKey: currentApiKey
    });
  }

  /**
   * 执行实际的流式请求
   * 包含错误处理、重试逻辑和回退功能
   */
  private async executeStreamRequest({
    model,
    messages,
    tools,
    tool_choice,
    apiKey
  }: {
    model: string;
    messages: OpenAIMessage[];
    tools?: OpenAIChatCompletionRequest['tools'];
    tool_choice?: any;
    apiKey?: string | null;
  }): Promise<AsyncGenerator<StreamChunk>> {
    let currentModel = model;
    
    // 检查是否需要使用回退模型
    if (this.fallbackManager) {
      currentModel = this.fallbackManager.getCurrentModel();
      console.log(`[GeminiApiClient] [回退时序4] 当前使用模型: ${currentModel}`);
    }
    let clientSystemInstruction: Content | undefined = undefined;
    const useInternalPrompt = !!this.config.getUserMemory(); // Check if there is a prompt from GEMINI.md

    // If not using the internal prompt, treat the client's system prompt as the system instruction.
    if (!useInternalPrompt) {
      const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
      if (systemMessageIndex !== -1) {
        // Splice returns an array of removed items, so we take the first one.
        const systemMessage = messages.splice(systemMessageIndex, 1)[0];
        clientSystemInstruction = this.openAIMessageToGemini(systemMessage);
      }
    }
    // If using internal prompt, the system message from the client (if any)
    // will be converted to a 'user' role message by openAIMessageToGemini,
    // effectively merging it into the conversation history.

    const history = messages.map(msg => this.openAIMessageToGemini(msg));
    const lastMessage = history.pop();

    logger.info('Calling Gemini API', { model });

    logger.debug(this.debugMode, 'Sending request to Gemini', {
      historyLength: history.length,
      lastMessage,
    });

    if (!lastMessage) {
      throw new Error('No message to send.');
    }

    // 修复：动态创建ContentGenerator，使用轮换获取的API Key
    let contentGenerator;
    if (apiKey) {
      // 如果有轮换的API Key，创建新的ContentGenerator
      console.log('[GeminiApiClient] [请求时序7] 使用轮换API Key创建ContentGenerator');
      const { createContentGenerator, AuthType } = await import('@google/gemini-cli-core');
      
      // 修复：直接构造ContentGeneratorConfig，确保apiKey正确传递
      const dynamicConfig = {
        model: this.config.getModel(),
        apiKey: apiKey, // 直接使用轮换获取的API Key
        vertexai: false,
        authType: AuthType.USE_GEMINI,
        proxy: this.config.getProxy()
      };
      
      console.log('[GeminiApiClient] [DEBUG] 动态配置详情:', {
        model: dynamicConfig.model,
        hasApiKey: !!dynamicConfig.apiKey,
        apiKeyPrefix: dynamicConfig.apiKey?.substring(0, 10) + '...',
        authType: dynamicConfig.authType
      });
      
      try {
        contentGenerator = await createContentGenerator(dynamicConfig, this.config);
        logger.debug(this.debugMode, '使用轮换API Key创建ContentGenerator成功');
      } catch (error) {
        console.error('[GeminiApiClient] [ERROR] 创建ContentGenerator失败:', error);
        throw error;
      }
    } else {
      // 使用默认的ContentGenerator
      console.log('[GeminiApiClient] [请求时序7] 使用默认ContentGenerator');
      contentGenerator = this.config.getGeminiClient().getContentGenerator();
    }

    // Create a new, isolated chat session for each request.
    const oneShotChat = new GeminiChat(
      this.config,
      contentGenerator,
      {},
      history,
    );

    const geminiTools = this.convertOpenAIToolsToGemini(tools);

    const generationConfig: GenerateContentConfig = {};
    // If a system prompt was extracted from the client's request, use it. This
    // will override any system prompt set in the GeminiChat instance.
    if (clientSystemInstruction) {
      generationConfig.systemInstruction = clientSystemInstruction;
    }

    if (tool_choice && tool_choice !== 'auto') {
      generationConfig.toolConfig = {
        functionCallingConfig: {
          mode:
            tool_choice.type === 'function'
              ? FunctionCallingConfigMode.ANY
              : FunctionCallingConfigMode.AUTO,
          allowedFunctionNames: tool_choice.function
            ? [tool_choice.function.name]
            : undefined,
        },
      };
    }

    
    const prompt_id = Math.random().toString(16).slice(2);
    
    try {
      const geminiStream = await oneShotChat.sendMessageStream({
        message: lastMessage.parts || [],
        config: {
          tools: geminiTools,
          ...generationConfig,
        },
      }, prompt_id);

      logger.debug(this.debugMode, 'Got stream from Gemini.');
      
      // 如果使用了轮换的API Key，报告成功使用
      if (this.rotationService && apiKey) {
        this.rotationService.reportUsage(apiKey, true).catch(error => {
          logger.warn(this.debugMode, '报告API Key使用情况失败', error);
        });
      }

      // Transform the event stream to a simpler StreamChunk stream
      return (async function* (): AsyncGenerator<StreamChunk> {
        for await (const response of geminiStream) {
          const parts = response.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) {
              yield { type: 'text', data: part.text };
            }
            if (part.functionCall && part.functionCall.name) {
              yield {
                type: 'tool_code',
                data: {
                  name: part.functionCall.name,
                  args:
                    (part.functionCall.args as Record<string, unknown>) ?? {},
                },
              };
            }
          }
        }
      })();
    } catch (error) {
      // 检查是否需要触发回退
      let shouldFallback = false;
      if (this.fallbackManager) {
        shouldFallback = await this.fallbackManager.shouldTriggerFallback(error as Error);
        console.log(`[GeminiApiClient] [回退时序5] 是否需要回退: ${shouldFallback}`);
        
        if (shouldFallback) {
          try {
            const fallbackResult = await this.fallbackManager.triggerFallback(error as Error);
            console.log('[GeminiApiClient] [回退时序6] 回退触发成功:', fallbackResult);
            
            // 使用回退模型重新尝试请求
            const newModel = this.fallbackManager.getCurrentModel();
            console.log(`[GeminiApiClient] [回退时序7] 使用回退模型重试: ${newModel}`);
            
            // 递归调用，使用新模型重试
            return this.executeStreamRequest({
              model: newModel,
              messages,
              tools,
              tool_choice,
              apiKey
            });
          } catch (fallbackError) {
            console.error('[GeminiApiClient] [回退时序ERROR] 回退失败:', fallbackError);
            // 回退失败，继续原有错误处理流程
          }
        }
      }
      
      // 如果使用了轮换的API Key，报告失败使用
      if (this.rotationService && apiKey) {
        this.rotationService.reportUsage(apiKey, false).catch(reportError => {
          logger.warn(this.debugMode, '报告API Key使用失败情况时出错', reportError);
        });
      }
      
      logger.error(this.debugMode, 'Gemini API请求失败', error);
      throw error;
    }
  }
}
