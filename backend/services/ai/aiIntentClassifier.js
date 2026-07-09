// Layer 1: Intent Classifier (v2.1)
// Classifies user input into 5 intent types with confidence scores.
// Returns { intent, confidence } where confidence is 0-10.

const { callDeepSeek, isConfigured } = require('./aiClient');

const INTENT_PROMPT = `你是一个意图分类器。分析用户消息，判断意图类型并给出置信度评分。

类型定义:
- "chat": 纯闲聊、打招呼、问候、感谢、询问你是谁、聊天气聊心情等，无任何任务/日程操作意图
- "task_single": 用户想对【一个】具体任务进行操作（创建、修改、删除）。关键特征：用户提到了一个具体的任务（如"明天下午开会"、"把买菜改成后天"）
- "task_batch": 用户想对【多个】任务进行【批量操作】（如"把所有未完成的删掉"、"完成今天所有任务"、"所有过期的标记完成"）。关键特征：包含"所有/全部/批量/今天的所有/本周的"等批量语义
- "project": 用户描述了一个多步骤的目标或项目（如"做一个官网"、"搭建后台系统"、"帮我规划婚礼"）。关键特征：目标是复合的，需要拆解成多个任务
- "query": 用户想【查询/了解】任务情况，不做修改操作（如"今天有多少任务没完成"、"这周完成率怎么样"、"哪些任务过期了"、"查看所有未完成的任务"）。关键特征：疑问句或查看/了解语义，不涉及创建/修改/删除

⚠️ 关键辨别规则:
1. "查看所有未完成的任务" → query（只是在问/查看，没有说要修改）
2. "把所有未完成的任务删掉" → task_batch（批量删除）
3. "完成今天所有任务" → task_batch（批量完成操作）
4. "明天下午3点开会" → task_single（单个具体任务）
5. "明天所有会议" → task_batch（"所有" = 批量语义）
6. "今天好累，帮我看看这周完成情况" → query（查询类）
7. "今天几号"/"现在几点"/"今天是星期几" → chat（纯日期时间询问，不是任务查询）
8. "你好"/"谢谢"/"你是谁" → chat（纯社交对话）

⚠️ 置信度评分标准（0-10）:
- 8-10: 用户意图非常明确，关键词和上下文清晰
- 5-7: 有一些模糊，但大概率是某个意图
- 0-4: 非常模糊，难以判断（此时应倾向 chat）

返回严格 JSON（不要额外文字）:
{"intent": "chat|task_single|task_batch|project|query", "confidence": 0-10}`;

/**
 * Classify user intent into one of 5 types with confidence score.
 * On failure, defaults to 'chat' with confidence 0 (safe: cannot trigger mutations).
 * @returns {{ intent: string, confidence: number }}
 */
async function classifyIntent(message) {
  if (!isConfigured()) return { intent: 'chat', confidence: 0 };

  const raw = await callDeepSeek(INTENT_PROMPT, message, {
    temperature: 0, maxTokens: 60, label: 'Intent'
  });

  if (!raw) return { intent: 'chat', confidence: 0 }; // safe default: no execution possible

  try {
    const parsed = JSON.parse(raw.trim());
    const validIntents = ['chat', 'task_single', 'task_batch', 'project', 'query'];

    if (parsed.intent && validIntents.includes(parsed.intent)) {
      let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 5;
      confidence = Math.max(0, Math.min(10, Math.round(confidence)));
      return { intent: parsed.intent, confidence };
    }
  } catch {
    // JSON parse failed, fall through to keyword matching
  }

  // Robust fallback matching (for non-JSON responses)
  const content = raw.toLowerCase().trim();
  let intent = 'chat';
  let confidence = 3; // low confidence for keyword-based fallback

  if (content.includes('batch') || content.includes('task_batch')) {
    intent = 'task_batch';
    confidence = 5;
  } else if (content.includes('project')) {
    intent = 'project';
    confidence = 5;
  } else if (content.includes('query')) {
    intent = 'query';
    confidence = 5;
  } else if (content.includes('single') || content.includes('task_single') || content.includes('task')) {
    intent = 'task_single';
    confidence = 4;
  }

  return { intent, confidence };
}

module.exports = { classifyIntent, INTENT_PROMPT };
