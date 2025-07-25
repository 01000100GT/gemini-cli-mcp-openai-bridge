# API Key轮换功能

本模块实现了Gemini API Key的自动轮换功能，支持多账号管理、使用统计、故障恢复等特性。

## 功能特性

- ✅ **多账号支持**: 支持配置多个Gemini API Key进行轮换使用
- ✅ **智能轮换**: 基于使用次数、时间间隔和错误率的智能轮换策略
- ✅ **故障恢复**: 自动检测失效的API Key并进行冷却处理
- ✅ **使用统计**: 详细的使用统计和监控信息
- ✅ **持久化存储**: 使用状态持久化，重启后保持轮换状态
- ✅ **配置灵活**: 支持环境变量和配置文件多种配置方式

## 配置方式

### 方式1: 环境变量配置（推荐）

```bash
# 启用多账号模式
export GEMINI_MULTI_ACCOUNTS_ENABLED=true

# 配置多个API Key（JSON格式）
export GEMINI_MULTI_ACCOUNTS='{
  "enabled": true,
  "accounts": [
    {
      "name": "account1",
      "apiKey": "your-api-key-1",
      "quota": {
        "requestsPerMinute": 60,
        "requestsPerDay": 1500
      }
    },
    {
      "name": "account2", 
      "apiKey": "your-api-key-2",
      "quota": {
        "requestsPerMinute": 60,
        "requestsPerDay": 1500
      }
    }
  ]
}'

# 轮换配置参数
export GEMINI_ROTATION_MAX_REQUESTS=100        # 每个Key最大请求数
export GEMINI_ROTATION_INTERVAL=300000        # 轮换间隔(毫秒)
export GEMINI_ROTATION_MAX_FAILURES=3         # 最大连续失败次数
export GEMINI_ROTATION_COOLDOWN=600000        # 冷却期(毫秒)
export GEMINI_ROTATION_PERSISTENCE_FILE=./data/rotation-state.json  # 持久化文件路径
```

### 方式2: 分别配置API Key

```bash
# 启用多账号模式
export GEMINI_MULTI_ACCOUNTS_ENABLED=true

# 分别配置API Key
export GEMINI_API_KEY_1=your-api-key-1
export GEMINI_API_KEY_2=your-api-key-2
export GEMINI_API_KEY_3=your-api-key-3
# ... 可以配置更多

# 配置配额（可选）
export GEMINI_QUOTA_REQUESTS_PER_MINUTE=60
export GEMINI_QUOTA_REQUESTS_PER_DAY=1500
```

## 核心组件

### 1. RotationService
主要的轮换服务类，提供统一的API Key管理接口。

```typescript
const rotationService = new RotationService();
await rotationService.initialize();

// 获取可用的API Key
const apiKey = await rotationService.getApiKey();

// 报告使用情况
await rotationService.reportUsage(apiKey, true); // 成功
await rotationService.reportUsage(apiKey, false); // 失败
```

### 2. ApiKeyRotationManager
核心的轮换管理器，负责API Key的选择、状态跟踪和轮换逻辑。

### 3. ConfigLoader
配置加载器，从环境变量和配置文件中加载轮换配置。

### 4. PersistenceService
持久化服务，负责保存和恢复API Key的使用状态。

## 轮换策略

### 1. 轮询轮换 (Round Robin)
按顺序轮换使用API Key，确保负载均衡。

### 2. 最少使用优先 (Least Used)
优先使用请求次数最少的API Key。

### 3. 基于时间的轮换
根据配置的时间间隔自动轮换API Key。

### 4. 故障转移
当API Key出现连续失败时，自动切换到其他可用的Key。

## 监控和统计

### 获取轮换状态
```typescript
const status = await rotationService.getRotationStatus();
console.log('轮换状态:', {
  totalKeys: status.totalKeys,      // 总Key数量
  activeKeys: status.activeKeys,    // 活跃Key数量
  currentKey: status.currentKey,    // 当前使用的Key
  lastRotation: status.lastRotation // 上次轮换时间
});
```

### 获取使用统计
```typescript
const stats = await rotationService.getUsageStats();
console.log('使用统计:', {
  totalRequests: stats.totalRequests,    // 总请求数
  successfulRequests: stats.successfulRequests, // 成功请求数
  failedRequests: stats.failedRequests,  // 失败请求数
  averageResponseTime: stats.averageResponseTime, // 平均响应时间
  keyStats: stats.keyStats            // 各Key的详细统计
});
```

## 错误处理

### 1. API Key失效处理
- 自动检测API Key失效
- 将失效的Key标记为不可用
- 设置冷却期，定期重试

### 2. 配额超限处理
- 监控API Key的使用配额
- 达到限制时自动切换到其他Key
- 支持按分钟和按天的配额管理

### 3. 网络错误处理
- 区分网络错误和API错误
- 网络错误时进行重试
- API错误时切换Key

## 文件结构

```
rotation/
├── README.md                    # 本文档
├── types.ts                     # 类型定义
├── RotationService.ts           # 主要轮换服务
├── ApiKeyRotationManager.ts     # 轮换管理器
├── ConfigLoader.ts              # 配置加载器
├── PersistenceService.ts        # 持久化服务
└── test-rotation.ts             # 测试脚本
```

## 测试

运行测试脚本验证轮换功能：

```bash
# 编译TypeScript
npm run build

# 运行测试
node dist/rotation/test-rotation.js
```

## 注意事项

1. **API Key安全**: 请妥善保管API Key，不要在代码中硬编码
2. **配额管理**: 合理设置配额限制，避免超出Google的API限制
3. **持久化文件**: 确保持久化文件的目录有写入权限
4. **监控**: 建议定期检查轮换状态和使用统计
5. **备份**: 重要的配置和状态文件建议定期备份

## 故障排除

### 1. 轮换服务初始化失败
- 检查环境变量配置是否正确
- 确认API Key格式和有效性
- 查看日志中的详细错误信息

### 2. API Key获取失败
- 确认至少有一个可用的API Key
- 检查API Key是否已过期或被禁用
- 查看冷却状态，等待冷却期结束

### 3. 持久化文件错误
- 检查文件路径和权限
- 确认目录存在且可写
- 必要时删除损坏的持久化文件重新开始