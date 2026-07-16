const express = require('express');
const router = express.Router();
const EventModel = require('../models/eventModel');
const { validate, RULES } = require('../../middleware/validate');
const { sanitizeError } = require('../../middleware/sanitizeError');

// 从 req 提取 userId（已登录 → 用户ID，未登录 → null=guest）
function uid(req) { return req.user ? req.user.userId : null; }

router.get('/', (req, res) => {
  const userId = uid(req);
  // 先追补重复事件（确保每日任务不会因漏完成而断链），再返回事件列表
  EventModel.catchUpRecurringEvents(userId, (_catchUpErr) => {
    // 即使追补失败也不影响正常返回事件
    EventModel.getAllEvents(userId, (err, events) => {
      if (err) {
        res.status(500).json({ error: sanitizeError(err) });
      } else {
        res.json(events);
      }
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
  time: { rule: RULES.string, message: 'time 必须是字符串（HH:MM）' },
  category: { rule: RULES.string, message: 'category 必须是字符串', optional: true },
  description: { rule: RULES.string, message: 'description 必须是字符串', optional: true },
  reminder: { rule: (v) => v === 0 || v === 1 || v === true || v === false, message: 'reminder 必须是 0 或 1', optional: true },
  subtasks: { rule: RULES.array, message: 'subtasks 必须是数组', optional: true }
}), (req, res) => {
  EventModel.createEvent(uid(req), req.body, (err, event) => {
    if (err) {
      res.status(500).json({ error: sanitizeError(err) });
    } else {
      res.status(201).json(event);
    }
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
  subtasks: { rule: RULES.array, message: 'subtasks 必须是数组', optional: true }
}), (req, res) => {
  const id = parseInt(req.params.id);
  const userId = uid(req);

  EventModel.getEventById(userId, id, (fetchErr, oldEvent) => {
    if (fetchErr) return res.status(500).json({ error: sanitizeError(fetchErr) });
    if (!oldEvent) return res.status(404).json({ error: '事件不存在' });

    const wasCompleted = oldEvent.completed;
    const nowCompleted = req.body.completed === true || req.body.completed === 1 || req.body.completed === '1';

    EventModel.updateEvent(userId, id, req.body, (err, updatedEvent) => {
      if (err) return res.status(500).json({ error: sanitizeError(err) });
      if (!updatedEvent) return res.status(404).json({ error: '事件不存在' });

      const hasRecurrence = updatedEvent.recurrence && ['daily', 'weekly', 'monthly', 'yearly'].includes(updatedEvent.recurrence);
      const justCompleted = !wasCompleted && nowCompleted;

      if (justCompleted && hasRecurrence) {
        EventModel.fillRecurringChain(userId, updatedEvent);
      }

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

    const wasCompleted = event.completed;
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

      // 如果从"未完成"→"完成"且有重复规则，生成下一个重复事件
      const hasRecurrence = updatedEvent.recurrence && ['daily', 'weekly', 'monthly', 'yearly'].includes(updatedEvent.recurrence);
      const justCompleted = !wasCompleted && nowCompleted;

      if (justCompleted && hasRecurrence) {
        EventModel.fillRecurringChain(userId, updatedEvent);
      }

      res.json(updatedEvent);
    });
  });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  EventModel.deleteEvent(uid(req), id, (err, result) => {
    if (err) {
      res.status(500).json({ error: sanitizeError(err) });
    } else {
      res.json(result);
    }
  });
});

module.exports = router;