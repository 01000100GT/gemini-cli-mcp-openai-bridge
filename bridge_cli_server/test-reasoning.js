/**
 * 测试 Roo-Code reasoning 消息格式支持
 */

const axios = require('axios');

// 直接连接到本地API服务器，不使用代理
const axiosConfig = {};

const API_BASE = 'http://localhost:8765';

/**
 * 测试流式响应中的 reasoning 支持
 */
async function testReasoningStream() {
  console.log('🧪 测试流式响应中的 reasoning 支持');
  
  try {
    const response = await axios.post(`${API_BASE}/v1/chat/completions`, {
      model: 'gemini-2.5-pro',
      messages: [
        {
          role: 'user',
          content: '请分析一下为什么天空是蓝色的，并在回答中包含你的思考过程。'
        }
      ],
      stream: true
    }, {
      responseType: 'stream'
    });
    
    console.log('📡 开始接收流式响应...');
    
    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const data = JSON.parse(line.substring(6));
            
            if (data.type === 'say' && data.say === 'reasoning') {
              console.log('🧠 收到思考过程消息:');
              console.log(data.text);
              console.log('---');
            } else if (data.type === 'say' && data.say === 'text') {
              console.log('💬 收到最终回复:');
              console.log(data.text);
              console.log('---');
            } else {
              console.log('📄 收到标准格式消息:');
              console.log(JSON.stringify(data, null, 2));
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    });
    
    response.data.on('end', () => {
      console.log('✅ 流式响应测试完成');
    });
    
  } catch (error) {
    console.error('❌ 流式响应测试失败:', error.message);
  }
}

/**
 * 测试非流式响应
 */
async function testNormalResponse() {
  console.log('🧪 测试非流式响应');
  
  try {
    const response = await axios.post(`${API_BASE}/v1/chat/completions`, {
      model: 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: '简单回答：1+1等于多少？'
        }
      ],
      stream: false
    });
    
    console.log('📄 非流式响应结果:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ 非流式响应测试失败:', error.message);
  }
}

/**
 * 测试服务器健康状态
 */
async function testHealth() {
  console.log('🏥 测试服务器健康状态');
  
  try {
    const response = await axios.get(`${API_BASE}/health`);
    console.log('✅ 服务器健康状态:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 开始测试改造后的 bridge_cli_server');
  console.log('=' * 50);
  
  // 等待服务器完全启动
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await testHealth();
  console.log('\n');
  
  await testNormalResponse();
  console.log('\n');
  
  await testReasoningStream();
  
  console.log('\n🎉 所有测试完成');
}

// 运行测试
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testReasoningStream,
  testNormalResponse,
  testHealth
};