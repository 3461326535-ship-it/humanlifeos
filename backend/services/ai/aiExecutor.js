// Layer 6: Executor (v2)
// Executes structured operations from the pipeline:
// - batch_query: filter and list tasks (read-only)
// - batch_delete: filter and delete tasks
// - batch_complete: filter and mark tasks complete
// - summary/suggestion/analysis: existing reporting functions
//
// Also handles single-task execution (create/update/delete called from confirm endpoint).

const { getToday, addDays, getWeekRange } = require('./aiDateHelper');
const EventModel = require('../../models/eventModel');

/**
 * Apply structured filters to an array of events (in-memory filtering)
 */
function applyFilters(events, filters) {
  let result = [...events];

  if (filters.date) {
    result = result.filter(e => e.date === filters.date);
  }
  if (filters.date_start) {
    result = result.filter(e => e.date >= filters.date_start);
  }
  if (filters.date_end) {
    result = result.filter(e => e.date <= filters.date_end);
  }
  if (filters.date_before) {
    result = result.filter(e => e.date < filters.date_before);
  }
  if (filters.status === 'incomplete') {
    result = result.filter(e => !e.completed);
  }
  if (filters.status === 'completed') {
    result = result.filter(e => e.completed);
  }
  if (filters.category) {
    result = result.filter(e => e.category === filters.category);
  }
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    result = result.filter(e => e.title.toLowerCase().includes(kw));
  }

  return result;
}

/**
 * Execute a resolved query operation
 * @param {object} resolved - { filters, operation, summary_type, new_date } from Query Resolver
 * @param {function} callback - (result) => {} where result is { reply, needsConfirm?, actionPreview?, ... }
 */
function executeResolved(userId, resolved, callback) {
  const { filters, operation, summary_type, new_date } = resolved;

  EventModel.getAllEvents(userId, (err, events) => {
    if (err) {
      return callback({ reply: '获取任务数据失败，请稍后重试 😅' });
    }

    const filtered = applyFilters(events, filters);

    switch (operation) {
      case 'batch_query':
        return callback(buildBatchQueryReply(filtered, filters));

      case 'batch_delete':
        return callback(buildBatchDeleteReply(filtered));

      case 'batch_complete':
        return callback(buildBatchCompleteReply(filtered));

      case 'batch_update_date':
        return callback(buildBatchUpdateDateReply(filtered, new_date));

      case 'summary':
        return callback(buildSummaryReply(filtered, summary_type, filters));

      default:
        return callback({ reply: `未知操作类型: ${operation}` });
    }
  });
}

/**
 * Execute a single-task action (called from orchestrator for task_single intent)
 * Wraps the old handleTask response for backward compatibility.
 * @param {object} taskResult - { action, data, reply, needsConfirm, confirmId }
 * @param {function} callback
 */
function executeTaskAction(userId, taskResult, callback) {
  const { action, data } = taskResult;

  switch (action) {
    case 'summary':
      EventModel.getAllEvents(userId, (err, events) => {
        if (err) return callback({ reply: '获取日程失败...' });
        const result = buildLegacySummary(data.period || 'today', events);
        callback({ reply: result });
      });
      break;

    case 'suggestion':
      EventModel.getAllEvents(userId, (err, events) => {
        if (err) return callback({ reply: '获取日程失败...' });
        const result = buildLegacySuggestion(events);
        callback({ reply: result });
      });
      break;

    case 'analysis':
      EventModel.getAllEvents(userId, (err, events) => {
        if (err) return callback({ reply: '获取日程失败...' });
        const result = buildLegacyAnalysis(events);
        callback({ reply: result });
      });
      break;

    default:
      callback({ reply: '未知操作' });
  }
}

// ========== Batch reply builders ==========

function buildBatchQueryReply(filtered, filters) {
  if (filtered.length === 0) {
    let desc = '没有找到';
    if (filters.date) desc += ` ${filters.date}`;
    if (filters.status === 'incomplete') desc += ' 未完成的';
    if (filters.status === 'completed') desc += ' 已完成的';
    desc += ' 任务';
    return { reply: `📋 ${desc}。` };
  }

  const parts = filtered.slice(0, 15).map((e, i) => {
    const status = e.completed ? '✅' : '⬜';
    return `${i + 1}. ${status} ${e.title} — ${e.date} ${e.time?.substring(0, 5) || ''}`;
  });

  let reply = `📋 找到 ${filtered.length} 个任务：\n${parts.join('\n')}`;
  if (filtered.length > 15) {
    reply += `\n... 还有 ${filtered.length - 15} 个任务未显示`;
  }

  return { reply };
}

function buildBatchDeleteReply(filtered) {
  if (filtered.length === 0) {
    return { reply: '没有找到需要删除的任务。' };
  }

  const titles = filtered.slice(0, 10).map(e => e.title);
  return {
    reply: `⚠️ 即将删除 ${filtered.length} 个任务，请确认`,
    needsConfirm: true,
    actionPreview: {
      type: 'batchDelete',
      affectedCount: filtered.length,
      titles,
      eventIds: filtered.map(e => e.id)
    }
  };
}

function buildBatchCompleteReply(filtered) {
  if (filtered.length === 0) {
    return { reply: '没有找到需要标记完成的任务。' };
  }

  const titles = filtered.slice(0, 10).map(e => e.title);
  return {
    reply: `✅ 即将标记完成 ${filtered.length} 个任务，请确认`,
    needsConfirm: true,
    actionPreview: {
      type: 'batchComplete',
      affectedCount: filtered.length,
      titles,
      eventIds: filtered.map(e => e.id)
    }
  };
}

function buildBatchUpdateDateReply(filtered, newDate) {
  if (filtered.length === 0) {
    return { reply: '没有找到需要修改日期的任务。' };
  }

  const titles = filtered.slice(0, 10).map(e => e.title);
  return {
    reply: `📅 即将把 ${filtered.length} 个任务的日期改为 ${newDate}，请确认`,
    needsConfirm: true,
    actionPreview: {
      type: 'batchUpdateDate',
      affectedCount: filtered.length,
      titles,
      newDate,
      eventIds: filtered.map(e => e.id)
    }
  };
}

function buildSummaryReply(filtered, summaryType, filters) {
  const total = filtered.length;
  const done = filtered.filter(e => e.completed).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  let label = '';
  if (filters.date) label = filters.date;
  else if (filters.date_start && filters.date_end) label = `${filters.date_start} ~ ${filters.date_end}`;
  else label = '全部';

  if (summaryType === 'completion_rate' || summaryType === 'count') {
    // 附加各分类明细
    const cats = {};
    filtered.forEach(e => {
      const c = e.category || '其他';
      if (!cats[c]) cats[c] = { total: 0, done: 0 };
      cats[c].total++;
      if (e.completed) cats[c].done++;
    });
    let catDetail = '';
    if (Object.keys(cats).length > 0) {
      catDetail = '\n\n📂 各分类明细：\n';
      Object.entries(cats).forEach(([cat, s]) => {
        const cp = s.total > 0 ? Math.round(s.done / s.total * 100) : 0;
        const bar = '█'.repeat(Math.round(cp / 10)) + '░'.repeat(10 - Math.round(cp / 10));
        catDetail += `  ${cat}: ${bar} ${s.done}/${s.total} (${cp}%)\n`;
      });
    }
    return { reply: `📊 ${label}：共 ${total} 个任务，已完成 ${done} 个，完成率 ${pct}%。${catDetail}` };
  }

  // Default: list + stats
  return buildBatchQueryReply(filtered, filters);
}

// ========== Legacy summary/suggestion/analysis (moved from old ai.js) ==========

function buildLegacySummary(period, events) {
  const today = getToday();
  let filtered, label;

  if (period === 'today') {
    filtered = events.filter(e => e.date === today);
    label = '今日';
  } else if (period === 'week') {
    const week = getWeekRange();
    filtered = events.filter(e => e.date >= week.start && e.date <= week.end);
    label = '本周';
  } else {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`;
    filtered = events.filter(e => e.date >= start && e.date <= end);
    label = '本月';
  }

  const total = filtered.length;
  const done = filtered.filter(e => e.completed).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  return `${label}共 ${total} 个任务，已完成 ${done} 个，完成率 ${pct}%。`;
}

function buildLegacySuggestion(events) {
  const today = getToday();
  const overdue = events.filter(e => e.date < today && !e.completed);
  const pending = events.filter(e => e.date === today && !e.completed);

  let tips = '';
  if (overdue.length > 0) tips += `⚠️ 有 ${overdue.length} 个任务已逾期，建议尽快处理。\n`;
  if (pending.length > 3) tips += `📋 今天有 ${pending.length} 个待办，合理分配时间哦。\n`;
  if (pending.length === 0 && overdue.length === 0) tips += '✅ 没有逾期和待办任务，继续保持！\n';
  tips += '💡 建议每天早上花 5 分钟规划优先级。';
  return tips;
}

function buildLegacyAnalysis(events) {
  const cats = {};
  events.forEach(e => {
    const c = e.category || '其他';
    if (!cats[c]) cats[c] = { total: 0, done: 0 };
    cats[c].total++;
    if (e.completed) cats[c].done++;
  });

  let result = '📊 各分类完成率：\n';
  Object.entries(cats).forEach(([cat, stats]) => {
    const pct = stats.total > 0 ? Math.round(stats.done / stats.total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    result += `  ${cat}: ${bar} ${stats.done}/${stats.total} (${pct}%)\n`;
  });
  return result;
}

module.exports = {
  applyFilters,
  executeResolved,
  executeTaskAction,
  buildBatchQueryReply,
  buildBatchDeleteReply,
  buildBatchCompleteReply,
  buildBatchUpdateDateReply
};
