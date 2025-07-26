# Bridge CLI Server - Roo-Code Reasoning 支持

## 改造概述

本次改造为 `bridge_cli_server` 添加了对 Roo-Code 思考过程（reasoning）消息格式的支持，使 Gemini 模型的思考过程能够在 Roo-Code IDE 中正确显示。

## 主要改进

### 1. 流式响应中的 Reasoning 支持

- **自动检测思考过程**：服务器会自动检测 Gemini 输出中的思考过程内容
- **Roo-Code 格式**：将思考过程转换为 Roo-Code 期望的消息格式
- **分离显示**：思考过程和最终回复分别发送，支持折叠/展开显示

### 2. 智能内容解析

- **JSON 格式解析**：优化对 Gemini CLI JSON 输出的解析
- **文本内容提取**：从复杂的响应结构中提取纯文本内容
- **多语言支持**：支持中英文思考过程标识符

### 3. 消息格式规范

#### Reasoning 消息格式
```json
{
  "type": "say",
  "say": "reasoning",
  "text": "思考过程内容...",
  "ts": 1735030000000
}
```

#### 最终回复格式
```json
{
  "type": "say",
  "say": "text",
  "text": "最终回复内容...",
  "ts": 1735030000000
}
```

## 技术实现

### 1. 思考过程检测

服务器通过以下方式检测思考过程：

- **关键词识别**：检测包含 "思考过程"、"分析"、"推理"、"thinking"、"reasoning"、"analysis" 等关键词的内容
- **结构化解析**：解析 Gemini CLI 的 JSON 输出结构
- **文本分段**：智能分离思考过程和最终回复

### 2. 响应处理流程

```
Gemini CLI 输出 → JSON 解析 → 内容提取 → 思考过程检测 → 格式转换 → 流式发送
```

### 3. 兼容性保证

- **向后兼容**：保持对标准 OpenAI API 格式的支持
- **优雅降级**：当无法检测到思考过程时，回退到标准格式
- **错误处理**：完善的错误处理和日志记录

## 使用方法

### 1. 启动服务器

```bash
cd /home/sss/devprog/multi_prog_merge/想合并的/bridge_cli_server
node enhanced-api-server.cjs
```

### 2. 在 Roo-Code 中配置

将 API 端点设置为：`http://localhost:8765/v1/chat/completions`

### 3. 测试功能

```bash
# 运行测试脚本
node test-reasoning.js
```

### 4. API 端点

- **健康检查**：`GET /health`
- **服务信息**：`GET /info`
- **模型列表**：`GET /v1/models`
- **聊天API**：`POST /v1/chat/completions`
- **Gemini执行**：`POST /v1/gemini/execute`
- **轮换状态**：`GET /v1/rotation/status`

## 配置说明

### 环境变量

- `ENHANCED_CLI_SERVER_PORT`：服务器端口（默认：8765）
- `GEMINI_API_KEY_*`：Gemini API Keys（支持轮换）
- `GEMINI_WORK_DIR`：Gemini CLI 工作目录
- `DEFAULT_TIMEOUT`：默认超时时间（秒）
- `FUNCTION_CALL_TIMEOUT`：函数调用超时时间（秒）

### 轮换配置

在 `rotation-state.json` 中配置多个 API Key：

```json
{
  "apiKeys": [
    {
      "name": "key1",
      "key": "${GEMINI_API_KEY_1}",
      "active": true
    },
    {
      "name": "key2",
      "key": "${GEMINI_API_KEY_2}",
      "active": true
    }
  ]
}
```

## 日志和调试

服务器提供详细的日志输出：

- 🧠 思考过程检测日志
- 📡 流式响应处理日志
- 🔄 API Key 轮换日志
- ⚙️ CLI 参数和执行日志

## 故障排除

### 1. 思考过程未显示

- 检查 Gemini 模型是否输出了包含思考过程标识符的内容
- 查看服务器日志中的内容解析信息
- 确认 Roo-Code 正确连接到服务器

### 2. 服务器启动失败

- 检查端口是否被占用
- 确认环境变量配置正确
- 查看 `.env` 文件是否存在语法错误

### 3. API Key 轮换问题

- 检查 `rotation-state.json` 文件格式
- 确认环境变量中的 API Key 有效
- 查看轮换状态：`GET /v1/rotation/status`

## 更新日志

### v1.1.0 - Reasoning 支持

- ✅ 添加 Roo-Code reasoning 消息格式支持
- ✅ 优化 Gemini CLI 输出解析
- ✅ 改进流式响应处理
- ✅ 增强错误处理和日志记录
- ✅ 添加测试脚本和文档

---

**注意**：此改造专门为 Roo-Code IDE 优化，确保 AI 模型的思考过程能够正确显示和交互。