# 多账号管理功能说明

## 概述

多账号管理功能允许您配置多个Google账号来循环使用Gemini 2.5 Pro模型，当某个账号的Pro模型配额用完时，系统会自动切换到下一个可用账号。当所有账号的Pro配额都用完时，系统可以自动切换到Flash模型作为备用。

## 主要特性

- 🔄 **自动账号轮换**: 支持多种轮换策略（轮询、最少使用、随机）
- 📊 **配额跟踪**: 自动跟踪每个账号的Pro模型使用次数
- ⚡ **智能回退**: 当所有Pro账号配额用完时，自动切换到Flash模型
- 🔐 **多种认证**: 支持API Key、OAuth、Vertex AI等多种认证方式
- 📈 **实时统计**: 提供详细的账号使用统计信息
- 🛡️ **故障恢复**: 账号切换失败时的自动恢复机制

## 快速开始

### 1. 配置账号信息

创建环境变量配置文件：

```bash
cp .env.multi-account.example .env
```

编辑 `.env` 文件，配置您的账号信息：

```bash
# 多账号配置（JSON格式）
GEMINI_MULTI_ACCOUNTS='[
  {
    "id": "account_1",
    "name": "主账号",
    "authType": "gemini-api-key",
    "apiKey": "YOUR_GEMINI_API_KEY_1",
    "status": "active",
    "proUsageCount": 0,
    "proQuotaLimit": 50
  },
  {
    "id": "account_2",
    "name": "备用账号",
    "authType": "gemini-api-key",
    "apiKey": "YOUR_GEMINI_API_KEY_2",
    "status": "active",
    "proUsageCount": 0,
    "proQuotaLimit": 50
  }
]'

# 轮换策略
GEMINI_ROTATION_STRATEGY=round_robin

# Flash回退模型
GEMINI_FLASH_FALLBACK_MODEL=gemini-2.5-flash
```

### 2. 启动服务

```bash
# 启用多账号模式
npm start -- --enable-multi-account

# 或者指定更多选项
npm start -- --enable-multi-account --account-rotation-strategy=least_used --debug
```

## 详细配置

### 账号配置参数

每个账号配置包含以下参数：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 账号唯一标识符 |
| `name` | string | ✅ | 账号显示名称 |
| `authType` | string | ✅ | 认证类型：`gemini-api-key`、`oauth-personal`、`vertex-ai` |
| `apiKey` | string | 条件 | API Key（当authType为gemini-api-key时必需） |
| `projectId` | string | 条件 | GCP项目ID（当authType为vertex-ai时必需） |
| `status` | string | ✅ | 账号状态：`active`、`quota_exceeded`、`disabled` |
| `proUsageCount` | number | ✅ | 当前Pro模型使用次数 |
| `proQuotaLimit` | number | ✅ | Pro模型配额限制 |
| `lastUsedAt` | string | ❌ | 最后使用时间（ISO格式） |
| `quotaResetAt` | string | ❌ | 配额重置时间（ISO格式） |

### 轮换策略

支持三种账号轮换策略：

1. **round_robin** (默认): 按顺序轮换账号
2. **least_used**: 优先使用使用次数最少的账号
3. **random**: 随机选择可用账号

### 命令行选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--enable-multi-account` | boolean | false | 启用多账号管理 |
| `--account-rotation-strategy` | string | round_robin | 账号轮换策略 |
| `--disable-flash-fallback` | boolean | false | 禁用Flash模型回退 |

## 使用示例

### 基本使用

```bash
# 启用多账号模式
npm start -- --enable-multi-account
```

### 指定轮换策略

```bash
# 使用最少使用策略
npm start -- --enable-multi-account --account-rotation-strategy=least_used

# 使用随机策略
npm start -- --enable-multi-account --account-rotation-strategy=random
```

### 禁用Flash回退

```bash
# 禁用Flash回退（当所有Pro账号用完时会报错而不是切换到Flash）
npm start -- --enable-multi-account --disable-flash-fallback
```

### 调试模式

```bash
# 启用调试模式查看详细日志
npm start -- --enable-multi-account --debug
```

## 工作流程

1. **初始化**: 系统启动时加载所有配置的账号
2. **账号选择**: 根据轮换策略选择当前活跃账号
3. **请求处理**: 使用当前账号处理API请求
4. **配额跟踪**: 每次使用Pro模型时增加使用计数
5. **自动切换**: 当账号配额用完时自动切换到下一个可用账号
6. **Flash回退**: 当所有Pro账号都用完时切换到Flash模型

## 监控和统计

系统启动时会显示账号统计信息：

```
📊 账号统计: 3/4 个账号可用
📈 Pro配额使用: 25/200
```

日志中会显示账号切换信息：

```
🔄 切换到账号 备用账号1，继续使用 gemini-2.5-pro 模型
⚡ 所有账号的 gemini-2.5-pro 配额已用完，自动切换到 gemini-2.5-flash
```

## 故障排除

### 常见问题

1. **配置解析错误**
   ```
   解析多账号配置失败: SyntaxError: Unexpected token
   ```
   - 检查JSON格式是否正确
   - 确保引号和括号匹配
   - 使用在线JSON验证器检查格式

2. **认证失败**
   ```
   切换到账号 备用账号 失败: Authentication failed
   ```
   - 检查API Key是否有效
   - 确认GCP项目ID是否正确
   - 验证账号权限设置

3. **配额限制**
   ```
   账号 主账号 Pro模型配额已用完
   ```
   - 这是正常行为，系统会自动切换到下一个账号
   - 可以手动重置配额或等待配额自动重置

### 调试技巧

1. **启用调试模式**:
   ```bash
   npm start -- --enable-multi-account --debug
   ```

2. **检查配置**:
   ```bash
   # 验证JSON格式
   echo $GEMINI_MULTI_ACCOUNTS | jq .
   ```

3. **查看日志**:
   - 关注账号切换日志
   - 检查认证错误信息
   - 监控配额使用情况

## 最佳实践

1. **账号配置**:
   - 混合使用不同类型的认证方式
   - 设置合理的配额限制
   - 定期检查账号状态

2. **配额管理**:
   - 根据实际API配额设置proQuotaLimit
   - 监控使用情况避免超出限制
   - 考虑设置配额重置计划

3. **故障恢复**:
   - 配置多个备用账号
   - 启用Flash回退作为最后保障
   - 定期测试账号可用性

4. **安全考虑**:
   - 妥善保管API Key
   - 定期轮换认证凭据
   - 使用环境变量而非硬编码

## API接口

多账号管理器提供以下方法（通过EnhancedConfig访问）：

- `getCurrentAccountInfo()`: 获取当前账号信息
- `getAllAccountsInfo()`: 获取所有账号信息
- `getAccountStats()`: 获取账号统计信息
- `switchToNextAccount()`: 手动切换到下一个账号
- `resetAccountQuota(accountId)`: 重置指定账号配额
- `resetAllAccountsQuota()`: 重置所有账号配额
- `canUseModel(model)`: 检查是否可以使用指定模型
- `getEffectiveModel()`: 获取有效的模型（考虑配额限制）

## 更新日志

### v1.0.0
- 初始版本发布
- 支持多账号轮换
- 支持Flash模型回退
- 支持多种认证方式
- 提供详细的配置选项和监控功能