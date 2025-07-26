/**
 * 测试智能超时计算功能
 */

// 模拟环境变量
process.env.DEFAULT_TIMEOUT = '60';
process.env.FUNCTION_CALL_TIMEOUT = '120';
process.env.COMPLEX_QUERY_TIMEOUT = '180';
process.env.MAX_TIMEOUT = '300';

// 导入超时计算函数（从enhanced-cli-bridge.cjs中提取）
function calculateTimeout(cliArgs = [], hasTools = false) {
  let timeout = parseInt(process.env.DEFAULT_TIMEOUT) || 60;
  
  // Function Calling 需要更长时间
  if (hasTools) {
    timeout = parseInt(process.env.FUNCTION_CALL_TIMEOUT) || 120;
    console.log(`[calculateTimeout] 检测到Function Calling，使用超时: ${timeout}秒`);
  }
  
  // 复杂操作需要更长时间
  const complexArgs = ['--sandbox', '--all-files', '--show-memory-usage', '--checkpointing'];
  const hasComplexArgs = complexArgs.some(arg => cliArgs.includes(arg));
  
  if (hasComplexArgs) {
    timeout = parseInt(process.env.COMPLEX_QUERY_TIMEOUT) || 180;
    console.log(`[calculateTimeout] 检测到复杂操作参数，使用超时: ${timeout}秒`);
  }
  
  // 应用最大超时限制
  const maxTimeout = parseInt(process.env.MAX_TIMEOUT) || 300;
  if (timeout > maxTimeout) {
    timeout = maxTimeout;
    console.log(`[calculateTimeout] 超时时间超过最大限制，调整为: ${timeout}秒`);
  }
  
  console.log(`[calculateTimeout] 最终超时设置: ${timeout}秒`);
  return timeout * 1000; // 转换为毫秒
}

// 测试用例
console.log('=== 智能超时计算测试 ===\n');

console.log('1. 简单对话（默认超时）:');
const timeout1 = calculateTimeout([], false);
console.log(`结果: ${timeout1/1000}秒\n`);

console.log('2. Function Calling:');
const timeout2 = calculateTimeout([], true);
console.log(`结果: ${timeout2/1000}秒\n`);

console.log('3. 沙盒模式:');
const timeout3 = calculateTimeout(['--sandbox'], false);
console.log(`结果: ${timeout3/1000}秒\n`);

console.log('4. Function Calling + 沙盒模式:');
const timeout4 = calculateTimeout(['--sandbox'], true);
console.log(`结果: ${timeout4/1000}秒\n`);

console.log('5. 包含所有文件:');
const timeout5 = calculateTimeout(['--all-files'], false);
console.log(`结果: ${timeout5/1000}秒\n`);

console.log('6. 复杂参数组合:');
const timeout6 = calculateTimeout(['--sandbox', '--all-files', '--show-memory-usage'], false);
console.log(`结果: ${timeout6/1000}秒\n`);

console.log('=== 测试完成 ===');