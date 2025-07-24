# Gemini CLI MCP OpenAI Bridge API 使用指南

## API 概览

本服务提供两种主要的 API 接口：
1. **MCP 协议接口** - 用于 MCP 客户端集成
2. **OpenAI 兼容接口** - 用于现有 OpenAI 应用的无缝迁移

## 服务端点

- **基础地址**: `http://localhost:8765`
- **MCP 端点**: `http://localhost:8765/mcp`
- **OpenAI API 端点**: `http://localhost:8765/v1`

## OpenAI 兼容 API

### 1. Chat Completions API

#### 基础聊天请求

```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "stream": false
  }'
```

#### 流式响应请求

```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "写一首关于春天的诗"
      }
    ],
    "stream": true
  }'
```

#### 工具调用请求

```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "请搜索最新的人工智能新闻"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "google_web_search",
          "description": "Search the web using Google",
          "parameters": {
            "type": "object",
            "properties": {
              "query": {
                "type": "string",
                "description": "Search query"
              }
            },
            "required": ["query"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

### 2. Models API

```bash
curl http://localhost:8765/v1/models
```

**响应示例**:
```json
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

## Python 客户端示例

### 使用 OpenAI Python 库

```python
import openai

# 配置客户端
client = openai.OpenAI(
    base_url="http://localhost:8765/v1",
    api_key="dummy-key"  # 可以是任意值，服务器不验证
)

# 基础聊天
response = client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[
        {"role": "user", "content": "你好，请介绍一下自己"}
    ]
)
print(response.choices[0].message.content)

# 流式响应
stream = client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[
        {"role": "user", "content": "写一个关于机器学习的故事"}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="")

# 工具调用
tools = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file from the filesystem",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the file to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gemini-2.5-pro",
    messages=[
        {"role": "user", "content": "请读取 /path/to/file.txt 文件的内容"}
    ],
    tools=tools,
    tool_choice="auto"
)

print(response.choices[0].message)
```

### 使用 requests 库

```python
import requests
import json

def chat_with_gemini(message, stream=False):
    url = "http://localhost:8765/v1/chat/completions"
    
    payload = {
        "model": "gemini-2.5-pro",
        "messages": [
            {"role": "user", "content": message}
        ],
        "stream": stream
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    if stream:
        response = requests.post(url, json=payload, headers=headers, stream=True)
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data = line[6:]
                    if data != '[DONE]':
                        try:
                            chunk = json.loads(data)
                            content = chunk['choices'][0]['delta'].get('content', '')
                            if content:
                                print(content, end='', flush=True)
                        except json.JSONDecodeError:
                            pass
    else:
        response = requests.post(url, json=payload, headers=headers)
        result = response.json()
        return result['choices'][0]['message']['content']

# 使用示例
response = chat_with_gemini("解释一下量子计算的基本原理")
print(response)

# 流式响应
print("流式响应:")
chat_with_gemini("写一首关于编程的诗", stream=True)
```

## JavaScript/Node.js 客户端示例

### 使用 OpenAI JavaScript 库

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8765/v1',
  apiKey: 'dummy-key', // 可以是任意值
});

// 基础聊天
async function basicChat() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: 'user', content: '你好，请介绍一下 TypeScript' }],
    model: 'gemini-2.5-pro',
  });
  
  console.log(completion.choices[0].message.content);
}

// 流式响应
async function streamChat() {
  const stream = await openai.chat.completions.create({
    model: 'gemini-2.5-pro',
    messages: [{ role: 'user', content: '写一个 JavaScript 函数来计算斐波那契数列' }],
    stream: true,
  });
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
}

// 工具调用
async function toolCall() {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'google_web_search',
        description: 'Search the web using Google',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: ['query']
        }
      }
    }
  ];
  
  const completion = await openai.chat.completions.create({
    model: 'gemini-2.5-pro',
    messages: [{ role: 'user', content: '搜索最新的 Node.js 版本信息' }],
    tools: tools,
    tool_choice: 'auto'
  });
  
  console.log(completion.choices[0].message);
}

// 执行示例
basicChat();
streamChat();
toolCall();
```

### 使用 fetch API

```javascript
// 基础聊天函数
async function chatWithGemini(message, stream = false) {
  const response = await fetch('http://localhost:8765/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: message }],
      stream: stream
    })
  });
  
  if (stream) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                process.stdout.write(content);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    }
  } else {
    const result = await response.json();
    return result.choices[0].message.content;
  }
}

// 使用示例
chatWithGemini('解释一下 async/await 的工作原理').then(console.log);

// 流式响应
console.log('流式响应:');
chatWithGemini('写一个关于 Web 开发的教程大纲', true);
```

## MCP 协议集成

### MCP 客户端配置示例

```json
{
  "mcpServers": {
    "gemini-bridge": {
      "command": "node",
      "args": ["-e", "console.log('MCP client connecting to http://localhost:8765/mcp')"],
      "transport": {
        "type": "http",
        "url": "http://localhost:8765/mcp"
      }
    }
  }
}
```

### MCP 工具调用示例

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def use_mcp_tools():
    # 连接到 MCP 服务器
    async with stdio_client(StdioServerParameters(
        command="curl",
        args=["-X", "POST", "http://localhost:8765/mcp"]
    )) as (read, write):
        async with ClientSession(read, write) as session:
            # 初始化连接
            await session.initialize()
            
            # 列出可用工具
            tools = await session.list_tools()
            print("Available tools:", [tool.name for tool in tools.tools])
            
            # 调用工具
            result = await session.call_tool(
                "google_web_search",
                {"query": "Python asyncio tutorial"}
            )
            print("Search result:", result.content)

# 运行示例
asyncio.run(use_mcp_tools())
```

## 可用工具列表

根据配置的安全策略，以下工具可能可用：

### 文件操作工具
- `read_file` - 读取文件内容
- `write_file` - 写入文件内容
- `list_directory` - 列出目录内容
- `search_file_content` - 搜索文件内容

### 网络工具
- `google_web_search` - Google 网络搜索
- `web_fetch` - 获取网页内容

### 系统工具
- `run_shell_command` - 执行 Shell 命令（受安全策略限制）

### 工具参数示例

```json
{
  "read_file": {
    "file_path": "/path/to/file.txt"
  },
  "write_file": {
    "file_path": "/path/to/output.txt",
    "content": "Hello, World!"
  },
  "google_web_search": {
    "query": "machine learning tutorials",
    "num_results": 5
  },
  "run_shell_command": {
    "command": "ls -la"
  }
}
```

## 错误处理

### 常见错误码

- `400` - 请求格式错误
- `401` - 认证失败
- `403` - 权限不足（安全策略限制）
- `429` - 配额限制
- `500` - 服务器内部错误

### 错误响应格式

```json
{
  "error": {
    "message": "Authentication failed",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}
```

### Python 错误处理示例

```python
import openai
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8765/v1",
    api_key="dummy-key"
)

try:
    response = client.chat.completions.create(
        model="gemini-2.5-pro",
        messages=[{"role": "user", "content": "Hello"}]
    )
    print(response.choices[0].message.content)
except openai.AuthenticationError as e:
    print(f"认证错误: {e}")
except openai.RateLimitError as e:
    print(f"配额限制: {e}")
except openai.APIError as e:
    print(f"API 错误: {e}")
except Exception as e:
    print(f"未知错误: {e}")
```

## 性能优化建议

### 1. 连接复用
- 使用连接池复用 HTTP 连接
- 避免频繁创建新的客户端实例

### 2. 流式响应
- 对于长文本生成，使用流式响应提高用户体验
- 及时处理流式数据，避免内存积累

### 3. 错误重试
- 实现指数退避重试机制
- 区分可重试和不可重试的错误

### 4. 超时设置
- 设置合理的请求超时时间
- 对于长时间运行的工具调用，增加超时时间

```python
# 超时设置示例
client = OpenAI(
    base_url="http://localhost:8765/v1",
    api_key="dummy-key",
    timeout=60.0  # 60秒超时
)
```

## 监控和日志

### 请求日志格式

服务器会记录详细的请求日志：

```
[2024-01-15 10:30:45] INFO: OpenAI bridge request received {
  "requestId": "req_123456",
  "model": "gemini-2.5-pro",
  "stream": false
}

[2024-01-15 10:30:46] INFO: OpenAI bridge request finished {
  "requestId": "req_123456",
  "status": "success",
  "durationMs": 1250
}
```

### 性能监控

可以通过日志监控以下指标：
- 请求响应时间
- 成功率
- 错误类型分布
- 工具调用频率
- 账号配额使用情况

这个 API 使用指南提供了完整的集成示例和最佳实践，帮助开发者快速集成和使用 Gemini CLI MCP OpenAI Bridge 服务。