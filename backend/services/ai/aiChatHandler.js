// Chat Handler (v2)
// Extracted from the old handleChat function in ai.js.
// Handles pure conversational responses with optional conversation history.

const { getToday } = require('./aiDateHelper');
const { callDeepSeek, isConfigured } = require('./aiClient');

function buildChatPrompt() {
  const today = getToday();
  return `你是人类生活实验日志的 AI 助手，名字叫"小日志"。你友好、温暖、偶尔幽默。

当前日期: ${today}

特点:
- 你管理着一个智能日程应用，用户可以添加、修改、删除任务
- 你也能总结日程、分析完成率、给出效率建议
- 纯闲聊时，保持简短自然的对话
- 如果用户问到你的功能，介绍: "我可以帮你创建/修改/删除任务，总结日程，分析完成率，给你效率建议～"
- 拒绝回答与日程管理无关的长篇大论

⚠️ 上下文理解:
- 如果用户说"那个"/"它"/"这个任务"/"刚才的"，结合最近对话推断他们指的是什么
- 如果用户说"明天也加上"/"类似的再建一个"，说明他们在延续之前的操作
- 利用对话历史理解省略语、代词引用和连续操作意图

用中文回复，1-3 句话为宜。`;
}

/**
 * Generate a chat reply
 * @param {string} message - User's current message
 * @param {Array<{role:string, message:string}>} [history] - Recent conversation history
 * @returns {Promise<{reply: string, action: null, data: null}>}
 */
async function handleChat(message, history) {
  if (!isConfigured()) {
    return { reply: '你好呀！有什么可以帮你的吗？😊', action: null, data: null };
  }

  let contextBlock = '';
  if (history && history.length > 0) {
    const recent = history.slice(-12);
    contextBlock = '最近对话：\n' + recent.map(h =>
      `${(h && h.role === 'user') ? '用户' : '小日志'}: ${h && h.message ? h.message : '...'}`
    ).join('\n') + '\n\n';
  }

  const prompt = contextBlock + '用户最新消息: ' + message;
  const reply = await callDeepSeek(buildChatPrompt(), prompt, {
    temperature: 0.7, maxTokens: 300, label: 'Chat'
  });

  if (!reply) {
    return { reply: '你好呀！有什么可以帮你的吗？😊', action: null, data: null };
  }

  return { reply, action: null, data: null };
}

module.exports = { handleChat, buildChatPrompt };
