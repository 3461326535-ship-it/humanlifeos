// ============================================================
// AI Pipeline v2 — Orchestrator
// ============================================================
// Routes user input through the 6-layer pipeline:
//   Intent → Mode → [Project] → [Task Decomp] → Query Resolver → Executor
//
// MVP (v2.0.1) implements layers 1, 2, 5, 6.
// Layers 3, 4 (Project Planner, Task Decomposer) are v2.0.2.
// ============================================================

const express = require('express');
const router = express.Router();
const EventModel = require('../models/eventModel');
const db = require('../models/db');
const { validate, RULES } = require('../../middleware/validate');
const { sanitizeError } = require('../../middleware/sanitizeError');

// Layer modules
const { classifyIntent } = require('../services/ai/aiIntentClassifier');
const { controlMode } = require('../services/ai/aiModeController');
const { resolveQuery } = require('../services/ai/aiQueryResolver');
const { executeResolved, executeTaskAction } = require('../services/ai/aiExecutor');
const { handleChat } = require('../services/ai/aiChatHandler');
const { planProject } = require('../services/ai/aiProjectPlanner');
const { decomposeTasks } = require('../services/ai/aiTaskDecomposer');
const { scheduleProject } = require('../services/ai/aiScheduler');
const { getToday, addDays } = require('../services/ai/aiDateHelper');

// ===== Config =====
const { callDeepSeek, isConfigured } = require('../services/ai/aiClient');

// 从 req 提取 userId
function uid(req) { return req.user ? req.user.userId : null; }

// ===== Pending actions store (SQLite 持久化，防止重启/跨进程丢失) =====
function generateConfirmId() {
  return 'req_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

function savePendingAction(confirmId, type, data, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO pending_actions (confirm_id, type, data_json, user_id) VALUES (?, ?, ?, ?)',
      [confirmId, type, JSON.stringify(data), userId || null],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

function getPendingAction(confirmId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM pending_actions WHERE confirm_id = ?',
      [confirmId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        try {
          resolve({ type: row.type, data: JSON.parse(row.data_json) });
        } catch (e) {
          resolve(null);
        }
      }
    );
  });
}

function deletePendingAction(confirmId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM pending_actions WHERE confirm_id = ?', [confirmId], (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// ===== Clarify helper: generate intent options for ambiguous input =====
function generateClarifyOptions(message, intent, confidence) {
  // Build clarifying questions based on intent type and message context
  const options = [];

  if (intent === 'task_single') {
    options.push(
      { label: '📝 创建任务', value: `创建任务：${message}` },
      { label: '🔍 查询任务', value: `查询：${message}` },
      { label: '💬 只是聊天', value: message }
    );
  } else if (intent === 'task_batch') {
    options.push(
      { label: '📋 批量操作', value: message },
      { label: '🔍 只是查询', value: `查看：${message}` }
    );
  } else if (intent === 'query') {
    options.push(
      { label: '📊 查看统计', value: `统计：${message}` },
      { label: '📋 列出任务', value: `列出：${message}` }
    );
  } else {
    // Generic
    options.push(
      { label: '📝 创建任务', value: `创建任务：${message}` },
      { label: '🔍 查询任务', value: `查询：${message}` },
      { label: '💬 聊天', value: message }
    );
  }

  return options;
}

// Cleanup of expired pending_actions is handled in db.js (runs every 5 min, deletes rows older than 30 min)

// ===== Single-task handler (task_single intent) =====
function buildTaskPrompt() {
  const today = getToday();
  return `你是智能日程秘书，帮用户处理单个任务操作。

你需要从用户消息中提取以下信息，返回严格 JSON（不要额外文字）:

{
  "action": "create_task" | "update_task" | "delete_task" | "add_subtask" | "summary" | "suggestion" | "analysis",
  "data": {
    // create_task: { "title", "date"(YYYY-MM-DD), "time"(HH:MM), "category", "description", "subtasks":[{"title":"子任务标题","completed":false}], "recurrence"(可选:"daily"|"weekly"|"monthly"|"yearly") }
    //   ⚠️ subtasks 必须是对象数组，每个对象包含 title(string) 和 completed(boolean)，不能是字符串数组！
    //   ⚠️ 子任务提取规则（重要！）:
    //     当用户用"并且"/"还要"/"同时"/"然后"/"顺便"/"记得"连接多个动作时，第一个动作是主任务 title，
    //     后续每个动作作为独立子任务放入 subtasks 数组。不要把子任务塞进 title 或 description！
    //     例如 "晚上9点打扫房间卫生并且洗床单" →
    //       title:"打扫房间卫生", time:"21:00", subtasks:[{title:"洗床单",completed:false}]
    //     例如 "明天上午去超市买牛奶和面包还要寄快递" →
    //       title:"去超市购物", time:"09:00", subtasks:[{title:"买牛奶",completed:false},{title:"买面包",completed:false},{title:"寄快递",completed:false}]
    //     例如 "下午3点写周报然后回复邮件" →
    //       title:"写周报", time:"15:00", subtasks:[{title:"回复邮件",completed:false}]
    //   重要: 如果用户说"每天"/"每周"/"每月"/"每年"/"每天早上"/"每周三"等周期表述，必须设置 recurrence！
    //   例如 "每天早上9点吃药" → title:"吃药", time:"09:00", recurrence:"daily"
    //   例如 "每周五下午开会" → title:"周五下午开会"(或"周会"), time:"14:00"(或具体时间), recurrence:"weekly"
    // update_task: { "title"(要修改的任务关键词), "newTitle", "newDate", "newTime", "newCategory", "completed"(true/false), "newRecurrence" }
    // delete_task: { "title"(要删除的任务关键词), "onlyCompleted"(true/false) }
    // add_subtask: { "parentTitle"(父任务关键词), "subtaskTitle" }
    // summary: { "period": "today"|"week"|"month" }
    // suggestion: {}
    // analysis: {}
  },
  "reply": "你给用户的自然语言回复，友好简洁。⚠️ 创建/修改/删除等操作类回复不要用「已创建」「已修改」「已删除」，要用「确认创建」「确认修改」「确认删除」等需要用户确认的表述，因为操作需要用户点击确认才会真正执行。",
  "needsConfirm": true,
  "confidence": 0-10
}

⚠️ 置信度评分标准（0-10）:
- 8-10: 用户意图非常明确，所有必要信息都提取到了（标题、日期、时间都清晰）
- 5-7: 意图基本明确，但有部分信息不完整或模糊
- 0-4: 非常模糊，信息严重不足，无法可靠执行

规则:
- 日期: 今天=${today}，明天是明天，后天是后天。不明确的日期默认为今天。所有日期均为北京时间（UTC+8），不是UTC
- 时间: 提取 HH:MM 格式。中文时间直接识别: "早上9点"→09:00，"下午3点"→15:00，"晚上8点"→20:00，默认为 "09:00"
- 分类: 工作/生活/其他，默认 "其他"
- ⚠️ 子任务提取（重要！）:
  * 用户消息中如果包含"并且"/"还要"/"同时"/"然后"/"顺便"/"以及"/"记得"等连接词，说明有多个子动作
  * 第一个/最主要的动作作为主任务 title，后续每个动作作为独立的子任务
  * 每个子任务格式: {title:"具体子动作", completed:false}
  * 不要在 title 里堆砌所有动作，不要用"和/与/及"连接多个动作当一个标题
  * 如果用户列了一串同类事项（如买菜清单），每项都拆成子任务
  * 如果用户没有额外说明/备注/地点等补充信息，description 留空字符串 ""，不要把子任务内容塞进 description
- ⚠️ 周期识别（必须设置 recurrence 字段）:
  * 只在用户明确提到周期词时才设置 recurrence！没有周期词就设为 null 或不传
  * "每天"/"每日"/"天天"/"每天早上"/"每天晚上" → recurrence: "daily"
  * "每周"/"每周一/二/三/四/五/六/日"/"每个星期" → recurrence: "weekly"
  * "每月"/"每个月"/"每月1号" → recurrence: "monthly"
  * "每年"/"每年一次" → recurrence: "yearly"
  * 关键: 带周期表述的任务，title 去掉周期词，用 recurrence 字段表示！
    例如 "每天早上9点吃药" → title:"吃药", time:"09:00", recurrence:"daily"
    例如 "每周五下午3点周会" → title:"周会", time:"15:00", recurrence:"weekly"
    例如 "提醒我每天晚上跑步" → title:"跑步", time:"20:00", recurrence:"daily"
  * 如果没有周期词（如"晚上9点"、"下午3点"、"明天上午"），recurrence 必须为 null
- update_task 的 title 用任务关键词匹配（而非完整标题）
- create/update/delete/add_subtask 的 needsConfirm 为 true；summary/suggestion/analysis 为 false
- 如果信息不足，reply 中可以追问，confidence 应降低
- ⚠️ 只能提取【一个】任务的操作，不要提取批量操作
- 用户说"分析"/"效率"/"统计"/"完成率"时，action 应为 "analysis"，confidence 至少 8
- 用户说"建议"/"推荐"/"优化"时，action 应为 "suggestion"，confidence 至少 8
- 用户说"总结"/"汇总"/"今天做了什么"时，action 应为 "summary" 并提取 period，confidence 至少 8`;
}

async function handleSingleTask(message) {
  const raw = await callDeepSeek(buildTaskPrompt(), message, {
    temperature: 0.2, maxTokens: 500, responseFormat: 'json_object', label: 'SingleTask'
  });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.action || !parsed.data) return null;

    // Extract confidence (default 5 if missing)
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(10, Math.round(parsed.confidence)))
      : 5;
    parsed.confidence = confidence;

    // Generate confirmId for mutations
    if (parsed.needsConfirm &&
        parsed.action !== 'summary' &&
        parsed.action !== 'suggestion' &&
        parsed.action !== 'analysis') {
      parsed.confirmId = generateConfirmId();
      await savePendingAction(parsed.confirmId, parsed.action, parsed.data, null);
    }

    return parsed;
  } catch {
    return null;
  }
}

// ============================================================
// POST /api/ai/chat — Main pipeline entry point
// ============================================================
router.post('/chat', validate({
  message: { rule: RULES.string, message: 'message 必须是字符串' },
  history: { rule: RULES.array, message: 'history 必须是数组', optional: true }
}), async (req, res) => {
  const { message, history } = req.body;

  // Reject empty / whitespace-only messages
  if (!message || !message.trim()) {
    return res.json({
      reply: '你好呀！有什么可以帮你的吗？😊',
      action: null, data: null
    });
  }

  // DEBUG: 记录请求的认证状态
  console.log('[AI Chat] userId:', uid(req), '| hasAuth:', !!req.user, '| msg:', message.substring(0, 40));

  // API Key not configured
  if (!isConfigured()) {
    return res.json({
      reply: '🤖 AI 助手尚未配置（缺少 DeepSeek API Key），请联系管理员。',
      action: null, data: null
    });
  }

  // ========== Layer 1: Intent Classification ==========
  console.log('[Layer1] Classifying intent:', message.substring(0, 50));
  const { intent, confidence: intentConfidence } = await classifyIntent(message);
  console.log('[Layer1] Intent:', intent, '| Confidence:', intentConfidence);

  // ========== Layer 2: Mode Control ==========
  const { mode, allow_execution } = controlMode(intent);
  console.log('[Layer2] Mode:', mode, '| allow_execution:', allow_execution);

  // ========== Layer 3-6: Route by intent ==========
  switch (intent) {
    // ---- Chat: pure conversation, no execution ----
    case 'chat': {
      console.log('[Route] → ChatHandler (no execution allowed)');
      const result = await handleChat(message, history);
      return res.json({
        reply: result.reply,
        action: null,
        data: null
      });
    }

    // ---- Single task: existing flow with confirm ----
    case 'task_single': {
      if (!allow_execution) {
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }
      console.log('[Route] → SingleTaskHandler');
      const result = await handleSingleTask(message);

      if (!result) {
        // Parse failed, fallback to chat
        console.log('[Route] SingleTask failed, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json({
          reply: chatResult.reply,
          action: null,
          data: null
        });
      }

      // ---- Confidence Gating ----
      const confidence = result.confidence ?? 5;
      console.log('[Route] SingleTask confidence:', confidence);

      // Low confidence (< 4): fallback to safe chat
      if (confidence < 4) {
        console.log('[Route] Low confidence, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json({
          reply: chatResult.reply,
          action: null,
          data: null
        });
      }

      // Medium confidence (4-6): clarify with user
      if (confidence < 7) {
        console.log('[Route] Medium confidence, asking for clarification');
        const options = generateClarifyOptions(message, 'task_single', confidence);
        return res.json({
          reply: `🤔 我不太确定你的意图，能再明确一下吗？\n\n${result.reply}`,
          action: null,
          data: null,
          needsClarify: true,
          clarifyOptions: options
        });
      }

      // High confidence (≥7): proceed normally

      // Non-mutation actions (summary/suggestion/analysis): execute immediately
      if (result.action === 'summary' || result.action === 'suggestion' || result.action === 'analysis') {
        executeTaskAction(uid(req), result, (execResult) => {
          res.json(execResult);
        });
        return;
      }

      // Mutations (create/update/delete/add_subtask): return with confirm
      const typeMap = { create_task: 'create', update_task: 'update', delete_task: 'delete', add_subtask: 'addSubtask' };
      return res.json({
        reply: result.reply,
        action: result.action,
        data: result.data,
        confirmId: result.confirmId,
        needsConfirm: true,
        actionPreview: { type: typeMap[result.action], data: result.data }
      });
    }

    // ---- Batch task: go through Query Resolver → Executor ----
    case 'task_batch': {
      console.log('[Route] → QueryResolver → Executor (batch)');

      if (!allow_execution) {
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }

      const resolved = await resolveQuery(message, intent);

      if (!resolved) {
        // Resolver failed, fallback to chat
        console.log('[Route] QueryResolver failed, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }

      // ---- Confidence Gating ----
      const confidence = resolved.confidence ?? 5;
      console.log('[Route] Batch confidence:', confidence);

      if (confidence < 4) {
        console.log('[Route] Low confidence, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }

      if (confidence < 7) {
        console.log('[Route] Medium confidence, asking for clarification');
        const options = generateClarifyOptions(message, 'task_batch', confidence);
        return res.json({
          reply: '🤔 请确认一下你想怎么操作？',
          action: null,
          data: null,
          needsClarify: true,
          clarifyOptions: options
        });
      }

      // Execute the resolved operation (may return confirm or direct reply)
      executeResolved(uid(req), resolved, (execResult) => {
        if (execResult.needsConfirm && execResult.actionPreview) {
          const confirmId = generateConfirmId();
          savePendingAction(confirmId, execResult.actionPreview.type, {
            eventIds: execResult.actionPreview.eventIds,
            newDate: execResult.actionPreview.newDate || null
          }, uid(req));

          return res.json({
            reply: execResult.reply,
            action: execResult.actionPreview.type,
            data: execResult.actionPreview,
            confirmId,
            needsConfirm: true,
            actionPreview: execResult.actionPreview
          });
        }

        res.json({
          reply: execResult.reply,
          action: null,
          data: null
        });
      });
      break;
    }

    // ---- Query: go through Query Resolver → Executor (read-only) ----
    case 'query': {
      console.log('[Route] → QueryResolver → Executor (query)');

      const resolved = await resolveQuery(message, intent);

      if (!resolved) {
        console.log('[Route] QueryResolver failed, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }

      const confidence = resolved.confidence ?? 5;
      console.log('[Route] Query confidence:', confidence);

      if (confidence < 4) {
        console.log('[Route] Low confidence, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }

      if (confidence < 7) {
        console.log('[Route] Medium confidence, asking for clarification');
        const options = generateClarifyOptions(message, 'query', confidence);
        return res.json({
          reply: '🤔 你想查询什么？请再具体描述一下～',
          action: null,
          data: null,
          needsClarify: true,
          clarifyOptions: options
        });
      }

      executeResolved(uid(req), resolved, (execResult) => {
        res.json({
          reply: execResult.reply,
          action: null,
          data: null
        });
      });
      break;
    }

    // ---- Project: Project Planner → Task Decomposer → confirm ----
    case 'project': {
      if (!allow_execution) {
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }
      console.log('[Route] → ProjectPlanner → TaskDecomposer');

      // Layer 3: Plan project (goal → phases)
      const plan = await planProject(message);
      if (!plan) {
        console.log('[Route] ProjectPlanner failed, fallback to chat');
        const chatResult = await handleChat(message, history);
        return res.json(chatResult);
      }
      console.log(`[Route] Project: "${plan.title}" — ${plan.phases.length} phases`);

      // Layer 4: Decompose tasks (phases → tasks)
      const decomposed = await decomposeTasks(plan);
      if (!decomposed) {
        // Phases generated but task decomposition failed
        // Return phases only, let user manually add tasks
        const phaseList = plan.phases.map(p => `• ${p.name}: ${p.goal}`).join('\n');
        return res.json({
          reply: `📋 已为你规划「${plan.title}」的阶段：\n${phaseList}\n\n⚠️ 具体任务生成失败，你可以基于这些阶段手动添加任务。`,
          action: null,
          data: null
        });
      }

      // Assemble all tasks with computed dates, then schedule times
      const confirmId = generateConfirmId();
      const unscheduled = [];

      const todayBase = getToday();
      decomposed.phases.forEach(phase => {
        phase.tasks.forEach(task => {
          unscheduled.push({
            title: task.title,
            date: addDays(todayBase, task.suggestedDaysFromNow || 0),
            // time will be assigned by Scheduler
            category: task.category || '其他',
            description: `[${plan.title}] ${phase.name}阶段`,
            subtasks: [],
            _phase: phase.name  // keep for reply formatting
          });
        });
      });

      // Layer 6: Schedule intelligent time slots
      const allTasks = scheduleProject(unscheduled);

      // Clean up internal temp fields before storing
      allTasks.forEach(t => { delete t._phase; });

      // Store for confirmation (persisted in SQLite)
      await savePendingAction(confirmId, 'projectPlan', { title: plan.title, tasks: allTasks }, uid(req));

      // Build a formatted reply showing the full plan with scheduled times
      let reply = `📋 **${plan.title}** — 共 ${decomposed.phases.length} 个阶段，${allTasks.length} 个任务\n\n`;
      decomposed.phases.forEach(phase => {
        reply += `🔹 ${phase.name}\n`;
        // Show tasks from this phase with their scheduled times
        const phaseTasks = allTasks.filter(t => t.description?.includes(`${phase.name}阶段`));
        phaseTasks.forEach((t, i) => {
          reply += `   ${i + 1}. ${t.title} — ${t.date} ${t.time}\n`;
        });
        reply += '\n';
      });
      reply += '确认后将一次性创建所有任务。';

      return res.json({
        reply,
        action: 'projectPlan',
        data: { title: plan.title, phases: decomposed.phases, taskCount: allTasks.length },
        confirmId,
        needsConfirm: true,
        actionPreview: {
          type: 'projectPlan',
          title: plan.title,
          phases: decomposed.phases.map(p => ({
            name: p.name,
            tasks: allTasks
              .filter(t => t.description?.includes(`${p.name}阶段`))
              .map(t => ({ title: t.title, date: t.date, time: t.time, category: t.category }))
          })),
          taskCount: allTasks.length
        }
      });
    }

    // ---- Unknown: fallback to chat ----
    default: {
      console.log('[Route] → Unknown intent, fallback to chat');
      const chatResult = await handleChat(message, history);
      return res.json(chatResult);
    }
  }
});

// ============================================================
// POST /api/ai/confirm — Execute confirmed actions
// ============================================================
router.post('/confirm', validate({
  confirmId: { rule: RULES.string, message: 'confirmId 必须是字符串' }
}), async (req, res) => {
  const { confirmId } = req.body;

  const action = await getPendingAction(confirmId);

  if (!action) {
    return res.json({ success: false, reply: '⏰ 操作已过期，请重新操作。' });
  }

  // 立即删除待确认记录，防止重复执行
  await deletePendingAction(confirmId);

  console.log('[Confirm] Executing:', action.type, JSON.stringify(action.data).substring(0, 100));

  switch (action.type) {
    // ===== Single-task operations (unchanged from v1) =====
    case 'create_task': {
      EventModel.createEvent(uid(req), action.data, (err, event) => {
        if (err) return res.json({ success: false, reply: '创建失败：' + sanitizeError(err) });
        res.json({ success: true, reply: `✅ 已创建「${event.title}」！`, actionExecuted: true });
      });
      break;
    }

    case 'update_task': {
      EventModel.getAllEvents(uid(req), (err, events) => {
        if (err) return res.json({ success: false, reply: '获取任务失败' });
        const target = events.find(e => e.title.includes(action.data.title));
        if (!target) return res.json({ success: false, reply: `找不到「${action.data.title}」` });

        const updates = {};
        if (action.data.newTitle) updates.title = action.data.newTitle;
        if (action.data.newDate) updates.date = action.data.newDate;
        if (action.data.newTime) updates.time = action.data.newTime;
        if (action.data.newCategory) updates.category = action.data.newCategory;
        if (action.data.completed !== undefined) updates.completed = action.data.completed;
        if (action.data.newRecurrence !== undefined) updates.recurrence = action.data.newRecurrence || null;
        const merged = { ...target, ...updates };

        EventModel.updateEvent(uid(req), target.id, merged, (err2, event) => {
          if (err2) return res.json({ success: false, reply: '修改失败' });
          res.json({ success: true, reply: `✅ 已更新「${event.title}」！`, actionExecuted: true });
        });
      });
      break;
    }

    case 'delete_task': {
      EventModel.getAllEvents(uid(req), (err, events) => {
        if (err) return res.json({ success: false, reply: '获取任务失败' });
        let targets = events.filter(e => e.title.includes(action.data.title));
        if (action.data.onlyCompleted) targets = targets.filter(e => e.completed);
        if (targets.length === 0) return res.json({ success: false, reply: '找不到匹配的任务' });

        let deleted = 0, hasError = false;
        targets.forEach(event => {
          if (hasError) return;
          EventModel.deleteEvent(uid(req), event.id, (delErr) => {
            if (hasError) return;
            if (delErr) { hasError = true; return res.json({ success: false, reply: '删除失败：' + sanitizeError(delErr) }); }
            deleted++;
            if (deleted === targets.length) {
              res.json({ success: true, reply: `✅ 已删除 ${deleted} 个任务！`, actionExecuted: true });
            }
          });
        });
      });
      break;
    }

    case 'add_subtask': {
      EventModel.getAllEvents(uid(req), (err, events) => {
        if (err) return res.json({ success: false, reply: '获取任务失败' });
        const target = events.find(e => e.title.includes(action.data.parentTitle));
        if (!target) return res.json({ success: false, reply: `找不到「${action.data.parentTitle}」` });

        const newSubtasks = [...(target.subtasks || []), { title: action.data.subtaskTitle, completed: false }];
        EventModel.updateEvent(uid(req), target.id, { ...target, subtasks: newSubtasks }, (err2) => {
          if (err2) return res.json({ success: false, reply: '添加子任务失败' });
          res.json({ success: true, reply: `✅ 已为「${target.title}」添加子任务「${action.data.subtaskTitle}」！`, actionExecuted: true });
        });
      });
      break;
    }

    // ===== Project plan: batch create all tasks (NEW in v2.0.2) =====
    case 'projectPlan': {
      const { tasks } = action.data;
      if (!tasks || tasks.length === 0) {
        return res.json({ success: false, reply: '没有需要创建的任务' });
      }

      const projectTitle = action.data.title || '项目';
      let created = 0, hasError = false;

      tasks.forEach(taskData => {
        if (hasError) return;
        EventModel.createEvent(uid(req), taskData, (err) => {
          if (hasError) return;
          if (err) { hasError = true; return res.json({ success: false, reply: '批量创建失败：' + sanitizeError(err) }); }
          created++;
          if (created === tasks.length) {
            res.json({ success: true, reply: `✅ 已创建「${projectTitle}」的全部 ${created} 个任务！`, actionExecuted: true });
          }
        });
      });
      break;
    }

    // ===== Batch operations (NEW in v2) =====
    case 'batchDelete': {
      const { eventIds } = action.data;
      if (!eventIds || eventIds.length === 0) {
        return res.json({ success: false, reply: '没有需要删除的任务' });
      }

      let deleted = 0, hasError = false;
      eventIds.forEach(id => {
        if (hasError) return;
        EventModel.deleteEvent(uid(req), id, (err) => {
          if (hasError) return;
          if (err) { hasError = true; return res.json({ success: false, reply: '批量删除失败：' + sanitizeError(err) }); }
          deleted++;
          if (deleted === eventIds.length) {
            res.json({ success: true, reply: `✅ 已批量删除 ${deleted} 个任务！`, actionExecuted: true });
          }
        });
      });
      break;
    }

    case 'batchComplete': {
      const { eventIds } = action.data;
      if (!eventIds || eventIds.length === 0) {
        return res.json({ success: false, reply: '没有需要完成的任务' });
      }

      let completed = 0, hasError = false;
      eventIds.forEach(id => {
        if (hasError) return;
        EventModel.getEventById(uid(req), id, (err, event) => {
          if (hasError) return;
          if (err) { hasError = true; return res.json({ success: false, reply: '批量完成失败：' + sanitizeError(err) }); }
          if (!event) {
            completed++;
            if (completed === eventIds.length) {
              res.json({ success: true, reply: `✅ 已批量完成 ${completed} 个任务！`, actionExecuted: true });
            }
            return;
          }
          EventModel.updateEvent(uid(req), id, { ...event, completed: true }, (err2) => {
            if (hasError) return;
            if (err2) { hasError = true; return res.json({ success: false, reply: '批量完成失败：' + sanitizeError(err2) }); }

            completed++;
            if (completed === eventIds.length) {
              res.json({ success: true, reply: `✅ 已批量完成 ${completed} 个任务！`, actionExecuted: true });
            }
          });
        });
      });
      break;
    }

    case 'batchUpdateDate': {
      const { eventIds, newDate } = action.data;
      if (!eventIds || eventIds.length === 0) {
        return res.json({ success: false, reply: '没有需要修改的任务' });
      }
      if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        return res.json({ success: false, reply: '日期格式无效，需要 YYYY-MM-DD' });
      }

      let updated = 0, hasError = false;
      eventIds.forEach(id => {
        if (hasError) return;
        EventModel.getEventById(uid(req), id, (err, event) => {
          if (hasError) return;
          if (err) { hasError = true; return res.json({ success: false, reply: '批量修改日期失败：' + sanitizeError(err) }); }
          if (!event) {
            updated++;
            if (updated === eventIds.length) {
              res.json({ success: true, reply: `✅ 已批量修改 ${updated} 个任务的日期为 ${newDate}！`, actionExecuted: true });
            }
            return;
          }
          EventModel.updateEvent(uid(req), id, { ...event, date: newDate }, (err2) => {
            if (hasError) return;
            if (err2) { hasError = true; return res.json({ success: false, reply: '批量修改日期失败：' + sanitizeError(err2) }); }
            updated++;
            if (updated === eventIds.length) {
              res.json({ success: true, reply: `✅ 已批量修改 ${updated} 个任务的日期为 ${newDate}！`, actionExecuted: true });
            }
          });
        });
      });
      break;
    }

    default:
      res.json({ success: false, reply: '未知操作类型' });
  }
});

// ============================================================
// DELETE /api/ai/history — 清除当前用户的聊天历史
// ============================================================
router.delete('/history', (req, res) => {
  const userId = uid(req);
  const where = userId != null ? 'WHERE user_id = ?' : 'WHERE user_id IS NULL';
  const params = userId != null ? [userId] : [];
  db.run(`DELETE FROM chat_history ${where}`, params, function (err) {
    if (err) {
      console.error('[History] DELETE 失败:', err.message);
      return res.status(500).json({ success: false, message: '清除失败' });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

// ============================================================
// GET /api/ai/history — 加载聊天历史（按用户隔离）
// ============================================================
router.get('/history', (req, res) => {
  const userId = uid(req);
  const where = userId != null
    ? `WHERE user_id = ? AND created_at >= datetime('now', '-7 days')`
    : `WHERE user_id IS NULL AND created_at >= datetime('now', '-7 days')`;
  const params = userId != null ? [userId] : [];
  // 取最近 500 条（DESC + 前端 reverse），避免 ASC + LIMIT 截掉最新消息
  db.all(
    `SELECT role, message, created_at FROM chat_history ${where} ORDER BY id DESC LIMIT 500`,
    params,
    (err, rows) => {
      if (err) {
        console.error('[History] GET 查询失败:', err.message);
        return res.json({ history: [] });
      }
      // 反转回时间正序
      rows.reverse();
      res.json({ history: rows.map(r => ({
        role: r.role,
        message: r.message,
        createdAt: r.created_at,
      })) });
    }
  );
});

// ============================================================
// POST /api/ai/history — 保存对话（按用户隔离）
// ============================================================
router.post('/history', validate({
  messages: { rule: RULES.array, message: 'messages 必须是数组' }
}), (req, res) => {
  const { messages } = req.body;
  if (!messages || messages.length === 0) {
    return res.json({ success: false });
  }

  const userId = uid(req);
  const validMessages = messages.filter(msg => msg.role && msg.message);
  if (validMessages.length === 0) {
    return res.json({ success: false });
  }

  // 用 db.serialize 保证插入顺序（user → assistant），避免异步竞态导致时序混乱
  db.serialize(() => {
    const stmt = db.prepare(
      `INSERT INTO chat_history (role, message, user_id) VALUES (?, ?, ?)`
    );
    let inserted = 0;
    validMessages.forEach(msg => {
      stmt.run(msg.role, msg.message, userId != null ? userId : null, (err) => {
        if (!err) inserted++;
      });
    });
    stmt.finalize(() => {
      // 清理超过7天的记录
      db.run(`DELETE FROM chat_history WHERE user_id ${userId != null ? '= ?' : 'IS NULL'} AND created_at < datetime('now', '-7 days')`,
        userId != null ? [userId] : []);
      res.json({ success: inserted > 0, inserted });
    });
  });
});

module.exports = router;
