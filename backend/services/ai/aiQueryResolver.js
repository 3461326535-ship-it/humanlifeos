// Layer 5: Query Resolver (v2)
// Converts fuzzy natural language into structured query filters.
//
// CRITICAL CONSTRAINT: This layer MUST NOT generate task lists or task titles.
// It only outputs filter objects that the Executor uses to query the database.

const { getToday, addDays, getWeekRange } = require('./aiDateHelper');
const { callDeepSeek, isConfigured } = require('./aiClient');

function buildResolverPrompt(message) {
  const today = getToday();
  const week = getWeekRange();
  const tomorrow = addDays(today, 1);

  return `你是查询解析器。将用户的自然语言转换为结构化查询条件。

## ⚠️ 核心规则（必须遵守）
1. 你只能输出查询条件（filters），绝对不能生成任务列表或任务标题
2. 你必须解析模糊的时间表达为具体日期值
3. 你必须识别状态词（完成/未完成/过期/待办）

## 日期参考
- 今天: ${today}
- 本周: ${week.start} 至 ${week.end}
- 明天: ${tomorrow}

## 状态映射
- "未完成"/"没完成"/"待办"/"还没做" → status: "incomplete"
- "已完成"/"完成的"/"做完了" → status: "completed"
- "过期"/"逾期"/"超时" → date_before: "${today}", status: "incomplete"
- "今天"/"今日" → date: "${today}"

## 操作类型
- 只是查看/列出/显示 → operation: "batch_query"
- 删除/删掉/清除 → operation: "batch_delete"
- 标记完成/完成/勾掉 → operation: "batch_complete"
- 移动/推迟/改期 → operation: "batch_update_date"
- 询问统计/完成率/有多少/分析/效率/统计 → operation: "summary"

## 输出格式（严格 JSON）
{
  "filters": {
    "date": "YYYY-MM-DD",        // 可选：精确日期
    "date_start": "YYYY-MM-DD",  // 可选：日期范围开始
    "date_end": "YYYY-MM-DD",    // 可选：日期范围结束
    "date_before": "YYYY-MM-DD", // 可选：此日期之前（含）
    "status": "incomplete" | "completed" | "all",  // 可选
    "category": "工作" | "生活" | "其他",   // 可选
    "keyword": "搜索关键词"       // 可选：标题模糊匹配
  },
  "operation": "batch_query" | "batch_delete" | "batch_complete" | "batch_update_date" | "summary",
  "summary_type": "completion_rate" | "count" | "list",  // 仅 operation=summary 时
  "new_date": "YYYY-MM-DD",     // 仅 operation=batch_update_date 时
  "confidence": 0-10            // 必填：你对解析结果的置信度
}

## 示例
用户: "今天所有没完成的任务"
→ {"filters":{"date":"${today}","status":"incomplete"},"operation":"batch_query"}

用户: "删除所有过期的"
→ {"filters":{"date_before":"${today}","status":"incomplete"},"operation":"batch_delete"}

用户: "把所有工作分类的任务标记完成"
→ {"filters":{"category":"工作","status":"incomplete"},"operation":"batch_complete","confidence":8}

用户: "这周完成率怎么样"
→ {"filters":{"date_start":"${week.start}","date_end":"${week.end}"},"operation":"summary","summary_type":"completion_rate"}

用户: "帮我统计各分类任务的完成率"
→ {"filters":{},"operation":"summary","summary_type":"completion_rate"}

用户: "查看所有任务"
→ {"filters":{},"operation":"batch_query"}

只返回 JSON，不要任何额外文字。`;
}

/**
 * Resolve natural language query into structured filters
 * @param {string} message - User's input message
 * @param {string} intent - From Layer 1 (task_batch or query)
 * @returns {Promise<object|null>} - { filters, operation, ... } or null on failure
 */
async function resolveQuery(message, intent) {
  if (!isConfigured()) return null;

  const raw = await callDeepSeek(buildResolverPrompt(message), message, {
    temperature: 0.1, maxTokens: 350, responseFormat: 'json_object', label: 'QueryResolver'
  });

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // Validate required fields
    if (!parsed.operation) {
      console.error('[QueryResolver] Missing "operation" in response');
      return null;
    }

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(10, Math.round(parsed.confidence)))
      : 5;

    return {
      filters: parsed.filters || {},
      operation: parsed.operation,
      summary_type: parsed.summary_type || null,
      new_date: parsed.new_date || null,
      confidence
    };
  } catch (err) {
    console.error('[QueryResolver] Failed:', err.message);
    return null;
  }
}

module.exports = { resolveQuery, buildResolverPrompt };
