# 多账号启动使用说明

本文档说明如何使用多账号模式启动 Gemini CLI Bridge 服务。

## 启动命令

### 1. 标准启动（单账号模式）
```bash
npm start
```

### 2. 多账号启动（使用环境变量配置）
```bash
npm run start:multi
# 或者
npm run start:multi-account
```

### 3. 多账号启动（使用配置文件）
```bash
# 使用默认配置文件 multi-account-config.json
npm run start:multi-account

# 使用自定义配置文件
node dist/index.js --enable-multi-account --config-file=my-config.json
```

### 4. 调试模式启动
```bash
# 单账号调试
npm run debug

# 多账号调试
node --inspect-brk dist/index.js --enable-multi-account
```

## 命令行参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--enable-multi-account` | boolean | false | 启用多账号管理模式 |
| `--config-file` | string | multi-account-config.json | 多账号配置文件路径 |
| `--account-rotation-strategy` | string | round_robin | 账号轮换策略 (round_robin/least_used/random) |
| `--disable-flash-fallback` | boolean | false | 禁用Flash模型回退 |

## 配置方式

### 方式1：环境变量配置

复制 `.env.multi-account.example` 为 `.env` 并配置：

```bash
cp .env.multi-account.example .env
# 编辑 .env 文件，配置多账号信息
```

### 方式2：配置文件

复制 `multi-account-config.example.json` 为 `multi-account-config.json` 并配置：

```bash
cp multi-account-config.example.json multi-account-config.json
# 编辑配置文件，添加账号信息
```

## 启动示例

### 基础多账号启动
```bash
# 构建项目
npm run build

# 启动多账号模式
npm run start:multi
```

### 自定义配置启动
```bash
# 使用自定义配置文件和轮换策略
node dist/index.js \
  --enable-multi-account \
  --config-file=production-accounts.json \
  --account-rotation-strategy=least_used \
  --port=8080
```

### 开发调试启动
```bash
# 启用调试模式和详细日志
node --inspect-brk dist/index.js \
  --enable-multi-account \
  --debug \
  --account-rotation-strategy=round_robin
```

## 监控和状态

启动后，服务会显示：
- 📊 账号统计信息
- 📈 Pro配额使用情况
- 🔄 当前轮换策略
- ⚡ Flash回退状态

## 故障排除

### 配置文件不存在
如果指定的配置文件不存在，系统会自动回退到环境变量配置：
```
⚠️ 配置文件不存在: /path/to/config.json，回退到环境变量配置
```

### 配置解析失败
如果配置文件格式错误，系统会显示错误并回退：
```
❌ 配置文件解析失败: Unexpected token in JSON
🔄 回退到环境变量配置
```

### 无可用账号
如果所有账号都不可用，系统会根据配置决定是否回退到Flash模型：
```
⚠️ 所有Pro账号都不可用，回退到Flash模型
```

## 相关文档

- [多账号管理详细说明](./MULTI_ACCOUNT_README.md)
- [配置文件示例](./multi-account-config.example.json)
- [环境变量示例](./.env.multi-account.example)