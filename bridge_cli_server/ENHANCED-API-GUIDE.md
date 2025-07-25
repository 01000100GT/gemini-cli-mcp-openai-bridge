# 增强版 Gemini CLI Bridge API 服务使用指南

## 概述

增强版 Gemini CLI Bridge API 服务是一个完整的 OpenAI 兼容 API 服务，它通过调用全局安装的 `gemini` CLI 工具来提供 AI 对话功能，同时集成了 API Key 轮换功能，支持所有 `gemini` CLI 的原生参数。

## 主要特性

### ✅ 完整功能支持
- **OpenAI 兼容接口**: 完全兼容 OpenAI API 格式
- **API Key 轮换**: 自动轮换多个 API Key，提高可用性
- **全 CLI 参数支持**: 支持所有 `gemini` CLI 的原生参数
- **流式响应**: 支持实时流式输出
- **扩展系统**: 支持 Gemini CLI 扩展
- **沙盒模式**: 支持安全的代码执行环境
- **调试模式**: 提供详细的调试信息
- **遥测功能**: 支持性能监控和分析

### 🔄 轮换功能优势
- **自动故障转移**: API Key 失效时自动切换
- **负载均衡**: 平均分配请求到不同的 API Key
- **使用统计**: 详细的使用情况和成功率统计
- **持久化状态**: 轮换状态自动保存和恢复

## 服务启动

### 前置条件
1. 全局安装 `gemini-cli`:
   ```bash
   npm install -g @google/generative-ai-cli
   ```

2. 配置 API Key 轮换文件 (`rotation-state.json`):
   ```json
   {
     "currentIndex": 0,
     "lastUsed": "2025-07-25T08:00:00.000Z",
     "totalRequests": 0,
     "apiKeys": [
       {
         "key": "AIzaSyA...",
         "status": "active",
         "requestCount": 0,
         "successCount": 0,
         "failureCount": 0
       }
     ]
   }
   ```

### 启动服务
```bash
cd bridge_cli_server
node enhanced-api-server.cjs
```

服务将在 `http://localhost:3002` 启动。

## API 接口文档

### 1. 健康检查
```bash
GET /health
```

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2025-07-25T08:05:34.486Z",
  "service": "enhanced-gemini-cli-bridge",
  "version": "1.0.0",
  "features": {
    "rotation": true,
    "openai_compatible": true,
    "full_cli_support": true,
    "extensions": true,
    "sandbox": true,
    "telemetry": true
  }
}
```

### 2. 服务信息
```bash
GET /info
```

**响应示例**:
```json
{
  "name": "Enhanced Gemini CLI Bridge",
  "description": "完整支持gemini CLI功能的OpenAI兼容API服务",
  "supported_features": {
    "models": ["gemini-2.5-pro", "gemini-2.5-flash"],
    "cli_parameters": {
      "model": "模型选择",
      "debug": "调试模式",
      "sandbox": "沙盒模式",
      "all_files": "包含所有文件上下文",
      "show_memory_usage": "显示内存使用情况",
      "yolo": "自动接受所有操作",
      "checkpointing": "检查点功能",
      "extensions": "扩展支持",
      "telemetry": "遥测功能",
      "mcp_servers": "MCP服务器支持"
    }
  }
}
```

### 3. 模型列表 (OpenAI 兼容)
```bash
GET /v1/models
```

**响应示例**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "gemini-2.5-pro",
      "object": "model",
      "created": 1753430767,
      "owned_by": "google",
      "description": "Gemini 2.5 Pro - 最强大的模型，适合复杂任务"
    },
    {
      "id": "gemini-2.5-flash",
      "object": "model",
      "created": 1753430767,
      "owned_by": "google",
      "description": "Gemini 2.5 Flash - 快速响应模型，适合简单任务"
    }
  ]
}
```

### 4. 聊天完成 (OpenAI 兼容)
```bash
POST /v1/chat/completions
```

**请求示例**:
```json
{
  "model": "gemini-2.5-pro",
  "messages": [
    {"role": "user", "content": "请简单介绍一下你自己"}
  ],
  "temperature": 0.7,
  "max_tokens": 100,
  "stream": false
}
```

**响应示例**:
```json
{
  "id": "chatcmpl-1753430767060",
  "object": "chat.completion",
  "created": 1753430767,
  "model": "gemini-2.5-pro",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "我是一个大型语言模型，由 Google 训练。\n"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 24,
    "total_tokens": 34
  }
}
```

**流式响应示例**:
```bash
curl -X POST http://localhost:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "告诉我一个笑话"}],
    "stream": true
  }'
```

### 5. Gemini CLI 直接执行
```bash
POST /v1/gemini/execute
```

**请求示例**:
```json
{
  "prompt": "写一个Python函数来计算斐波那契数列",
  "args": ["--model", "gemini-2.5-flash", "--debug"],
  "use_rotation": true
}
```

**响应示例**:
```json
{
  "success": true,
  "output": "```python\ndef fibonacci(n):\n    if n <= 0:\n        return 0\n    elif n == 1:\n        return 1\n    else:\n        a, b = 0, 1\n        for _ in range(2, n + 1):\n            a, b = b, a + b\n        return b\n```",
  "prompt": "写一个Python函数来计算斐波那契数列",
  "args": ["--model", "gemini-2.5-flash", "--debug"],
  "api_key_used": "AIzaSyAGqu...",
  "timestamp": "2025-07-25T08:06:32.554Z"
}
```

### 6. 扩展列表
```bash
GET /v1/gemini/extensions
```

**响应示例**:
```json
{
  "success": true,
  "extensions": "Installed extensions:\n",
  "timestamp": "2025-07-25T08:06:41.250Z"
}
```

### 7. 轮换状态
```bash
GET /v1/rotation/status
```

**响应示例**:
```json
{
  "enabled": true,
  "totalKeys": 3,
  "currentIndex": 0,
  "totalRequests": 3,
  "totalSuccesses": 1,
  "totalFailures": 1,
  "keyDetails": [
    {
      "key": "AIzaSyAN8B...",
      "requests": 1,
      "successes": 0,
      "failures": 1,
      "lastUsed": "2025-07-25T07:15:12.301Z"
    }
  ],
  "timestamp": "2025-07-25T08:05:48.720Z"
}
```

### 8. 轮换统计
```bash
GET /v1/rotation/stats
```

**响应示例**:
```json
{
  "enabled": true,
  "summary": {
    "total_keys": 3,
    "current_index": 0,
    "total_requests": 3,
    "success_rate": "33.33%"
  },
  "details": [...],
  "timestamp": "2025-07-25T08:05:48.720Z"
}
```

## 支持的 CLI 参数

增强版 API 服务支持所有 `gemini` CLI 的原生参数：

| 参数 | 描述 | 示例 |
|------|------|------|
| `-m, --model` | 模型选择 | `gemini-2.5-pro`, `gemini-2.5-flash` |
| `-s, --sandbox` | 沙盒模式 | `true`/`false` |
| `-d, --debug` | 调试模式 | `true`/`false` |
| `-a, --all-files` | 包含所有文件上下文 | `true`/`false` |
| `--show-memory-usage` | 显示内存使用情况 | `true`/`false` |
| `-y, --yolo` | 自动接受所有操作 | `true`/`false` |
| `-c, --checkpointing` | 检查点功能 | `true`/`false` |
| `-e, --extensions` | 扩展列表 | `["ext1", "ext2"]` |
| `--telemetry` | 遥测功能 | `true`/`false` |
| `--allowed-mcp-server-names` | MCP服务器名称 | `["server1", "server2"]` |

## 使用示例

### 基础聊天
```bash
curl -X POST http://localhost:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下自己"}
    ]
  }'
```

### 启用调试模式的代码生成
```bash
curl -X POST http://localhost:3002/v1/gemini/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "创建一个React组件",
    "args": ["--model", "gemini-2.5-pro", "--debug", "--sandbox"]
  }'
```

### 流式响应
```bash
curl -X POST http://localhost:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "讲一个故事"}],
    "stream": true
  }'
```

## 与简化版本的对比

| 功能 | 简化版本 | 增强版本 |
|------|----------|----------|
| OpenAI 兼容接口 | ✅ | ✅ |
| API Key 轮换 | ❌ | ✅ |
| 完整 CLI 参数支持 | ❌ | ✅ |
| 扩展系统 | ❌ | ✅ |
| 沙盒模式 | ❌ | ✅ |
| 调试模式 | ❌ | ✅ |
| 遥测功能 | ❌ | ✅ |
| 使用统计 | ❌ | ✅ |
| 故障转移 | ❌ | ✅ |
| 持久化状态 | ❌ | ✅ |

## 部署建议

### 生产环境
1. **使用 PM2 管理进程**:
   ```bash
   npm install -g pm2
   pm2 start enhanced-api-server.cjs --name "gemini-bridge"
   ```

2. **配置反向代理** (Nginx):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3002;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **环境变量配置**:
   ```bash
   export ENHANCED_CLI_SERVER_PORT=3002
   export GEMINI_API_KEY_ROTATION_FILE=/path/to/rotation-state.json
   ```

### 监控和日志
- 服务提供详细的控制台日志
- 支持轮换状态和使用统计的实时监控
- 可通过 `/v1/rotation/stats` 接口获取详细的使用报告

## 故障排除

### 常见问题

1. **服务启动失败**:
   - 检查 `gemini` CLI 是否正确安装
   - 验证 `rotation-state.json` 文件格式
   - 确认端口 3002 未被占用

2. **API Key 轮换不工作**:
   - 检查 `rotation-state.json` 文件权限
   - 验证 API Key 格式和有效性
   - 查看服务日志中的错误信息

3. **请求失败**:
   - 检查网络连接
   - 验证请求格式是否正确
   - 查看 `/v1/rotation/status` 了解 API Key 状态

### 调试模式
启用调试模式可以获得更详细的执行信息：
```json
{
  "prompt": "你的问题",
  "args": ["--debug"]
}
```

## 总结

增强版 Gemini CLI Bridge API 服务提供了完整的 OpenAI 兼容接口，同时保留了 `gemini` CLI 的所有原生功能。通过集成 API Key 轮换功能，大大提高了服务的可用性和稳定性。无论是简单的聊天应用还是复杂的 AI 工作流，这个服务都能提供强大而灵活的支持。