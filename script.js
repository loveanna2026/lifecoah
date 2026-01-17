// AI Life Coach JavaScript文件
// 实现与火山方舟DeepSeek R1 API的对话功能

// API配置信息
const API_CONFIG = {
    systemPrompt: '你是一名专业的AI Life Coach，擅长倾听用户的想法和困惑，给予温暖、专业、有建设性的建议。你要以朋友的身份与用户交流，帮助用户成长和解决问题。'
};

// 调试配置
const DEBUG = true;

// 页面元素
let chatHistory, userInput, sendBtn, historyList, newChatBtn, batchDeleteBtn;

// 聊天数据管理
let currentChatId = 1;
let chats = {
    1: {
        id: 1,
        title: '新对话',
        messages: [
            { role: 'system', content: API_CONFIG.systemPrompt }
        ],
        date: new Date().toLocaleDateString()
    }
};

// 初始化页面
function init() {
    // 获取页面元素
    chatHistory = document.getElementById('chatHistory');
    userInput = document.getElementById('userInput');
    sendBtn = document.getElementById('sendBtn');
    historyList = document.getElementById('historyList');
    newChatBtn = document.getElementById('newChatBtn');
    batchDeleteBtn = document.getElementById('batchDeleteBtn');
    
    // 添加事件监听器
    sendBtn.addEventListener('click', sendMessage);
    newChatBtn.addEventListener('click', startNewChat);
    batchDeleteBtn.addEventListener('click', batchDeleteChats);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 加载历史对话
    loadChats();
    
    console.log('AI Life Coach 初始化完成！');
}

// 发送消息
async function sendMessage() {
    const userText = userInput.value.trim();
    if (!userText) return;
    
    // 清空输入框
    userInput.value = '';
    
    // 获取当前聊天
    const currentChat = chats[currentChatId];
    if (!currentChat) {
        console.error('Current chat not found:', currentChatId);
        return;
    }
    
    // 添加用户消息到聊天记录
    addMessageToHistory('user', userText);
    
    // 添加用户消息到当前聊天的消息数组
    currentChat.messages.push({ role: 'user', content: userText });
    
    // 更新对话标题（如果是第一条用户消息）
    if (currentChat.messages.length === 2) {
        currentChat.title = userText.substring(0, 20) + (userText.length > 20 ? '...' : '');
        updateHistoryList();
    }
    
    // 显示AI正在输入的消息框
    const aiMessageElement = createAIMessageElement();
    const aiMessageContent = aiMessageElement.querySelector('.message-content');
    
    // 声明加载元素变量
    let loadingPara;
    
    try {
        // 添加加载状态
        loadingPara = document.createElement('p');
        loadingPara.className = 'loading';
        loadingPara.textContent = '正在思考中...';
        aiMessageContent.appendChild(loadingPara);
        
        // 调用API获取响应
        await callAPIWithStreaming(aiMessageContent, currentChat.messages);
        
        // 移除加载状态
        if (loadingPara && loadingPara.parentNode) {
            loadingPara.parentNode.removeChild(loadingPara);
        }
        
        // 获取完整的AI响应文本（排除AI Life Coach标题）
        const botHeader = aiMessageContent.querySelector('h3');
        
        // 临时移除标题以获取纯文本
        botHeader?.remove();
        
        // 获取并清理响应文本
        let fullResponse = aiMessageContent.innerText.trim();
        
        // 恢复标题
        aiMessageContent.insertBefore(botHeader, aiMessageContent.firstChild);
        
        if (fullResponse) {
            // 将Markdown转换为HTML并更新消息内容
            try {
                const htmlContent = marked.parse(fullResponse);
                aiMessageContent.innerHTML = '';
                aiMessageContent.appendChild(botHeader);
                aiMessageContent.innerHTML += htmlContent;
            } catch (mdError) {
                console.error('Markdown渲染错误:', mdError);
                // 降级处理：保留原始文本格式
            }
            
            // 添加AI消息到当前聊天的消息数组
            currentChat.messages.push({ role: 'assistant', content: fullResponse });
            
            // 更新对话日期
            currentChat.date = new Date().toLocaleDateString();
            
            // 保存聊天记录
            saveChats();
            updateHistoryList();
        } else {
            throw new Error('AI没有返回有效的响应内容');
        }
        
    } catch (error) {
        // 移除加载状态（如果存在）
        if (loadingPara && loadingPara.parentNode) {
            loadingPara.parentNode.removeChild(loadingPara);
        }
        
        // 显示错误消息
        aiMessageContent.innerHTML = '<h3>AI Life Coach</h3><p>抱歉，出现了一些错误：' + error.message + '。请稍后再试。</p>';
        console.error('API调用错误:', error);
    }
}

// 创建AI消息元素
function createAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const botHeader = document.createElement('h3');
    botHeader.textContent = 'AI Life Coach';
    messageContent.appendChild(botHeader);
    
    // 创建一个空的段落用于显示流式内容
    const contentPara = document.createElement('p');
    messageContent.appendChild(contentPara);
    
    messageDiv.appendChild(messageContent);
    chatHistory.appendChild(messageDiv);
    
    // 滚动到底部
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    return messageDiv;
}

// 调用API (使用本地后端，支持流式输出)
async function callAPIWithStreaming(messageContentElement, currentMessages) {
    try {
        // 确保API请求URL正确
        const apiUrl = '/api/chat';
        console.log('Calling API:', apiUrl, { messages: currentMessages.length });
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: currentMessages
            }),
            credentials: 'same-origin' // 确保使用同源凭证
        });
        
        console.log('API Response Status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API Error Details:', errorData);
            throw new Error(errorData.error || `API请求失败: ${response.status}`);
        }
        
        // 检查是否支持流
        if (!response.body || !response.body.getReader) {
            console.error('浏览器不支持流式响应，将使用完整响应模式');
            
            // 降级处理：尝试获取完整响应
            const fullResponse = await response.json();
            console.log('降级处理：获取完整响应:', fullResponse);
            
            // 获取AI响应内容
            const aiContent = fullResponse.choices[0]?.message?.content || '没有获取到响应内容';
            
            // 将Markdown转换为HTML
            try {
                const htmlContent = marked.parse(aiContent);
                messageContentElement.innerHTML += htmlContent;
            } catch (mdError) {
                console.error('Markdown渲染错误:', mdError);
                // 降级处理：使用普通文本显示
                const contentPara = messageContentElement.querySelector('p') || document.createElement('p');
                if (!contentPara.parentNode) {
                    messageContentElement.appendChild(contentPara);
                }
                contentPara.textContent = aiContent;
            }
            
            return;
        }
        
        // 获取可读流
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let contentPara = messageContentElement.querySelector('p');
        
        console.log('Starting to process stream...');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('Stream completed');
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            
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
                            // 流式结束，直接返回函数
                            console.log('Stream done signal received');
                            return;
                        }
                        
                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.content) {
                                // 更新消息内容
                                if (!contentPara) {
                                    contentPara = document.createElement('p');
                                    messageContentElement.appendChild(contentPara);
                                }
                                contentPara.textContent += data.content;
                                
                                // 滚动到底部
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            }
                        } catch (parseError) {
                            console.error('JSON解析错误:', parseError, '原始数据:', jsonStr);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('API调用错误:', error);
        // 如果是网络错误，提供更具体的错误信息
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            throw new Error('网络连接失败，请检查服务器是否正常运行');
        }
        throw error;
    }
}

// 添加消息到聊天记录
function addMessageToHistory(role, content) {
    // 验证输入
    if (!role || !content || typeof content !== 'string') {
        console.error('Invalid message data:', { role, content });
        return;
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    if (role === 'bot') {
        const botHeader = document.createElement('h3');
        botHeader.textContent = 'AI Life Coach';
        messageContent.appendChild(botHeader);
    }
    
    try {
        // 使用marked库将Markdown转换为HTML
        const htmlContent = marked.parse(content);
        
        // 创建一个临时容器来渲染HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        // 将渲染后的内容添加到消息中
        while (tempDiv.firstChild) {
            messageContent.appendChild(tempDiv.firstChild);
        }
    } catch (error) {
        console.error('Markdown渲染错误:', error);
        // 降级处理：使用普通文本显示
        const paragraphs = content.split('\n');
        paragraphs.forEach(paragraph => {
            if (paragraph.trim()) {
                const p = document.createElement('p');
                p.textContent = paragraph.trim();
                messageContent.appendChild(p);
            }
        });
    }
    
    messageDiv.appendChild(messageContent);
    chatHistory.appendChild(messageDiv);
    
    // 平滑滚动到底部
    chatHistory.scrollTo({
        top: chatHistory.scrollHeight,
        behavior: 'smooth'
    });
}

// 清空当前聊天记录
function clearChat() {
    if (confirm('确定要清空当前聊天记录吗？')) {
        // 重置当前聊天的消息数组
        const currentChat = chats[currentChatId];
        currentChat.messages = [
            { role: 'system', content: API_CONFIG.systemPrompt }
        ];
        currentChat.title = '新对话';
        
        // 清空聊天历史
        chatHistory.innerHTML = '';
        
        // 添加欢迎消息
        const welcomeMessage = `你好！我是你的AI Life Coach\n很高兴见到你！我可以成为你的成长伙伴，帮助你解决生活中的问题，给你提供建议和支持。\n你可以和我聊聊你的想法、困惑或者目标，我会认真倾听并给出有帮助的回应。`;
        addMessageToHistory('bot', welcomeMessage);
        
        // 保存并更新
        saveChats();
        updateHistoryList();
        
        console.log('当前聊天记录已清空');
    }
}

// 开始新对话
function startNewChat() {
    // 创建新的聊天ID
    const newChatId = Date.now();
    
    // 创建新聊天
    chats[newChatId] = {
        id: newChatId,
        title: '新对话',
        messages: [
            { role: 'system', content: API_CONFIG.systemPrompt }
        ],
        date: new Date().toLocaleDateString()
    };
    
    // 切换到新聊天
    switchToChat(newChatId);
    
    // 保存并更新
    saveChats();
    updateHistoryList();
}

// 切换到指定聊天
function switchToChat(chatId) {
    // 更新当前聊天ID
    currentChatId = chatId;
    
    // 清空聊天历史
    chatHistory.innerHTML = '';
    
    // 获取聊天数据
    const chat = chats[chatId];
    
    // 显示除了system消息以外的所有消息
    for (let i = 1; i < chat.messages.length; i++) {
        const message = chat.messages[i];
        addMessageToHistory(message.role === 'user' ? 'user' : 'bot', message.content);
    }
    
    // 如果没有消息，显示欢迎消息
    if (chat.messages.length === 1) {
        const welcomeMessage = `你好！我是你的AI Life Coach\n很高兴见到你！我可以成为你的成长伙伴，帮助你解决生活中的问题，给你提供建议和支持。\n你可以和我聊聊你的想法、困惑或者目标，我会认真倾听并给出有帮助的回应。`;
        addMessageToHistory('bot', welcomeMessage);
    }
    
    // 更新历史列表的活跃状态
    updateHistoryList();
}

// 更新历史对话列表
function updateHistoryList() {
    // 清空历史列表
    historyList.innerHTML = '';
    
    // 转换为数组并按时间倒序排序
    const chatArray = Object.values(chats).sort((a, b) => b.id - a.id);
    
    // 添加每个对话项
    chatArray.forEach(chat => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
        historyItem.setAttribute('data-chat-id', chat.id);
        
        // 创建复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'history-checkbox';
        checkbox.title = '选择对话';
        // 阻止点击复选框时触发切换对话
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // 创建预览内容
        const preview = document.createElement('div');
        preview.className = 'history-preview';
        
        // 标题
        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = chat.title;
        preview.appendChild(title);
        
        // 摘要
        const snippet = document.createElement('div');
        snippet.className = 'history-snippet';
        
        // 获取第一条用户消息或AI回复作为摘要
        const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
        const firstAssistantMessage = chat.messages.find(msg => msg.role === 'assistant');
        
        if (firstUserMessage) {
            snippet.textContent = firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
        } else if (firstAssistantMessage) {
            snippet.textContent = firstAssistantMessage.content.substring(0, 50) + (firstAssistantMessage.content.length > 50 ? '...' : '');
        } else {
            snippet.textContent = '新对话';
        }
        
        preview.appendChild(snippet);
        
        // 日期
        const date = document.createElement('div');
        date.className = 'history-date';
        date.textContent = chat.date;
        
        // 创建删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = '删除对话';
        deleteBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M19 6v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6m3 0V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        // 添加删除事件监听器
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });
        
        // 组装元素
        historyItem.appendChild(checkbox);
        historyItem.appendChild(preview);
        historyItem.appendChild(date);
        historyItem.appendChild(deleteBtn);
        
        // 添加点击事件
        historyItem.addEventListener('click', () => {
            switchToChat(chat.id);
        });
        
        // 添加到列表
        historyList.appendChild(historyItem);
    });
}

// 保存聊天记录到localStorage
function saveChats() {
    try {
        localStorage.setItem('aiLifeCoachChats', JSON.stringify(chats));
    } catch (error) {
        console.error('保存聊天记录失败:', error);
    }
}

// 从localStorage加载聊天记录
function loadChats() {
    try {
        const savedChats = localStorage.getItem('aiLifeCoachChats');
        if (savedChats) {
            chats = JSON.parse(savedChats);
            // 确保至少有一个对话
            if (Object.keys(chats).length === 0) {
                createDefaultChat();
            }
            // 切换到最后一个对话
            const chatIds = Object.keys(chats).map(Number);
            currentChatId = Math.max(...chatIds);
        } else {
            createDefaultChat();
        }
        
        // 更新历史列表
        updateHistoryList();
        
        // 切换到当前聊天
        switchToChat(currentChatId);
        
    } catch (error) {
        console.error('加载聊天记录失败:', error);
        createDefaultChat();
    }
}

// 删除单条对话
function deleteChat(chatId) {
    if (confirm('确定要删除这条对话吗？')) {
        // 删除对话
        delete chats[chatId];
        
        // 如果删除的是当前对话，需要切换到其他对话
        if (currentChatId === chatId) {
            const remainingChats = Object.keys(chats);
            if (remainingChats.length > 0) {
                // 切换到最后一个对话
                switchToChat(parseInt(remainingChats[remainingChats.length - 1]));
            } else {
                // 没有对话了，创建新对话
                startNewChat();
            }
        }
        
        // 保存并更新
        saveChats();
        updateHistoryList();
    }
}

// 批量删除对话
function batchDeleteChats() {
    // 获取所有选中的复选框
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    
    if (checkboxes.length === 0) {
        alert('请先选择要删除的对话');
        return;
    }
    
    if (confirm(`确定要删除选中的 ${checkboxes.length} 条对话吗？`)) {
        // 获取选中的聊天ID
        const selectedChatIds = Array.from(checkboxes).map(checkbox => {
            const historyItem = checkbox.closest('.history-item');
            return parseInt(historyItem.getAttribute('data-chat-id'));
        });
        
        // 删除选中的对话
        selectedChatIds.forEach(chatId => {
            delete chats[chatId];
        });
        
        // 如果当前对话被删除，需要切换到其他对话
        if (selectedChatIds.includes(currentChatId)) {
            const remainingChats = Object.keys(chats);
            if (remainingChats.length > 0) {
                // 切换到最后一个对话
                switchToChat(parseInt(remainingChats[remainingChats.length - 1]));
            } else {
                // 没有对话了，创建新对话
                startNewChat();
            }
        }
        
        // 保存并更新
        saveChats();
        updateHistoryList();
    }
}

// 创建默认聊天
function createDefaultChat() {
    chats = {
        1: {
            id: 1,
            title: '新对话',
            messages: [
                { role: 'system', content: API_CONFIG.systemPrompt }
            ],
            date: new Date().toLocaleDateString()
        }
    };
    currentChatId = 1;
    saveChats();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 导出供调试使用
if (typeof window !== 'undefined') {
    window.AILifeCoach = {
        sendMessage,
        clearChat,
        startNewChat,
        chats,
        currentChatId,
        API_CONFIG
    };
}