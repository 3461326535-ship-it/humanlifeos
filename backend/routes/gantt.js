/**
 * 甘特图 API（第五个板块）
 *
 *   GET    /api/gantt                          整张图：任务 + 依赖 + 关键路径 + 项目
 *   PATCH  /api/gantt/tasks/:id                移动/拉伸任务条（可选级联顺延后续任务）
 *   POST   /api/gantt/auto-schedule            按依赖自动排程（可提前，紧凑排列）
 *   POST   /api/gantt/dependencies             新增依赖（自动拦环）
 *   PATCH  /api/gantt/dependencies/:a/:b       改依赖类型 / 滞后天数
 *   DELETE /api/gantt/dependencies/:a/:b       删除依赖
 */
const express = require('express');
const router = express.Router();
const Gantt = require('../models/ganttModel');
const { sanitizeError } = require('../../middleware/sanitizeError');

function uid(req) {
  return req.user ? req.user.userId : null;
}

function fail(res, err) {
  if (!err) return res.status(500).json({ error: '未知错误' });
  const map = { NOT_FOUND: 404, BAD_INPUT: 400, CYCLE: 409 };
  const status = map[err.code] || 500;
  res.status(status).json({ error: status === 500 ? sanitizeError(err) : err.message });
}

router.get('/', async (req, res) => {
  try {
    const raw = req.query.project_id;
    const projectId = raw != null && raw !== '' ? Number(raw) : null;
    const board = await Gantt.loadBoard(uid(req), {
      projectId: Number.isFinite(projectId) ? projectId : null,
      includeRecurring: req.query.include_recurring === '1',
    });
    res.json(board);
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id 不合法' });
    const { start, end, cascade } = req.body || {};
    const out = await Gantt.moveTask(uid(req), id, {
      start,
      end,
      cascade: cascade !== false,
    });
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/auto-schedule', async (req, res) => {
  try {
    const out = await Gantt.autoSchedule(uid(req));
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/dependencies', async (req, res) => {
  try {
    const { event_id, depends_on, type, lag_days } = req.body || {};
    const out = await Gantt.addDependency(uid(req), { event_id, depends_on, type, lag_days });
    res.status(201).json(out);
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/dependencies/:eventId/:dependsOn', async (req, res) => {
  try {
    const out = await Gantt.updateDependency(uid(req), {
      event_id: req.params.eventId,
      depends_on: req.params.dependsOn,
      type: (req.body || {}).type,
      lag_days: (req.body || {}).lag_days,
    });
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/dependencies/:eventId/:dependsOn', async (req, res) => {
  try {
    const out = await Gantt.removeDependency(uid(req), req.params.eventId, req.params.dependsOn);
    res.json(out);
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
