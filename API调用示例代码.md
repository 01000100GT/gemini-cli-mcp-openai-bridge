# API 调用示例代码集合

本文档提供了在各种开发环境中调用 Gemini CLI MCP/OpenAI 桥接服务器的具体代码示例。

## 1. Node.js/TypeScript 示例

### 1.1 基础聊天完成

```typescript
import OpenAI from 'openai';

// 配置客户端指向本地桥接服务器
const client = new OpenAI({
  apiKey: 'dummy-key', // 桥接服务器不验证密钥
  baseURL: 'http://localhost:8765/v1',
});

async function basicChat() {
  try {
    const completion = await client.chat.completions.create({
      model: 'gemini-2.5-pro',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的编程助手，擅长解释复杂的技术概念。'
        },
        {
          role: 'user',
          content: '请解释什么是依赖注入，并给出一个 TypeScript 示例。'
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    console.log('AI 回复:', completion.choices[0].message.content);
  } catch (error) {
    console.error('请求失败:', error);
  }
}

// 调用函数
basicChat();
```

### 1.2 流式响应处理

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'dummy-key',
  baseURL: 'http://localhost:8765/v1',
});

async function streamingChat() {
  try {
    const stream = await client.chat.completions.create({
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: '写一个 React 组件来显示用户列表，包含搜索功能。'
        }
      ],
      stream: true,
      temperature: 0.3,
    });

    console.log('开始接收流式响应...');
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        process.stdout.write(content); // 实时输出
      }
      
      // 检查是否完成
      if (chunk.choices[0]?.finish_reason) {
        console.log('\n\n完成原因:', chunk.choices[0].finish_reason);
        break;
      }
    }
  } catch (error) {
    console.error('流式请求失败:', error);
  }
}

streamingChat();
```

### 1.3 工具调用示例

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'dummy-key',
  baseURL: 'http://localhost:8765/v1',
});

// 定义工具函数
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'search_documentation',
      description: '搜索技术文档',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词'
          },
          language: {
            type: 'string',
            enum: ['javascript', 'typescript', 'python', 'java'],
            description: '编程语言'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_code',
      description: '生成代码片段',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: '代码功能描述'
          },
          language: {
            type: 'string',
            description: '编程语言'
          }
        },
        required: ['description', 'language']
      }
    }
  }
];

// 模拟工具函数实现
function searchDocumentation(query: string, language?: string) {
  return {
    results: [
      {
        title: `${language || 'General'} Documentation for ${query}`,
        url: `https://docs.example.com/${query}`,
        summary: `This is documentation about ${query} in ${language || 'multiple languages'}.`
      }
    ]
  };
}

function generateCode(description: string, language: string) {
  const codeExamples = {
    javascript: `// ${description}\nfunction example() {\n  console.log('Hello World');\n}`,
    typescript: `// ${description}\nfunction example(): void {\n  console.log('Hello World');\n}`,
    python: `# ${description}\ndef example():\n    print('Hello World')`,
    java: `// ${description}\npublic class Example {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}`
  };
  
  return {
    code: codeExamples[language as keyof typeof codeExamples] || '// Code example not available',
    language
  };
}

async function toolCallingExample() {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: '我需要学习 TypeScript 的泛型，请帮我搜索相关文档并生成一个示例代码。'
      }
    ];

    let response = await client.chat.completions.create({
      model: 'gemini-2.5-pro',
      messages,
      tools,
      tool_choice: 'auto',
    });

    console.log('AI 初始回复:', response.choices[0].message.content);

    // 处理工具调用
    while (response.choices[0].message.tool_calls) {
      const toolCalls = response.choices[0].message.tool_calls;
      
      // 添加助手消息到对话历史
      messages.push(response.choices[0].message);
      
      // 执行每个工具调用
      for (const toolCall of toolCalls) {
        console.log(`\n执行工具: ${toolCall.function.name}`);
        console.log(`参数:`, JSON.parse(toolCall.function.arguments));
        
        let toolResult;
        
        switch (toolCall.function.name) {
          case 'search_documentation':
            const searchArgs = JSON.parse(toolCall.function.arguments);
            toolResult = searchDocumentation(searchArgs.query, searchArgs.language);
            break;
            
          case 'generate_code':
            const codeArgs = JSON.parse(toolCall.function.arguments);
            toolResult = generateCode(codeArgs.description, codeArgs.language);
            break;
            
          default:
            toolResult = { error: 'Unknown tool' };
        }
        
        console.log('工具执行结果:', toolResult);
        
        // 添加工具结果到对话历史
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }
      
      // 继续对话
      response = await client.chat.completions.create({
        model: 'gemini-2.5-pro',
        messages,
        tools,
      });
      
      console.log('\nAI 后续回复:', response.choices[0].message.content);
    }
    
  } catch (error) {
    console.error('工具调用示例失败:', error);
  }
}

toolCallingExample();
```

### 1.4 多模态输入示例

```typescript
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const client = new OpenAI({
  apiKey: 'dummy-key',
  baseURL: 'http://localhost:8765/v1',
});

async function multimodalExample() {
  try {
    // 读取本地图片并转换为 base64
    const imagePath = path.join(__dirname, 'example-image.jpg');
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    
    const response = await client.chat.completions.create({
      model: 'gemini-2.5-pro',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请分析这张图片中的代码，并解释其功能。如果有任何问题或改进建议，请指出。'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'high' // 可选：high, low, auto
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
    });

    console.log('图片分析结果:', response.choices[0].message.content);
  } catch (error) {
    console.error('多模态请求失败:', error);
  }
}

// 如果图片文件存在则运行示例
if (fs.existsSync(path.join(__dirname, 'example-image.jpg'))) {
  multimodalExample();
} else {
  console.log('请在当前目录放置 example-image.jpg 文件来测试多模态功能');
}
```

## 2. Python 示例

### 2.1 基础使用

```python
import openai
import json
from typing import List, Dict, Any

# 配置客户端
client = openai.OpenAI(
    api_key="dummy-key",
    base_url="http://localhost:8765/v1"
)

def basic_chat_completion():
    """基础聊天完成示例"""
    try:
        response = client.chat.completions.create(
            model="gemini-2.5-pro",
            messages=[
                {
                    "role": "system",
                    "content": "你是一个Python编程专家，擅长解决复杂的编程问题。"
                },
                {
                    "role": "user",
                    "content": "请写一个Python装饰器来测量函数执行时间，并包含详细注释。"
                }
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        print("AI 回复:")
        print(response.choices[0].message.content)
        
    except Exception as e:
        print(f"请求失败: {e}")

def streaming_chat():
    """流式响应示例"""
    try:
        stream = client.chat.completions.create(
            model="gemini-2.5-flash",
            messages=[
                {
                    "role": "user",
                    "content": "解释Python中的异步编程概念，包括async/await的使用。"
                }
            ],
            stream=True,
            temperature=0.3
        )
        
        print("开始接收流式响应...")
        
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                print(chunk.choices[0].delta.content, end="", flush=True)
            
            if chunk.choices[0].finish_reason:
                print(f"\n\n完成原因: {chunk.choices[0].finish_reason}")
                break
                
    except Exception as e:
        print(f"流式请求失败: {e}")

def tool_calling_example():
    """工具调用示例"""
    
    # 定义工具
    tools = [
        {
            "type": "function",
            "function": {
                "name": "execute_python_code",
                "description": "执行Python代码并返回结果",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "要执行的Python代码"
                        }
                    },
                    "required": ["code"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "analyze_data",
                "description": "分析数据并生成统计信息",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "data": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "要分析的数值数据"
                        },
                        "analysis_type": {
                            "type": "string",
                            "enum": ["basic", "detailed", "statistical"],
                            "description": "分析类型"
                        }
                    },
                    "required": ["data"]
                }
            }
        }
    ]
    
    def execute_python_code(code: str) -> Dict[str, Any]:
        """安全执行Python代码（仅用于演示）"""
        try:
            # 注意：在生产环境中不要直接执行用户代码
            # 这里仅用于演示目的
            import io
            import sys
            from contextlib import redirect_stdout
            
            output = io.StringIO()
            with redirect_stdout(output):
                exec(code)
            
            return {
                "success": True,
                "output": output.getvalue(),
                "code": code
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "code": code
            }
    
    def analyze_data(data: List[float], analysis_type: str = "basic") -> Dict[str, Any]:
        """分析数值数据"""
        import statistics
        
        if not data:
            return {"error": "数据为空"}
        
        result = {
            "count": len(data),
            "sum": sum(data),
            "mean": statistics.mean(data),
            "min": min(data),
            "max": max(data)
        }
        
        if analysis_type in ["detailed", "statistical"]:
            if len(data) > 1:
                result.update({
                    "median": statistics.median(data),
                    "stdev": statistics.stdev(data),
                    "variance": statistics.variance(data)
                })
        
        if analysis_type == "statistical":
            # 添加更多统计信息
            sorted_data = sorted(data)
            n = len(data)
            result.update({
                "q1": sorted_data[n//4],
                "q3": sorted_data[3*n//4],
                "range": max(data) - min(data)
            })
        
        return result
    
    try:
        messages = [
            {
                "role": "user",
                "content": "我有一组数据 [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]，请帮我分析这些数据，并写一段Python代码来可视化结果。"
            }
        ]
        
        response = client.chat.completions.create(
            model="gemini-2.5-pro",
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        
        print("AI 初始回复:", response.choices[0].message.content)
        
        # 处理工具调用
        while response.choices[0].message.tool_calls:
            tool_calls = response.choices[0].message.tool_calls
            
            # 添加助手消息到历史
            messages.append({
                "role": "assistant",
                "content": response.choices[0].message.content,
                "tool_calls": [{
                    "id": tc.id,
                    "type": tc.type,
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                } for tc in tool_calls]
            })
            
            # 执行工具调用
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)
                
                print(f"\n执行工具: {function_name}")
                print(f"参数: {function_args}")
                
                if function_name == "execute_python_code":
                    result = execute_python_code(function_args["code"])
                elif function_name == "analyze_data":
                    result = analyze_data(
                        function_args["data"],
                        function_args.get("analysis_type", "basic")
                    )
                else:
                    result = {"error": "未知工具"}
                
                print(f"工具执行结果: {result}")
                
                # 添加工具结果到历史
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False)
                })
            
            # 继续对话
            response = client.chat.completions.create(
                model="gemini-2.5-pro",
                messages=messages,
                tools=tools
            )
            
            print("\nAI 后续回复:", response.choices[0].message.content)
            
    except Exception as e:
        print(f"工具调用示例失败: {e}")

if __name__ == "__main__":
    print("=== 基础聊天完成 ===")
    basic_chat_completion()
    
    print("\n=== 流式响应 ===")
    streaming_chat()
    
    print("\n=== 工具调用示例 ===")
    tool_calling_example()
```

### 2.2 异步版本

```python
import asyncio
import aiohttp
import json
from typing import AsyncGenerator, Dict, Any

class AsyncGeminiClient:
    def __init__(self, base_url: str = "http://localhost:8765/v1"):
        self.base_url = base_url
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer dummy-key"
        }
    
    async def chat_completion(self, **kwargs) -> Dict[str, Any]:
        """异步聊天完成"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=kwargs
            ) as response:
                return await response.json()
    
    async def chat_completion_stream(self, **kwargs) -> AsyncGenerator[Dict[str, Any], None]:
        """异步流式聊天完成"""
        kwargs["stream"] = True
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                headers=self.headers,
                json=kwargs
            ) as response:
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        data = line[6:]
                        if data == '[DONE]':
                            break
                        try:
                            yield json.loads(data)
                        except json.JSONDecodeError:
                            continue

async def async_example():
    """异步使用示例"""
    client = AsyncGeminiClient()
    
    # 基础异步请求
    print("=== 异步基础请求 ===")
    response = await client.chat_completion(
        model="gemini-2.5-pro",
        messages=[
            {
                "role": "user",
                "content": "用Python写一个异步爬虫示例"
            }
        ]
    )
    print(response["choices"][0]["message"]["content"])
    
    # 异步流式请求
    print("\n=== 异步流式请求 ===")
    async for chunk in client.chat_completion_stream(
        model="gemini-2.5-flash",
        messages=[
            {
                "role": "user",
                "content": "解释Python中的协程和事件循环"
            }
        ]
    ):
        content = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
        if content:
            print(content, end="", flush=True)
    
    print("\n\n异步示例完成")

if __name__ == "__main__":
    asyncio.run(async_example())
```

## 3. cURL 命令行示例

### 3.1 基础请求

```bash
#!/bin/bash

# 基础聊天完成
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-key" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {
        "role": "system",
        "content": "你是一个有用的编程助手"
      },
      {
        "role": "user",
        "content": "写一个快速排序算法的实现"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

### 3.2 流式请求

```bash
#!/bin/bash

# 流式聊天完成
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-key" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {
        "role": "user",
        "content": "解释什么是微服务架构"
      }
    ],
    "stream": true,
    "temperature": 0.3
  }' \
  --no-buffer
```

### 3.3 工具调用请求

```bash
#!/bin/bash

# 带工具调用的请求
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy-key" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "帮我查询当前天气"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "获取指定城市的天气信息",
          "parameters": {
            "type": "object",
            "properties": {
              "city": {
                "type": "string",
                "description": "城市名称"
              },
              "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
                "description": "温度单位"
              }
            },
            "required": ["city"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

### 3.4 获取模型列表

```bash
#!/bin/bash

# 获取可用模型列表
curl -X GET http://localhost:8765/v1/models \
  -H "Authorization: Bearer dummy-key"
```

## 4. JavaScript/Browser 示例

### 4.1 浏览器中的基础使用

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gemini Bridge API 示例</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .chat-container {
            border: 1px solid #ddd;
            height: 400px;
            overflow-y: auto;
            padding: 10px;
            margin-bottom: 10px;
            background-color: #f9f9f9;
        }
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 5px;
        }
        .user-message {
            background-color: #e3f2fd;
            text-align: right;
        }
        .assistant-message {
            background-color: #f1f8e9;
        }
        .input-container {
            display: flex;
            gap: 10px;
        }
        #messageInput {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        button {
            padding: 10px 20px;
            background-color: #2196f3;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
        button:hover {
            background-color: #1976d2;
        }
        button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <h1>Gemini Bridge API 聊天示例</h1>
    
    <div class="chat-container" id="chatContainer"></div>
    
    <div class="input-container">
        <input type="text" id="messageInput" placeholder="输入您的消息..." />
        <button onclick="sendMessage()" id="sendButton">发送</button>
        <button onclick="sendStreamMessage()" id="streamButton">流式发送</button>
    </div>
    
    <script>
        const API_BASE_URL = 'http://localhost:8765/v1';
        const API_KEY = 'dummy-key';
        
        let conversationHistory = [];
        
        function addMessage(role, content) {
            const chatContainer = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${role}-message`;
            messageDiv.innerHTML = `<strong>${role === 'user' ? '用户' : 'AI'}:</strong> ${content}`;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function setButtonsEnabled(enabled) {
            document.getElementById('sendButton').disabled = !enabled;
            document.getElementById('streamButton').disabled = !enabled;
        }
        
        async function sendMessage() {
            const messageInput = document.getElementById('messageInput');
            const message = messageInput.value.trim();
            
            if (!message) return;
            
            // 添加用户消息到界面
            addMessage('user', message);
            conversationHistory.push({ role: 'user', content: message });
            
            // 清空输入框并禁用按钮
            messageInput.value = '';
            setButtonsEnabled(false);
            
            try {
                const response = await fetch(`${API_BASE_URL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'gemini-2.5-pro',
                        messages: conversationHistory,
                        temperature: 0.7
                    })
                });
                
                const data = await response.json();
                const assistantMessage = data.choices[0].message.content;
                
                // 添加AI回复到界面和历史
                addMessage('assistant', assistantMessage);
                conversationHistory.push({ role: 'assistant', content: assistantMessage });
                
            } catch (error) {
                console.error('请求失败:', error);
                addMessage('assistant', '抱歉，请求失败了。请检查服务器是否正常运行。');
            } finally {
                setButtonsEnabled(true);
            }
        }
        
        async function sendStreamMessage() {
            const messageInput = document.getElementById('messageInput');
            const message = messageInput.value.trim();
            
            if (!message) return;
            
            // 添加用户消息到界面
            addMessage('user', message);
            conversationHistory.push({ role: 'user', content: message });
            
            // 清空输入框并禁用按钮
            messageInput.value = '';
            setButtonsEnabled(false);
            
            // 创建AI消息容器
            const chatContainer = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message assistant-message';
            messageDiv.innerHTML = '<strong>AI:</strong> <span id="streamingContent"></span>';
            chatContainer.appendChild(messageDiv);
            
            const streamingContent = document.getElementById('streamingContent');
            let fullResponse = '';
            
            try {
                const response = await fetch(`${API_BASE_URL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'gemini-2.5-flash',
                        messages: conversationHistory,
                        stream: true,
                        temperature: 0.7
                    })
                });
                
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
                            if (data === '[DONE]') {
                                break;
                            }
                            
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices[0]?.delta?.content;
                                if (content) {
                                    fullResponse += content;
                                    streamingContent.textContent = fullResponse;
                                    chatContainer.scrollTop = chatContainer.scrollHeight;
                                }
                            } catch (e) {
                                // 忽略解析错误
                            }
                        }
                    }
                }
                
                // 添加完整回复到历史
                conversationHistory.push({ role: 'assistant', content: fullResponse });
                
            } catch (error) {
                console.error('流式请求失败:', error);
                streamingContent.textContent = '抱歉，流式请求失败了。';
            } finally {
                setButtonsEnabled(true);
            }
        }
        
        // 回车键发送消息
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // 初始化对话
        addMessage('assistant', '你好！我是通过 Gemini Bridge API 提供服务的AI助手。有什么可以帮助您的吗？');
    </script>
</body>
</html>
```

## 5. 测试脚本

### 5.1 完整功能测试脚本

```bash
#!/bin/bash

# Gemini Bridge API 测试脚本
# 用法: ./test_api.sh [base_url]

BASE_URL=${1:-"http://localhost:8765"}
API_KEY="dummy-key"

echo "=== Gemini Bridge API 测试 ==="
echo "测试服务器: $BASE_URL"
echo

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo -e "${YELLOW}测试: $name${NC}"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer $API_KEY" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" \
            -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $API_KEY" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ 成功 (HTTP $http_code)${NC}"
        echo "响应: $(echo "$body" | jq -r '.choices[0].message.content // .data[0].id // .object' 2>/dev/null || echo "$body" | head -c 100)..."
    else
        echo -e "${RED}✗ 失败 (HTTP $http_code)${NC}"
        echo "错误: $body"
    fi
    echo
}

# 1. 测试模型列表
test_endpoint "获取模型列表" "GET" "/v1/models" ""

# 2. 测试基础聊天
basic_chat_data='{
  "model": "gemini-2.5-pro",
  "messages": [
    {
      "role": "user",
      "content": "Hello, please respond with just \"Test successful\""
    }
  ],
  "max_tokens": 50
}'

test_endpoint "基础聊天完成" "POST" "/v1/chat/completions" "$basic_chat_data"

# 3. 测试工具调用
tool_call_data='{
  "model": "gemini-2.5-pro",
  "messages": [
    {
      "role": "user",
      "content": "请调用get_time函数获取当前时间"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_time",
        "description": "获取当前时间",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ],
  "tool_choice": "auto"
}'

test_endpoint "工具调用" "POST" "/v1/chat/completions" "$tool_call_data"

# 4. 测试流式响应
echo -e "${YELLOW}测试: 流式响应${NC}"
stream_data='{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "Count from 1 to 5"
    }
  ],
  "stream": true,
  "max_tokens": 50
}'

stream_response=$(curl -s \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$stream_data" \
    "$BASE_URL/v1/chat/completions" | head -n 5)

if echo "$stream_response" | grep -q "data:"; then
    echo -e "${GREEN}✓ 流式响应成功${NC}"
    echo "前几行响应:"
    echo "$stream_response"
else
    echo -e "${RED}✗ 流式响应失败${NC}"
    echo "响应: $stream_response"
fi

echo
echo "=== 测试完成 ==="
```

### 5.2 性能测试脚本

```bash
#!/bin/bash

# 性能测试脚本
# 用法: ./performance_test.sh [concurrent_requests] [total_requests]

CONCURRENT=${1:-5}
TOTAL=${2:-20}
BASE_URL="http://localhost:8765"
API_KEY="dummy-key"

echo "=== Gemini Bridge API 性能测试 ==="
echo "并发请求数: $CONCURRENT"
echo "总请求数: $TOTAL"
echo "测试服务器: $BASE_URL"
echo

# 创建测试数据
test_data='{
  "model": "gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "请简单回复：测试成功"
    }
  ],
  "max_tokens": 20
}'

# 单个请求函数
single_request() {
    local start_time=$(date +%s.%N)
    
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d "$test_data" \
        "$BASE_URL/v1/chat/completions")
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    
    http_code=$(echo "$response" | tail -c 4)
    
    if [ "$http_code" = "200" ]; then
        echo "SUCCESS,$duration"
    else
        echo "FAILED,$duration,$http_code"
    fi
}

# 导出函数以供并行使用
export -f single_request
export test_data BASE_URL API_KEY

# 执行并发测试
echo "开始性能测试..."
start_time=$(date +%s.%N)

# 使用 GNU parallel 或 xargs 进行并发测试
if command -v parallel >/dev/null 2>&1; then
    results=$(seq 1 $TOTAL | parallel -j$CONCURRENT single_request)
else
    # 备用方案：使用 xargs
    results=$(seq 1 $TOTAL | xargs -n1 -P$CONCURRENT -I{} bash -c 'single_request')
fi

end_time=$(date +%s.%N)
total_duration=$(echo "$end_time - $start_time" | bc)

# 分析结果
success_count=$(echo "$results" | grep "^SUCCESS" | wc -l)
failed_count=$(echo "$results" | grep "^FAILED" | wc -l)

if [ $success_count -gt 0 ]; then
    avg_response_time=$(echo "$results" | grep "^SUCCESS" | cut -d',' -f2 | awk '{sum+=$1} END {print sum/NR}')
    min_response_time=$(echo "$results" | grep "^SUCCESS" | cut -d',' -f2 | sort -n | head -1)
    max_response_time=$(echo "$results" | grep "^SUCCESS" | cut -d',' -f2 | sort -n | tail -1)
else
    avg_response_time=0
    min_response_time=0
    max_response_time=0
fi

rps=$(echo "scale=2; $success_count / $total_duration" | bc)

echo
echo "=== 测试结果 ==="
echo "总耗时: ${total_duration}s"
echo "成功请求: $success_count"
echo "失败请求: $failed_count"
echo "成功率: $(echo "scale=2; $success_count * 100 / $TOTAL" | bc)%"
echo "平均响应时间: ${avg_response_time}s"
echo "最小响应时间: ${min_response_time}s"
echo "最大响应时间: ${max_response_time}s"
echo "每秒请求数 (RPS): $rps"

if [ $failed_count -gt 0 ]; then
    echo
    echo "失败请求详情:"
    echo "$results" | grep "^FAILED"
fi
```

这些示例代码涵盖了在各种环境中使用 Gemini CLI MCP/OpenAI 桥接服务器的完整场景，包括：

1. **多语言支持**：TypeScript/JavaScript、Python、cURL
2. **多种使用模式**：同步、异步、流式
3. **完整功能**：基础聊天、工具调用、多模态输入
4. **测试工具**：功能测试、性能测试
5. **实际应用**：浏览器集成、命令行工具

开发者可以根据自己的需求选择合适的示例进行参考和修改。