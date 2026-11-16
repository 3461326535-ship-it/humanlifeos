const express = require('express');
const router = express.Router();
const EventModel = require('../models/eventModel');
const { isV04SchemaReady } = require('../models/v04Schema');
const { validate, RULES } = require('../../middleware/validate');
const { sanitizeError } = require('../../middleware/sanitizeError');

// 从 req 提取 userId（已登录 → 用户ID，未登录 → null=guest）
function uid(req) { return req.user ? req.user.userId : null; }

router.get('/', (req, res) => {
  const userId = uid(req);
  const includeArchived = req.query.include_archived === '1';

  // v0.4：新 schema 就绪后，看板 / 日历默认隐藏软归档的周期实例。
  // 迁移前不拼 archived_at 条件（列尚不存在），由 v04Ready 控制。
  const respond = (v04Ready) => EventModel.getAllEvents(userId, (err, events) => {
    if (err) {
      res.status(500).json({ error: sanitizeError(err) });
    } else {
      res.json(events);
    }
  }, { activeOnly: v04Ready && !includeArchived });

  // v0.4：新模型三表已建 → 旧 recurrence 写放大停写，迁移去重结果才不会被写回脏。
  // 未迁移时保留原兜底追补行为，保证升级过程中的平滑。
  isV04SchemaReady((v04Ready) => {
    if (v04Ready) return respond(v04Ready);
    EventModel.catchUpRecurringEvents(userId, (_catchUpErr) => {
      // 即使追补失败也不影响正常返回事件
      respond(false);
    });
  });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  EventModel.getEventById(uid(req), id, (err, event) => {
    if (err) {
      res.status(500).json({ error: sanitizeError(err) });
    } else if (!event) {
      res.status(404).json({ error: '事件不存在' });
    } else {
      res.json(event);
    }
  });
});

router.post('/', validate({
  title: { rule: RULES.string, message: 'title 必须是字符串' },
  date: { rule: RULES.string, message: 'date 必须是字符串（YYYY-MM-DD）' },
  time: { rule: RULES.string, message: 'time 必须是字符串（HH:MM）', optional: true },
  category: { rule: RULES.string, message: 'category 必须是字符串', optional: true },
  description: { rule: RULES.string, message: 'description 必须是字符串', optional: true },
  reminder: { rule: (v) => v === 0 || v === 1 || v === true || v === false, message: 'reminder 必须是 0 或 1', optional: true },
  subtasks: { rule: RULES.array, message: 'subtasks 必须是数组', optional: true },
  end_date: { rule: RULES.string, message: 'end_date 必须是字符串（YYYY-MM-DD）', optional: true },
  is_milestone: { rule: (v) => v === 0 || v === 1 || v === true || v === false, message: 'is_milestone 必须是 0 或 1', optional: true }
}), (req, res) => {
  EventModel.createEvent(uid(req), req.body, (err, event) => {
    if (err) {
      return res.status(500).json({ error: sanitizeError(err) });
    }

    const userId = uid(req);
    const rec = event.recurrence;
    const isRecurring = rec && ['daily', 'weekly', 'monthly', 'yearly'].includes(rec);

    // v0.4：新模型三表已建后不再前置生成几十~上千条实体实例。
    // 习惯走 habits 规则（零物化），周期任务走 recurring_rules + 窗口懒补。
    isV04SchemaReady((v04Ready) => {
      if (!isRecurring) return res.status(201).json(event);

      // 老 schema：沿用一次性铺量（迁移期兜底，v0.4 就绪后不会走到这里）
      if (!v04Ready) {
        return EventModel.generateForwardInstances(userId, event, () => res.status(201).json(event));
      }

      // 新 schema：建「规则」，并把刚建好的这一行挂成它的第一期。
      // 不做的话，「每周」就只是一个字段 —— 一条永不重复的假周期任务。
      const RuleModel = require('../models/recurringRuleModel')(require('../models/db'));
      const R = require('../models/rrule');
      const RRULE_OF = {
        daily: 'FREQ=DAILY;INTERVAL=1',
        weekly: 'FREQ=WEEKLY;INTERVAL=1',
        monthly: 'FREQ=MONTHLY;INTERVAL=1',
        yearly: 'FREQ=YEARLY;INTERVAL=1',
      };

      RuleModel.createRule(userId, {
        title: event.title,
        rrule: RRULE_OF[rec],
        dtstart: event.date,
        until_date: event.recurrence_end_date || null,
        start_time: event.time || '',
        end_time: event.end_time || null,
        project_id: event.project_id || null,
        priority: event.priority || null,
        default_status: 'todo',
        category: event.category || '其他',
        valid_from: event.date,
      }, (ruleErr, rule) => {
        // 建规则失败不该把任务本身一起丢掉：退化成一条普通任务，至少不假装它能重复
        if (ruleErr || !rule) return res.status(201).json(event);

        RuleModel.attachInstance(userId, rule.id, event.id, event.date, () => {
          const today = R.todayStr();
          // 铺到「今天 → 视节律而定的 horizon」：日历/甘特够看未来排期，又不至于一建就几百行。
          // 窗口长度和「改规则」共用同一张表 —— 两边不一致就会出现「改完铺得比建的还少」
          RuleModel.ensureWindow(userId, today, R.addDays(today, RuleModel.horizonDays(RRULE_OF[rec])), () => {
            EventModel.getEventById(userId, event.id, (e2, fresh) => res.status(201).json(fresh || event));
          });
        });
      });
    });
  });
});

router.put('/:id', validate({
  title: { rule: RULES.string, message: 'title 必须是字符串', optional: true },
  date: { rule: RULES.string, message: 'date 必须是字符串', optional: true },
  time: { rule: RULES.string, message: 'time 必须是字符串', optional: true },
  category: { rule: RULES.string, message: 'category 必须是字符串', optional: true },
  description: { rule: RULES.string, message: 'description 必须是字符串', optional: true },
  completed: { rule: (v) => v === 0 || v === 1 || v === true || v === false, message: 'completed 必须是 0 或 1', optional: true },
  reminder: { rule: (v) => v === 0 || v === 1 || v === true || v === false, message: 'reminder 必须是 0 或 1', optional: true },
  recurrence: { rule: RULES.string, message: 'recurrence 必须是字符串或 null', optional: true },
  recurrence_end_date: { rule: RULES.string, message: 'recurrence_end_date 必须是字符串', optional: true },
  subtasks: { rule: RULES.array, message: 'subtasks 必须是数组', optional: true },
  end_date: { rule: RULES.string, message: 'end_date 必须是字符串（YYYY-MM-DD）', optional: true },
  is_milestone: { rule: (v) => v === 0 || v === 1 || v === true || v === false, message: 'is_milestone 必须是 0 或 1', optional: true },
  // 补录完成日期：前端传带时区的 ISO（或 YYYY-MM-DD），后端统一收敛成 UTC
  completed_at: { rule: RULES.string, message: 'completed_at 必须是字符串（ISO 时间或 YYYY-MM-DD）', optional: true }
}), (req, res) => {
  const id = parseInt(req.params.id);
  const userId = uid(req);

  EventModel.getEventById(userId, id, (fetchErr, oldEvent) => {
    if (fetchErr) return res.status(500).json({ error: sanitizeError(fetchErr) });
    if (!oldEvent) return res.status(404).json({ error: '事件不存在' });

    EventModel.updateEvent(userId, id, req.body, (err, updatedEvent) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      if (!updatedEvent) return res.status(404).json({ error: '事件不存在' });

      res.json(updatedEvent);
    });
  });
});

// 切换事件完成状态（乐观更新兼容：无请求体，仅翻转 completed）
router.patch('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const userId = uid(req);

  EventModel.getEventById(userId, id, (fetchErr, event) => {
    if (fetchErr) return res.status(500).json({ error: sanitizeError(fetchErr) });
    if (!event) return res.status(404).json({ error: '事件不存在' });

    const nowCompleted = !event.completed;

    // 构建更新数据：翻转 completed，同步所有子任务
    const updateData = {
      completed: nowCompleted ? 1 : 0,
      subtasks: (event.subtasks || []).map(st => ({
        title: st.title,
        completed: nowCompleted
      }))
    };

    EventModel.updateEvent(userId, id, updateData, (err, updatedEvent) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      if (!updatedEvent) return res.status(404).json({ error: '事件不存在' });

      res.json(updatedEvent);
    });
  });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const deleteChain = req.query.chain === 'true';

  if (deleteChain) {
    EventModel.deleteEventChain(uid(req), id, (err, result) => {
      if (err) {
        res.status(500).json({ error: sanitizeError(err) });
      } else {
        res.json(result);
      }
    });
  } else {
    EventModel.deleteEvent(uid(req), id, (err, result) => {
      if (err) {
        res.status(500).json({ error: sanitizeError(err) });
      } else {
        res.json(result);
      }
    });
  }
});

// ══════════════════════════════════════════════════════════
// v2 新增端点：看板 / 计时
// ══════════════════════════════════════════════════════════

const STATUS_VALUES = ['todo', 'in_progress', 'review', 'done'];

// 看板拖拽换列：更新状态（可选同时更新列内位置）
router.patch('/:id/status', validate({
  status: { rule: (v) => STATUS_VALUES.includes(v), message: 'status 必须是 todo / in_progress / review / done' },
  position: { rule: (v) => typeof v === 'number', message: 'position 必须是数字', optional: true }
}), (req, res) => {
  const id = parseInt(req.params.id);
  EventModel.updateStatus(uid(req), id, req.body.status, req.body.position, (err, event) => {
    // model 对「0 行受影响」会给出 404，别再统一压成 500
    if (err) return res.status(err.statusCode || 500).json({ error: sanitizeError(err) });
    if (!event) return res.status(404).json({ error: '事件不存在' });
    res.json(event);
  });
});

// 看板列内批量排序
router.post('/reorder', validate({
  items: { rule: RULES.array, message: 'items 必须是数组 [{id, position}]' }
}), (req, res) => {
  EventModel.reorder(uid(req), req.body.items, (err, result) => {
    if (err) return res.status(500).json({ error: sanitizeError(err) });
    res.json(result);
  });
});

// 计时：开始
router.post('/:id/timer/start', (req, res) => {
  const id = parseInt(req.params.id);
  EventModel.startTimer(uid(req), id, (err, entry) => {
    if (err) {
      if (err.code === 'TIMER_RUNNING') return res.status(409).json({ error: err.message });
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!entry) return res.status(404).json({ error: '事件不存在' });
    res.status(201).json(entry);
  });
});

// 计时：结束
router.post('/:id/timer/stop', (req, res) => {
  const id = parseInt(req.params.id);
  EventModel.stopTimer(uid(req), id, (err, entry) => {
    if (err) {
      if (err.code === 'NO_TIMER') return res.status(409).json({ error: err.message });
      return res.status(500).json({ error: sanitizeError(err) });
    }
    if (!entry) return res.status(404).json({ error: '事件不存在' });
    res.json(entry);
  });
});

// 计时记录列表
router.get('/:id/time-entries', (req, res) => {
  const id = parseInt(req.params.id);
  EventModel.getTimeEntries(uid(req), id, (err, rows) => {
    if (err) return res.status(500).json({ error: sanitizeError(err) });
    if (!rows) return res.status(404).json({ error: '事件不存在' });
    res.json(rows);
  });
});

// 「不做」/ 撤销不做（终态标记，不删除数据）
router.patch('/:id/cancel', (req, res) => {
  const id = parseInt(req.params.id);
  const canceled = req.body && req.body.canceled === false ? false : true;
  EventModel.cancelEvent(uid(req), id, canceled, (err, result) => {
    if (err) return res.status(err.statusCode || 500).json({ error: sanitizeError(err) });
    res.json(result);
  });
});

// ══════════════════════════════════════════════════════════
// v0.4：恢复软归档的周期实例（归档只是 archived_at 标记，可回溯）
// ══════════════════════════════════════════════════════════
router.patch('/:id/unarchive', (req, res) => {
  const id = parseInt(req.params.id);
  const RuleModel = require('../models/recurringRuleModel')(require('../models/db'));
  RuleModel.unarchive(uid(req), id, (err, result) => {
    if (err) return res.status(500).json({ error: sanitizeError(err) });
    res.json(result);
  });
});

module.exports = router;