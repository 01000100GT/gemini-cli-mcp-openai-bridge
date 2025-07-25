# API Key 轮换功能 PRD (产品需求文档)

## 1. 项目概述

### 1.1 背景
当前 bridge-server 项目支持多账号配置，但缺乏智能的API Key轮换机制。用户希望实现自动轮换使用多个API Key，以提高API调用的稳定性和避免单个账号的配额限制。

### 1.2 目标
实现一个智能的API Key轮换系统，支持：
- 多个API Key的轮换使用
- 使用次数统计和限制
- 持久化存储使用记录
- 服务重启后恢复上次状态

## 2. 功能需求

### 2.1 核心功能

#### 2.1.1 API Key轮换策略
- **轮换规则**: 按顺序轮换使用API Key（round-robin）
- **使用顺序**: 第一次请求使用Key1，第二次使用Key2，依此类推
- **循环机制**: 所有Key使用一轮后，重新从第一个Key开始

#### 2.1.2 使用次数管理
- **单Key限制**: 每个API Key最多使用100次
- **计数器**: 实时跟踪每个Key的使用次数
- **超限处理**: 当Key达到使用限制时，自动跳过该Key

#### 2.1.3 持久化存储
- **存储文件**: 本地JSON文件存储使用记录
- **存储位置**: `bridge-server/data/api-key-usage.json`
- **存储内容**: 
  ```json
  {
    "currentIndex": 0,
    "lastUsedTime": "2025-01-XX",
    "keys": [
      {
        "id": "ssj",
        "name": "主账号ssj",
        "apiKey": "AIzaSy...",
        "usageCount": 25,
        "maxUsage": 100,
        "status": "active",
        "lastUsed": "2025-01-XX"
      }
    ]
  }
  ```

#### 2.1.4 状态恢复
- **启动恢复**: 服务启动时从存储文件恢复上次状态
- **索引恢复**: 从上次使用的Key索引继续轮换
- **计数恢复**: 恢复每个Key的使用次数

### 2.2 配置管理

#### 2.2.1 环境变量配置
```bash
# 启用API Key轮换
API_KEY_ROTATION_ENABLED=true

# 单个Key最大使用次数
API_KEY_MAX_USAGE=100

# 使用记录存储文件路径
API_KEY_USAGE_FILE=./data/api-key-usage.json

# 轮换策略 (round_robin | least_used)
API_KEY_ROTATION_STRATEGY=round_robin
```

#### 2.2.2 API Key配置
继续使用现有的多账号配置方式：
```bash
GEMINI_MULTI_ACCOUNTS='[
  {
    "id": "ssj",
    "name": "主账号ssj",
    "authType": "gemini-api-key",
    "apiKey": "AIzaSy...",
    "status": "active"
  },
  {
    "id": "mycola",
    "name": "备用账号mycola",
    "authType": "gemini-api-key",
    "apiKey": "AIzaSy...",
    "status": "active"
  }
]'
```

## 3. 技术实现方案

### 3.1 架构设计

#### 3.1.1 核心组件
1. **ApiKeyRotationManager**: 轮换管理器
2. **UsageTracker**: 使用次数跟踪器
3. **PersistenceService**: 持久化服务
4. **ConfigLoader**: 配置加载器

#### 3.1.2 文件结构
```
bridge-server/src/
├── rotation/
│   ├── ApiKeyRotationManager.ts    # 轮换管理器
│   ├── UsageTracker.ts             # 使用跟踪器
│   ├── PersistenceService.ts       # 持久化服务
│   ├── types.ts                    # 类型定义
│   └── index.ts                    # 导出接口
├── data/
│   └── api-key-usage.json          # 使用记录存储
└── config/
    └── rotation-config.ts          # 轮换配置
```

### 3.2 核心类设计

#### 3.2.1 ApiKeyRotationManager
```typescript
class ApiKeyRotationManager {
  private currentIndex: number;
  private apiKeys: ApiKeyInfo[];
  private usageTracker: UsageTracker;
  private persistenceService: PersistenceService;
  
  // 获取下一个可用的API Key
  getNextApiKey(): ApiKeyInfo | null;
  
  // 记录API Key使用
  recordUsage(keyId: string): void;
  
  // 重置使用计数
  resetUsageCounts(): void;
  
  // 获取当前状态
  getStatus(): RotationStatus;
}
```

#### 3.2.2 UsageTracker
```typescript
class UsageTracker {
  private usageMap: Map<string, number>;
  private maxUsage: number;
  
  // 增加使用次数
  incrementUsage(keyId: string): number;
  
  // 检查是否超限
  isExceeded(keyId: string): boolean;
  
  // 重置计数
  resetUsage(keyId?: string): void;
  
  // 获取使用统计
  getUsageStats(): UsageStats;
}
```

### 3.3 集成方案

#### 3.3.1 修改 GeminiApiClient
在 `gemini-client.ts` 中集成轮换管理器：
```typescript
export class GeminiApiClient {
  private rotationManager: ApiKeyRotationManager;
  
  constructor(config: Config, debugMode = false) {
    // 初始化轮换管理器
    this.rotationManager = new ApiKeyRotationManager(config);
  }
  
  // 修改API调用方法，使用轮换的API Key
  public async sendMessageStream(params) {
    const apiKey = this.rotationManager.getNextApiKey();
    if (!apiKey) {
      throw new Error('No available API keys');
    }
    
    // 记录使用
    this.rotationManager.recordUsage(apiKey.id);
    
    // 使用选定的API Key进行请求
    // ...
  }
}
```

#### 3.3.2 修改配置加载
在 `config.ts` 中添加轮换配置加载：
```typescript
export function loadRotationConfig(): RotationConfig {
  return {
    enabled: process.env.API_KEY_ROTATION_ENABLED === 'true',
    maxUsage: parseInt(process.env.API_KEY_MAX_USAGE || '100'),
    usageFile: process.env.API_KEY_USAGE_FILE || './data/api-key-usage.json',
    strategy: process.env.API_KEY_ROTATION_STRATEGY || 'round_robin'
  };
}
```

## 4. 数据结构定义

### 4.1 类型定义
```typescript
// API Key信息
interface ApiKeyInfo {
  id: string;
  name: string;
  apiKey: string;
  usageCount: number;
  maxUsage: number;
  status: 'active' | 'inactive' | 'exceeded';
  lastUsed?: string;
}

// 轮换状态
interface RotationStatus {
  currentIndex: number;
  totalKeys: number;
  activeKeys: number;
  lastUsedTime: string;
  totalRequests: number;
}

// 使用统计
interface UsageStats {
  [keyId: string]: {
    count: number;
    percentage: number;
    status: string;
  };
}

// 轮换配置
interface RotationConfig {
  enabled: boolean;
  maxUsage: number;
  usageFile: string;
  strategy: 'round_robin' | 'least_used';
}

// 持久化数据结构
interface PersistenceData {
  currentIndex: number;
  lastUsedTime: string;
  totalRequests: number;
  keys: ApiKeyInfo[];
}
```

## 5. 实现步骤

### 5.1 第一阶段：基础框架
1. 创建 `rotation` 目录和基础文件
2. 实现类型定义和接口
3. 创建 `PersistenceService` 类
4. 实现配置加载功能

### 5.2 第二阶段：核心功能
1. 实现 `UsageTracker` 类
2. 实现 `ApiKeyRotationManager` 类
3. 添加轮换逻辑和使用统计
4. 实现持久化存储和恢复

### 5.3 第三阶段：集成测试
1. 修改 `GeminiApiClient` 集成轮换管理器
2. 修改配置加载逻辑
3. 添加调试日志和错误处理
4. 进行功能测试和验证

### 5.4 第四阶段：优化完善
1. 添加管理接口（重置计数、查看状态等）
2. 优化错误处理和异常情况
3. 添加性能监控和统计
4. 完善文档和使用说明

## 6. 测试方案

### 6.1 单元测试
- `UsageTracker` 计数功能测试
- `PersistenceService` 存储恢复测试
- `ApiKeyRotationManager` 轮换逻辑测试

### 6.2 集成测试
- 多次API调用轮换验证
- 服务重启状态恢复测试
- 配额限制和跳过逻辑测试

### 6.3 压力测试
- 高并发请求下的轮换稳定性
- 长时间运行的状态一致性
- 异常情况下的容错能力

## 7. 监控和日志

### 7.1 关键日志
```typescript
// API Key轮换日志
logger.info('API Key轮换', {
  fromKey: previousKey.name,
  toKey: currentKey.name,
  currentIndex: this.currentIndex,
  usageCount: currentKey.usageCount
});

// 使用次数警告
logger.warn('API Key使用次数接近限制', {
  keyName: key.name,
  currentUsage: key.usageCount,
  maxUsage: key.maxUsage,
  remaining: key.maxUsage - key.usageCount
});

// 配额超限日志
logger.error('API Key配额已用完', {
  keyName: key.name,
  usageCount: key.usageCount,
  maxUsage: key.maxUsage
});
```

### 7.2 状态监控
- 实时使用次数统计
- 轮换频率监控
- 可用Key数量监控
- 异常情况告警

## 8. 风险评估

### 8.1 技术风险
- **并发安全**: 多个请求同时获取API Key可能导致计数不准确
- **文件锁定**: 持久化文件读写可能存在竞争条件
- **内存泄漏**: 长时间运行可能导致内存使用增长

### 8.2 业务风险
- **API限制**: Google API可能有未知的频率限制, 修改时参考其他文档的内容.
- **Key失效**: API Key可能突然失效或被禁用
- **配额变化**: Google可能调整API配额政策

### 8.3 缓解措施
- 使用文件锁或原子操作确保并发安全
- 实现重试机制和降级策略
- 添加健康检查和自动恢复功能
- 定期备份使用记录数据

## 9. 后续优化

### 9.1 功能扩展
- 支持动态添加/删除API Key
- 实现基于响应时间的智能轮换
- 添加API Key健康状态检测
- 支持不同模型使用不同轮换策略

### 9.2 性能优化
- 使用内存缓存减少文件I/O
- 实现异步持久化避免阻塞
- 优化轮换算法提高效率
- 添加连接池和请求队列

### 9.3 管理功能
- Web界面查看使用统计
- API接口管理轮换配置
- 实时监控和告警系统
- 使用报表和分析功能

---

**文档版本**: v1.0  
**创建日期**: 2025-01-XX  
**最后更新**: 2025-01-XX  
**审核状态**: 待审核