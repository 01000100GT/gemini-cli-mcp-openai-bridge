# 独立版 Gemini CLI Bridge Server 分支说明

## 🎯 分支目的

`standalone-bridge-server` 分支专门用于发布独立版本的 Gemini CLI Bridge Server，该版本完全独立于原有的 TypeScript 项目，可以单独部署和使用。

## 📁 分支内容

### 核心目录
- `bridge_cli_server/` - 完整的独立服务器实现

### 主要文件
- `enhanced-api-server.cjs` - 主服务器文件
- `enhanced-cli-bridge.cjs` - Gemini CLI 桥接逻辑
- `package.json` - 项目依赖管理
- `start.sh` - 一键启动脚本
- `README.md` - 完整使用指南
- `ENHANCED-API-GUIDE.md` - 详细 API 文档
- `QUICK_START.md` - 快速开始指南
- `rotation-state.json.example` - API Key 轮换配置示例

## 🚀 快速使用

### 1. 克隆分支
```bash
git clone -b standalone-bridge-server https://github.com/你的用户名/gemini-cli-mcp-openai-bridge.git
cd gemini-cli-mcp-openai-bridge/bridge_cli_server
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置 API Keys
```bash
cp rotation-state.json.example rotation-state.json
# 编辑 rotation-state.json 文件，替换为你的真实 API Keys
```

### 4. 启动服务
```bash
./start.sh
# 或者
node enhanced-api-server.cjs
```

### 5. 测试服务
```bash
curl http://localhost:3002/health
```

## ✨ 主要特性

- ✅ **OpenAI 兼容 API** - 完全兼容 OpenAI API 格式
- ✅ **API Key 轮换** - 自动轮换多个 API Key，提高可用性
- ✅ **流式响应** - 支持实时流式输出
- ✅ **完整 CLI 参数支持** - 支持所有 Gemini CLI 参数
- ✅ **扩展系统** - 支持 Gemini CLI 扩展功能
- ✅ **调试模式** - 提供详细的调试信息
- ✅ **使用统计** - 实时监控 API 使用情况
- ✅ **沙盒模式** - 安全的代码执行环境

## 📋 API 接口

- `GET /health` - 健康检查
- `GET /info` - 服务信息
- `GET /v1/models` - 模型列表
- `POST /v1/chat/completions` - OpenAI 兼容聊天接口
- `POST /v1/gemini/execute` - Gemini CLI 直接执行
- `GET /v1/gemini/extensions` - 扩展列表
- `GET /v1/rotation/status` - API Key 轮换状态
- `GET /v1/rotation/stats` - 使用统计

## 🔧 环境要求

- Node.js 16+
- Gemini CLI 已安装并配置
- 有效的 Google AI API Keys

## 📖 详细文档

详细使用说明请参考分支中的文档：
- [README.md](./bridge_cli_server/README.md) - 完整使用指南
- [ENHANCED-API-GUIDE.md](./bridge_cli_server/ENHANCED-API-GUIDE.md) - API 详细文档
- [QUICK_START.md](./bridge_cli_server/QUICK_START.md) - 快速开始指南

## 🌟 与主分支的区别

| 特性 | 主分支 (TypeScript) | 独立分支 (Node.js) |
|------|-------------------|------------------|
| 语言 | TypeScript | JavaScript (CommonJS) |
| 依赖 | 复杂的 TypeScript 生态 | 最小化依赖 |
| 部署 | 需要编译构建 | 直接运行 |
| 配置 | 复杂配置文件 | 简单 JSON 配置 |
| 启动 | 多步骤启动 | 一键启动 |
| 维护 | 需要 TypeScript 知识 | 标准 Node.js |

## 🚀 部署建议

### 开发环境
```bash
./start.sh
```

### 生产环境 (PM2)
```bash
npm install -g pm2
pm2 start enhanced-api-server.cjs --name gemini-bridge
```

### Docker 部署
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY bridge_cli_server/ .
RUN npm install
EXPOSE 3002
CMD ["node", "enhanced-api-server.cjs"]
```

## 🆘 故障排除

1. **API Key 无效**: 检查 `rotation-state.json` 中的 API Keys
2. **端口被占用**: 设置环境变量 `PORT=其他端口`
3. **Gemini CLI 未找到**: 确保 Gemini CLI 已安装并在 PATH 中
4. **网络问题**: 确保服务器能访问 Google AI API

## 📝 更新日志

### v1.0.0 (2025-01-25)
- 🎉 首次发布独立版本
- ✅ 完整的 OpenAI 兼容 API
- ✅ API Key 轮换功能
- ✅ 流式响应支持
- ✅ 完整文档和示例

---

**🎯 这个独立分支专为需要简单、快速部署 Gemini CLI Bridge 服务的用户设计！**