# Gemini CLI MCP OpenAI Bridge 构建手册

本手册详细说明了如何从零开始构建和运行 Gemini CLI MCP OpenAI Bridge 项目。

## 项目概述

这是一个基于 Gemini CLI 的 MCP (Model Context Protocol) 到 OpenAI API 的桥接服务器，支持多账户管理和流式响应。

## 系统要求

- **操作系统**: macOS, Linux, Windows
- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Git**: 最新版本

## 1. 项目下载

### 克隆项目
```bash
git clone https://github.com/your-repo/gemini-cli-mcp-openai-bridge.git
cd gemini-cli-mcp-openai-bridge
```

### 初始化子模块
```bash
git submodule update --init --recursive
```

## 2. 项目结构说明

```
gemini-cli-mcp-openai-bridge/
├── bridge-server/          # 主要的桥接服务器代码
├── gemini-cli/             # Gemini CLI 子模块 (monorepo)
│   └── packages/
│       ├── core/           # 核心功能包
│       ├── cli/            # 命令行工具
│       ├── bridge-server/  # 桥接服务器包
│       └── vscode-ide-companion/
├── package.json            # 根目录依赖配置
└── README.md
```

## 3. 依赖安装

### 安装根目录依赖
```bash
npm install
```

### 安装 Gemini CLI 依赖
```bash
cd gemini-cli
npm install
```

## 4. 构建流程

### 4.1 构建 Core 包 (重要)

由于项目使用了本地的 core 包，必须先构建 core 包：

```bash
cd gemini-cli/packages/core
npm run build
```

### 4.2 配置 Bridge Server 依赖

确保 bridge-server 使用本地的 core 包：

```bash
cd ../bridge-server

# 检查 package.json 中的依赖配置
# @google/gemini-cli-core 应该指向 "file:../core"

# 如果需要，手动创建符号链接
rm -rf node_modules/@google/gemini-cli-core
mkdir -p node_modules/@google
ln -s ../core node_modules/@google/gemini-cli-core
```

### 4.3 构建 Bridge Server

```bash
# 在 gemini-cli/packages/bridge-server 目录下
npm install
npm run build
```

### 4.4 构建主项目 Bridge Server

```bash
# 回到项目根目录
cd ../../../bridge-server
npm install
npm run build  # 如果有构建脚本
```

## 5. 环境配置

### 5.1 创建环境配置文件

```bash
cd bridge-server
cp .env.multi-account.example .env
```

### 5.2 配置 Gemini API

编辑 `.env` 文件：

```env
# Gemini API 配置
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash

# 服务器配置
PORT=3000
HOST=localhost

# 多账户配置 (可选)
MULTI_ACCOUNT_CONFIG_PATH=./multi-account-config.json
```

### 5.3 多账户配置 (可选)

如果需要多账户支持：

```bash
cp multi-account-config.example.json multi-account-config.json
```

编辑 `multi-account-config.json`：

```json
{
  "accounts": [
    {
      "id": "account1",
      "name": "主账户",
      "apiKey": "your_api_key_1",
      "model": "gemini-2.0-flash"
    },
    {
      "id": "account2",
      "name": "备用账户",
      "apiKey": "your_api_key_2",
      "model": "gemini-1.5-pro"
    }
  ]
}
```

## 6. 运行项目

### 6.1 启动开发服务器

```bash
cd bridge-server
npm start
```

### 6.2 验证服务

服务启动后，可以通过以下方式验证：

```bash
# 检查服务状态
curl http://localhost:3000/health

# 测试 OpenAI 兼容接口
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "gemini-2.0-flash",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

## 7. 常见问题解决

### 7.1 TypeScript 类型错误

如果遇到 `sendMessageStream` 方法参数不匹配的错误：

```bash
# 确保使用本地 core 包
cd gemini-cli/packages/bridge-server
rm -rf node_modules/@google/gemini-cli-core
ln -s ../core node_modules/@google/gemini-cli-core
npm run build
```

### 7.2 依赖版本冲突

```bash
# 清理所有 node_modules
find . -name "node_modules" -type d -exec rm -rf {} +

# 重新安装
npm install
cd gemini-cli && npm install
cd packages/core && npm run build
cd ../bridge-server && npm install && npm run build
```

### 7.3 符号链接问题

在 Windows 系统上，可能需要管理员权限创建符号链接，或者使用硬链接：

```bash
# Windows 替代方案
mklink /D node_modules\@google\gemini-cli-core ..\core
```

## 8. 开发模式

### 8.1 监听文件变化

```bash
# 在 core 包目录下
cd gemini-cli/packages/core
npm run dev  # 如果有开发模式

# 在另一个终端启动 bridge-server
cd bridge-server
npm run dev  # 如果有开发模式
```

### 8.2 调试配置

在 VS Code 中，可以使用以下 launch.json 配置：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Bridge Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/bridge-server/src/index.ts",
      "outFiles": ["${workspaceFolder}/bridge-server/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

## 9. 生产部署

### 9.1 构建生产版本

```bash
# 设置生产环境
export NODE_ENV=production

# 构建所有包
cd gemini-cli/packages/core && npm run build
cd ../bridge-server && npm run build
cd ../../../bridge-server && npm run build
```

### 9.2 Docker 部署 (可选)

```bash
# 构建 Docker 镜像
docker build -t gemini-bridge-server .

# 运行容器
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_api_key \
  gemini-bridge-server
```

## 10. 测试

### 10.1 运行单元测试

```bash
cd gemini-cli
npm test
```

### 10.2 运行集成测试

```bash
cd bridge-server
npm run test:integration  # 如果有集成测试
```

## 11. 维护和更新

### 11.1 更新子模块

```bash
git submodule update --remote
```

### 11.2 更新依赖

```bash
npm update
cd gemini-cli && npm update
```

---

## 技术支持

如果在构建过程中遇到问题，请检查：

1. Node.js 和 npm 版本是否符合要求
2. 所有依赖是否正确安装
3. 环境变量是否正确配置
4. API 密钥是否有效

更多问题请参考项目的 GitHub Issues 或联系维护团队。