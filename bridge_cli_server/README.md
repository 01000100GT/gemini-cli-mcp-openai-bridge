# Gemini CLI Bridge Server

一个独立的增强版 Gemini CLI Bridge API 服务，提供完整的 OpenAI 兼容接口，支持 API Key 轮换和所有 `gemini` CLI 功能。

## 🚀 快速开始

### 前置条件

1. **安装 Node.js** (版本 >= 14.0.0)
2. **全局安装 Gemini CLI**:
   ```bash
   npm install -g @google/generative-ai-cli
   ```
3. **验证 Gemini CLI 安装**:
   ```bash
   gemini --help
   ```

### 安装依赖

```bash
cd bridge_cli_server
npm install
```

### 配置 API Keys

1. 复制示例配置文件:
   ```bash
   cp rotation-state.json.example rotation-state.json
   ```

2. 编辑 `rotation-state.json`，添加你的 Gemini API Keys:
   ```json
   {
     "currentIndex": 0,
     "lastUsed": "2025-01-25T08:00:00.000Z",
     "totalRequests": 0,
     "apiKeys": [
       {
         "key": "AIzaSyA_your_actual_api_key_1",
         "status": "active",
         "requestCount": 0,
         "successCount": 0,
         "failureCount": 0
       },
       {
         "key": "AIzaSyB_your_actual_api_key_2",
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
npm start
```

服务将在 `http://localhost:8765` 启动。

## 📋 主要功能

- ✅ **OpenAI 兼容接口** - 完全兼容 OpenAI API 格式
- 🔄 **API Key 轮换** - 自动轮换多个 API Key，提高可用性
- 🛠️ **全 CLI 参数支持** - 支持所有 `gemini` CLI 的原生参数
- 🌊 **流式响应** - 支持实时流式输出
- 🔌 **扩展系统** - 支持 Gemini CLI 扩展
- 🏖️ **沙盒模式** - 支持安全的代码执行环境
- 🐛 **调试模式** - 提供详细的调试信息
- 📊 **遥测功能** - 支持性能监控和分析

## 🔗 API 接口

### 健康检查
```bash
curl http://localhost:8765/health
```

### OpenAI 兼容聊天接口
```bash
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [
      {"role": "user", "content": "你好，请介绍一下自己"}
    ]
  }'
```

### Gemini CLI 直接执行
```bash
curl -X POST http://localhost:8765/v1/gemini/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "写一个Python函数来计算斐波那契数列",
    "args": ["--model", "gemini-2.5-flash", "--debug"]
  }'
```

### 轮换状态查看
```bash
curl http://localhost:8765/v1/rotation/status
```

## 📖 完整文档

详细的使用指南请参考 [ENHANCED-API-GUIDE.md](./ENHANCED-API-GUIDE.md)

## 🔧 环境变量

### 基础配置

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `ENHANCED_CLI_SERVER_PORT` | 服务端口 | `8765` |
| `GEMINI_API_KEY_ROTATION_FILE` | 轮换配置文件路径 | `./rotation-state.json` |

### OpenAI兼容接口默认参数

| 变量名 | 描述 | 默认值 | 说明 |
|--------|------|--------|------|
| `DEFAULT_TEMPERATURE` | 默认温度参数 | `0.7` | 控制输出的随机性，范围0-2 |
| `DEFAULT_MAX_TOKENS` | 默认最大令牌数 | `1000` | 控制输出长度 |
| `DEFAULT_STREAM` | 默认流式输出设置 | `false` | true/false，是否启用流式响应 |

**注意**: 当客户端在请求中提供了 `temperature`、`max_tokens` 或 `stream` 参数时，会覆盖环境变量中的默认值。

## 📁 文件结构

```
bridge_cli_server/
├── enhanced-cli-bridge.cjs      # 核心功能模块
├── enhanced-api-server.cjs      # API 服务器主文件
├── package.json                 # 项目配置和依赖
├── rotation-state.json.example  # 轮换配置示例
├── rotation-state.json          # 实际轮换配置（需要创建）
├── ENHANCED-API-GUIDE.md        # 详细使用指南
└── README.md                    # 本文件
```

## 🚀 生产部署

### 使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start enhanced-api-server.cjs --name "gemini-bridge"

# 查看状态
pm2 status

# 查看日志
pm2 logs gemini-bridge
```

### 使用 Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 安装 Gemini CLI
RUN npm install -g @google/generative-ai-cli

# 复制项目文件
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8765

CMD ["npm", "start"]
```

## 🛠️ 故障排除

### 常见问题

1. **服务启动失败**:
   - 检查 `gemini` CLI 是否正确安装: `gemini --version`
   - 验证 `rotation-state.json` 文件格式
   - 确认端口 8765 未被占用

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

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

如果遇到问题，请：
1. 查看 [ENHANCED-API-GUIDE.md](./ENHANCED-API-GUIDE.md) 中的故障排除部分
2. 检查服务日志输出
3. 提交 Issue 描述问题详情