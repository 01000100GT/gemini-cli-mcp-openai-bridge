# 回退模型功能 (Fallback Model Feature)

## 概述

回退模型功能为 bridge-server 提供了自动模型切换能力，当主模型遇到配额超限、限速等错误时，系统会自动切换到备用模型，确保服务的连续性和可用性。

## 核心组件

### 1. FallbackService
- **位置**: `src/fallback/FallbackService.ts`
- **功能**: 核心回退逻辑，包括错误检测、模型切换、状态管理
- **特性**: 支持持久化状态、自动重置、统计信息收集

### 2. FallbackManager
- **位置**: `src/fallback/FallbackManager.ts`
- **功能**: 回退功能的统一管理接口，集成到现有系统
- **特性**: 事件驱动、配置热重载、健康状态监控

### 3. FallbackPersistence
- **位置**: `src/fallback/FallbackPersistence.ts`
- **功能**: 回退状态的持久化存储
- **特性**: 文件锁机制、并发安全、数据完整性保护

### 4. 错误检测
- **位置**: `src/fallback/errorDetection.ts`
- **功能**: 识别各种类型的API错误
- **支持的错误类型**:
  - 配额超限 (Quota Exceeded)
  - 限速错误 (Rate Limit)
  - Pro模型配额超限
  - 服务器错误 (5xx)
  - 网络错误

## 环境变量配置

```bash
# 启用回退功能
GEMINI_FALLBACK_ENABLED=true

# 主模型（默认使用的模型）
GEMINI_PRIMARY_MODEL=gemini-2.0-flash-exp

# 回退模型（主模型失败时使用）
GEMINI_FALLBACK_MODEL=gemini-1.5-flash

# 触发条件（逗号分隔）
GEMINI_FALLBACK_TRIGGER_CONDITIONS=quota_exceeded,rate_limit,server_error

# 最大重试次数
GEMINI_FALLBACK_MAX_RETRIES=3

# 重试延迟（毫秒）
GEMINI_FALLBACK_RETRY_DELAY=1000

# 自动重置功能
GEMINI_FALLBACK_AUTO_RESET_ENABLED=true
GEMINI_FALLBACK_AUTO_RESET_DELAY=300000  # 5分钟

# 持久化设置
GEMINI_FALLBACK_PERSISTENCE_ENABLED=true
GEMINI_FALLBACK_PERSISTENCE_FILE=./data/fallback-state.json
```

## 使用示例

### 1. 基本使用

```typescript
import { FallbackManager } from './fallback/FallbackManager.js';

// 创建回退管理器
const fallbackManager = new FallbackManager();

// 检查当前模型
const currentModel = fallbackManager.getCurrentModel();
console.log('当前使用模型:', currentModel);

// 检查是否需要回退
const error = new Error('Quota exceeded');
const shouldFallback = await fallbackManager.shouldTriggerFallback(error);

if (shouldFallback) {
  // 触发回退
  const result = await fallbackManager.triggerFallback(error);
  console.log('回退结果:', result);
}
```

### 2. 事件监听

```typescript
// 监听模型切换事件
fallbackManager.on('modelSwitched', (event) => {
  console.log('模型已切换:', event);
});

// 监听模型重置事件
fallbackManager.on('modelReset', (event) => {
  console.log('模型已重置:', event);
});
```

### 3. 获取统计信息

```typescript
// 获取回退统计信息
const stats = fallbackManager.getStats();
console.log('回退统计:', stats);

// 获取当前状态
const state = fallbackManager.getState();
console.log('当前状态:', state);
```

## 集成到 GeminiApiClient

回退功能已集成到 `src/gemini-client.ts` 中，在 API 请求失败时自动触发：

```typescript
// 在 executeStreamRequest 方法中
try {
  // 执行API请求
  await contentGenerator.generateStreamContent(...);
} catch (error) {
  // 检查是否需要回退
  if (this.fallbackManager) {
    const shouldFallback = await this.fallbackManager.shouldTriggerFallback(error);
    if (shouldFallback) {
      // 触发回退并重试
      await this.fallbackManager.triggerFallback(error);
      const newModel = this.fallbackManager.getCurrentModel();
      // 使用新模型重试请求
      return this.executeStreamRequest(messages, { ...options, model: newModel }, ...);
    }
  }
  // 处理错误
}
```

## 测试

运行测试脚本验证回退功能：

```bash
# 运行回退功能测试
node src/fallback/test-fallback.js
```

## 监控和日志

### 日志输出
- 所有回退操作都会记录详细日志
- 使用 `[fallback/ComponentName]` 前缀便于过滤
- 包含时序标记便于调试

### 统计信息
- 总回退次数
- 成功/失败切换次数
- 按错误类型分组的统计
- 平均回退持续时间

### 健康检查
```typescript
const health = fallbackManager.getHealthStatus();
console.log('回退功能健康状态:', health);
```

## 注意事项

1. **配置验证**: 确保主模型和回退模型都是有效的模型名称
2. **权限检查**: 确保API Key对回退模型有访问权限
3. **持久化文件**: 确保持久化文件路径可写
4. **并发安全**: 多实例部署时注意文件锁机制
5. **资源清理**: 应用关闭时调用 `destroy()` 方法清理资源

## 故障排除

### 常见问题

1. **回退不生效**
   - 检查 `GEMINI_FALLBACK_ENABLED` 是否为 `true`
   - 确认错误类型在触发条件中
   - 查看日志中的错误检测结果

2. **持久化失败**
   - 检查文件路径权限
   - 确认目录存在
   - 查看文件锁相关日志

3. **自动重置不工作**
   - 检查 `GEMINI_FALLBACK_AUTO_RESET_ENABLED` 配置
   - 确认重置延迟设置合理
   - 查看定时器相关日志

### 调试模式

设置环境变量启用详细日志：
```bash
DEBUG=fallback:*
```