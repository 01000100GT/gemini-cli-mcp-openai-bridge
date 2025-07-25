# 快速开始指南

## 🚀 立即启动

### 1. 配置API Keys
编辑 `rotation-state.json` 文件，替换示例API Keys为你的真实Gemini API Keys：

```json
{
  "currentIndex": 0,
  "lastUsed": null,
  "totalRequests": 0,
  "apiKeys": [
    {
      "key": "你的真实API_KEY_1",
      "status": "active",
      "requestCount": 0,
      "successCount": 0,
      "failureCount": 0,
      "lastUsed": null
    },
    {
      "key": "你的真实API_KEY_2",
      "status": "active",
      "requestCount": 0,
      "successCount": 0,
      "failureCount": 0,
      "lastUsed": null
    }
  ]
}
```

### 2. 启动服务
```bash
# 方法1: 使用启动脚本（推荐）
./start.sh

# 方法2: 直接启动
node enhanced-api-server.cjs
```

### 3. 测试服务
```bash
# 健康检查
curl http://localhost:8765/health

# 查看轮换状态
curl http://localhost:8765/v1/rotation/status

# 测试聊天API
curl -X POST http://localhost:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-key" \
  -d '{
    "model": "gemini-1.5-flash",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 📋 主要功能

- ✅ **OpenAI兼容API** - 无缝替换OpenAI API
- ✅ **API Key轮换** - 自动轮换多个API Key，提高可用性
- ✅ **流式响应** - 支持实时流式输出
- ✅ **完整CLI参数** - 支持所有Gemini CLI参数
- ✅ **扩展系统** - 支持Gemini CLI扩展
- ✅ **调试模式** - 详细的调试信息
- ✅ **使用统计** - 实时监控API使用情况

## 🔧 配置说明

### 环境变量
- `PORT`: 服务端口（默认8765）
- `GEMINI_API_KEY`: 单个API Key（可选，如果使用轮换功能则不需要）

### 文件说明
- `enhanced-api-server.cjs`: 主服务器文件
- `enhanced-cli-bridge.cjs`: Gemini CLI桥接逻辑
- `rotation-state.json`: API Key轮换配置
- `package.json`: 项目依赖
- `start.sh`: 启动脚本

## 📖 完整文档

详细使用说明请参考：
- [README.md](./README.md) - 完整使用指南
- [ENHANCED-API-GUIDE.md](./ENHANCED-API-GUIDE.md) - API详细文档

## ⚠️ 注意事项

1. **API Keys安全**: 请妥善保管你的API Keys，不要提交到版本控制
2. **网络访问**: 确保服务器能访问Google AI API
3. **Gemini CLI**: 确保已安装并配置Gemini CLI
4. **端口占用**: 默认端口8765，如有冲突请修改

## 🆘 故障排除

### 常见问题
1. **API Key无效**: 检查`rotation-state.json`中的API Keys是否正确
2. **端口被占用**: 修改环境变量`PORT`或杀死占用进程
3. **Gemini CLI未找到**: 确保已安装Gemini CLI并在PATH中
4. **依赖缺失**: 运行`npm install`安装依赖

### 调试模式
```bash
# 启用详细日志
DEBUG=1 node enhanced-api-server.cjs
```

---

🎉 **恭喜！你的独立Gemini CLI Bridge服务已经成功运行！**