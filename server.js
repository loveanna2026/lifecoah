// Node.js后端服务器
// 用于处理AI API请求，解决CORS问题，支持流式输出

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// API配置
const API_CONFIG = {
    url: process.env.DEEPSEEK_API_URL || process.env.API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.API_KEY || 'your_default_api_key_here', // 从环境变量获取API密钥
    model: process.env.MODEL || 'deepseek-r1-250528',
    timeout: 60000, // 60秒超时
    temperature: 0.6 // 温度设置
};

// 验证API密钥是否配置
if (API_CONFIG.apiKey === 'your_default_api_key_here') {
    console.warn('⚠️  Warning: API_KEY not set in environment variables. Using default placeholder.');
    console.warn('Please create a .env file with your API_KEY. See .env.example for reference.');
}

// 中间件
// 配置CORS，允许所有来源的请求
app.use(cors({
    origin: '*', // 允许所有来源
    methods: ['GET', 'POST', 'OPTIONS'], // 允许的HTTP方法
    allowedHeaders: ['Content-Type', 'Authorization'], // 允许的请求头
    credentials: true // 允许发送凭证
}));

// 处理预检请求
app.options('*', cors());

app.use(express.json());

// 静态文件服务
app.use(express.static(__dirname));

// 根路径路由，确保返回index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 聊天API端点
app.post('/api/chat', async (req, res) => {
    const { messages } = req.body;
    
    try {
        // 调用火山方舟API
        const apiResponse = await fetch(API_CONFIG.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: API_CONFIG.model,
                messages: messages,
                temperature: API_CONFIG.temperature,
                stream: true // 启用流式输出
            }),
            timeout: API_CONFIG.timeout // 设置超时
        });
        
        // 检查响应状态
        if (!apiResponse.ok) {
            const errorData = await apiResponse.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API请求失败: ${apiResponse.status}`);
        }
        
        // 设置响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // 处理流式响应（兼容node-fetch 2.x）
        const decoder = new TextDecoder();
        let buffer = '';
        
        // 监听data事件
        apiResponse.body.on('data', (chunk) => {
            buffer += decoder.decode(chunk, { stream: true });
            
            // 分割并处理SSE事件
            const events = buffer.split('\n\n');
            buffer = events.pop(); // 保留不完整的事件
            
            for (const event of events) {
                if (!event || event.trim() === '') continue;
                
                const eventLines = event.split('\n');
                
                for (const line of eventLines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (jsonStr === '[DONE]') {
                            // 流式结束
                            res.write('data: [DONE]\n\n');
                            res.end();
                            return;
                        }
                        
                        try {
                            const jsonData = JSON.parse(jsonStr);
                            const content = jsonData.choices[0]?.delta?.content || '';
                            if (content) {
                                // 发送内容片段
                                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                            }
                        } catch (parseError) {
                            console.error('JSON解析错误:', parseError);
                        }
                    }
                }
            }
        });
        
        // 监听end事件
        apiResponse.body.on('end', () => {
            res.end();
        });
        
        // 监听error事件
        apiResponse.body.on('error', (error) => {
            console.error('流式响应错误:', error);
            res.status(500).json({ error: '流式响应处理失败' });
        });
        
    } catch (error) {
        console.error('API调用错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`\n🚀 AI Life Coach服务器已启动！`);
    console.log(`📡 服务器地址: http://localhost:${PORT}`);
    console.log(`💬 聊天API: http://localhost:${PORT}/api/chat`);
    console.log(`\n在浏览器中打开 http://localhost:${PORT} 即可使用AI Life Coach！\n`);
});
