# 开发工具集成与API调用指南

## 项目概述

本项目是一个 **Gemini CLI MCP/OpenAI 桥接服务器**，它将 Google Gemini API 包装成 OpenAI 兼容的 API 格式，使得任何支持 OpenAI API 的开发工具都能够调用 Gemini 模型。

## 核心实现原理

### 1. 架构设计

```
开发工具 (Cursor/VS Code) 
    ↓ OpenAI API 格式请求
桥接服务器 (Bridge Server)
    ↓ 协议转换
Gemini CLI Core
    ↓ Google AI API
Google Gemini 模型
```

### 2. 协议转换机制

#### 2.1 请求转换流程

**OpenAI 格式 → Gemini 格式**

```typescript
// OpenAI 请求格式
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true
}

// 转换为 Gemini 格式
{
  "contents": [
    {"role": "user", "parts": [{"text": "Hello"}]}
  ],
  "generationConfig": {...}
}
```

#### 2.2 响应转换流程

**Gemini 流式响应 → OpenAI 流式响应**

```typescript
// Gemini 响应块
{
  "candidates": [{
    "content": {
      "parts": [{"text": "Hello there!"}]
    }
  }]
}

// 转换为 OpenAI SSE 格式
data: {
  "id": "chatcmpl-xxx",
  "object": "chat.completion.chunk",
  "choices": [{
    "delta": {"content": "Hello there!"},
    "finish_reason": null
  }]
}
```

### 3. 核心组件分析

#### 3.1 OpenAI 路由器 (`openai.ts`)

**功能**：处理 OpenAI 兼容的 HTTP 请求

```typescript
// 主要端点
POST /chat/completions  // 聊天完成
GET /models            // 模型列表

// 核心处理逻辑
router.post('/chat/completions', async (req, res) => {
  const body = req.body as OpenAIChatCompletionRequest;
  
  // 1. 创建 Gemini 客户端
  const client = new GeminiApiClient(config, debugMode);
  
  // 2. 发送流式请求到 Gemini
  const geminiStream = await client.sendMessageStream({
    model: body.model,
    messages: body.messages,
    tools: body.tools,
    tool_choice: body.tool_choice,
  });
  
  // 3. 转换并返回响应
  if (body.stream) {
    // 流式响应处理
    const openAIStream = createOpenAIStreamTransformer(body.model);
    // ... 流处理逻辑
  } else {
    // 非流式响应处理
    // ... 聚合响应逻辑
  }
});
```

#### 3.2 Gemini 客户端 (`gemini-client.ts`)

**功能**：将 OpenAI 格式转换为 Gemini 格式并调用 Gemini API

```typescript
class GeminiApiClient {
  // 消息格式转换
  private openAIMessageToGemini(msg: OpenAIMessage): Content {
    switch (msg.role) {
      case 'assistant':
        // 处理助手消息（文本 + 工具调用）
        return { role: 'model', parts: [...] };
      
      case 'tool':
        // 处理工具响应
        return { role: 'user', parts: [{
          functionResponse: {
            name: functionName,
            response: responsePayload
          }
        }] };
      
      case 'user':
      case 'system':
        // 处理用户和系统消息
        return { role: 'user', parts: [...] };
    }
  }
  
  // 工具定义转换
  private convertOpenAIToolsToGemini(openAITools): Tool[] {
    return openAITools.map(tool => ({
      functionDeclarations: [{
        name: tool.function.name,
        description: tool.function.description,
        parameters: sanitizeGeminiSchema(tool.function.parameters)
      }]
    }));
  }
}
```

#### 3.3 流转换器 (`stream-transformer.ts`)

**功能**：将 Gemini 流式响应转换为 OpenAI SSE 格式

```typescript
export function createOpenAIStreamTransformer(
  model: string
): TransformStream<StreamChunk, Uint8Array> {
  return new TransformStream({
    transform(chunk: StreamChunk, controller) {
      switch (chunk.type) {
        case 'text':
          // 文本内容转换
          const delta = { content: chunk.data };
          enqueueChunk(controller, createChunk(delta));
          break;
          
        case 'tool_code':
          // 工具调用转换
          const toolCallId = `call_${name}_${randomUUID()}`;
          // 分两个块发送：函数名 + 参数
          break;
      }
    },
    
    flush(controller) {
      // 发送结束标记
      enqueueChunk(controller, createChunk({}, finish_reason));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    }
  });
}
```

## 开发工具集成指南

### 1. Cursor 集成

#### 1.1 配置步骤

1. **启动桥接服务器**
```bash
cd /path/to/gemini-cli-mcp-openai-bridge
npm run start
# 服务器默认运行在 http://localhost:8765
```

2. **配置 Cursor**

打开 Cursor 设置，找到 AI 配置部分：

```json
{
  "cursor.ai.openaiApiKey": "dummy-key",
  "cursor.ai.openaiBaseUrl": "http://localhost:8765/v1",
  "cursor.ai.model": "gemini-2.5-pro"
}
```

#### 1.2 使用示例

```typescript
// 在 Cursor 中，你可以直接使用 AI 功能
// 1. 代码补全
// 2. 聊天对话
// 3. 代码解释
// 4. 重构建议

// 示例：请求代码优化
// Cursor 会发送如下请求到桥接服务器：
/*
POST http://localhost:8765/v1/chat/completions
{
  "model": "gemini-2.5-pro",
  "messages": [
    {
      "role": "user",
      "content": "优化这段代码：\nfunction add(a, b) { return a + b; }"
    }
  ],
  "stream": true
}
*/
```

### 2. VS Code 集成

#### 2.1 使用 Continue 插件

1. **安装 Continue 插件**
```bash
code --install-extension continue.continue
```

2. **配置 Continue**

创建或编辑 `~/.continue/config.json`：

```json
{
  "models": [
    {
      "title": "Gemini Pro via Bridge",
      "provider": "openai",
      "model": "gemini-2.5-pro",
      "apiKey": "dummy-key",
      "apiBase": "http://localhost:8765/v1"
    }
  ],
  "tabAutocompleteModel": {
    "title": "Gemini Flash via Bridge",
    "provider": "openai",
    "model": "gemini-2.5-flash",
    "apiKey": "dummy-key",
    "apiBase": "http://localhost:8765/v1"
  }
}
```

#### 2.2 使用 GitHub Copilot Chat (自定义端点)

如果你有 GitHub Copilot 订阅，可以通过代理方式使用：

```json
// VS Code settings.json
{
  "github.copilot.advanced": {
    "debug.overrideEngine": "gemini-2.5-pro",
    "debug.overrideProxyUrl": "http://localhost:8765/v1"
  }
}
```

### 3. 其他开发工具集成

#### 3.1 JetBrains IDEs (IntelliJ, PyCharm 等)

使用 AI Assistant 插件：

```xml
<!-- 在 IDE 设置中配置 -->
<ai-assistant>
  <openai>
    <api-key>dummy-key</api-key>
    <base-url>http://localhost:8765/v1</base-url>
    <model>gemini-2.5-pro</model>
  </openai>
</ai-assistant>
```

#### 3.2 Vim/Neovim

使用 `copilot.vim` 或 `codeium.nvim`：

```lua
-- Neovim 配置
require('codeium').setup({
  config_path = vim.fn.expand('~/.codeium/config.json'),
  api = {
    host = 'localhost',
    port = 8765,
    path = '/v1/chat/completions'
  }
})
```

## API 端点详细说明

### 1. 聊天完成端点

```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "gemini-2.5-pro",
  "messages": [
    {
      "role": "system",
      "content": "你是一个有用的编程助手"
    },
    {
      "role": "user",
      "content": "解释什么是递归"
    }
  ],
  "stream": true,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_code",
        "description": "搜索代码库",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "搜索查询"
            }
          },
          "required": ["query"]
        }
      }
    }
  ]
}
```

### 2. 模型列表端点

```http
GET /v1/models

# 响应
{
  "object": "list",
  "data": [
    {
      "id": "gemini-2.5-pro",
      "object": "model",
      "owned_by": "google"
    },
    {
      "id": "gemini-2.5-flash",
      "object": "model",
      "owned_by": "google"
    }
  ]
}
```

## 高级功能

### 1. 工具调用支持

桥接服务器完全支持 OpenAI 的工具调用格式：

```typescript
// 工具定义（OpenAI 格式）
const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "获取天气信息",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "城市名称" }
        },
        required: ["location"]
      }
    }
  }
];

// 自动转换为 Gemini 格式
const geminiTools = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description: "获取天气信息",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string", description: "城市名称" }
          },
          required: ["location"]
        }
      }
    ]
  }
];
```

### 2. 流式响应处理

```typescript
// 客户端流式处理示例
const response = await fetch('http://localhost:8765/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer dummy-key'
  },
  body: JSON.stringify({
    model: 'gemini-2.5-pro',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true
  })
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') {
        console.log('Stream finished');
        break;
      }
      
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        if (content) {
          process.stdout.write(content);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
}
```

### 3. 多模态支持

```typescript
// 图像输入支持
const messages = [
  {
    role: "user",
    content: [
      {
        type: "text",
        text: "这张图片显示了什么？"
      },
      {
        type: "image_url",
        image_url: {
          url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
        }
      }
    ]
  }
];
```

## 故障排除

### 1. 常见问题

#### 问题：连接被拒绝
```bash
# 检查服务器是否运行
curl http://localhost:8765/v1/models

# 如果失败，重启服务器
npm run start
```

#### 问题：认证失败
```bash
# 检查 Google Cloud 认证
gcloud auth application-default login

# 验证认证状态
gcloud auth application-default print-access-token
```

#### 问题：模型不可用
```bash
# 检查可用模型
curl http://localhost:8765/v1/models

# 确保使用正确的模型名称
# - gemini-2.5-pro
# - gemini-2.5-flash
```

### 2. 调试模式

```bash
# 启用调试模式
npm run start -- --debug

# 查看详细日志
tail -f logs/bridge-server.log
```

### 3. 性能优化

```bash
# 使用 PM2 进行生产部署
npm install -g pm2
pm2 start npm --name "gemini-bridge" -- run start

# 负载均衡
pm2 start npm --name "gemini-bridge" -i max -- run start
```

## 安全考虑

### 1. API 密钥管理

```bash
# 设置环境变量
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
export GEMINI_API_KEY="your-api-key"

# 或使用 .env 文件
echo "GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json" > .env
echo "GEMINI_API_KEY=your-api-key" >> .env
```

### 2. 网络安全

```bash
# 仅本地访问
npm run start -- --host 127.0.0.1

# 使用 HTTPS（生产环境）
npm run start -- --ssl-cert /path/to/cert.pem --ssl-key /path/to/key.pem
```

### 3. 访问控制

```typescript
// 添加 API 密钥验证中间件
router.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

## 总结

本桥接服务器通过以下核心机制实现了 OpenAI API 到 Gemini API 的无缝转换：

1. **协议转换**：将 OpenAI 的请求/响应格式转换为 Gemini 格式
2. **流式处理**：支持实时流式响应，提供良好的用户体验
3. **工具调用**：完整支持函数调用功能
4. **多模态**：支持文本、图像等多种输入类型
5. **兼容性**：与所有支持 OpenAI API 的开发工具兼容

通过这种设计，开发者可以在不修改现有工具配置的情况下，直接使用 Google Gemini 的强大能力。