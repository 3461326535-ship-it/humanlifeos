'use strict';

// 时间轴「实际投入」= 任务计时区间 ∪ 已打卡习惯占用区间，重叠只算一次。
//
// 为什么放在后端：统计面板（今日实际投入 / 平均专注 / 每日战报）和日历「实际」
// 视图必须用同一份数字，各算一遍必然对不上。
//
// 时区：窗口（fromTs/toTs）与习惯的本地日期都由前端按用户本地时区算好传进来，
// 这里只做区间运算，不猜服务器时区。

const db = require('../models/db');
const HabitModel = require('../models/habitModel')(db);
const { toEpoch, unionOfIntervals } = require('../utils/timeWindow');

// 习惯没填结束时间时按 45 分钟占用（与日历里习惯块的长度保持一致）
const HABIT_DEFAULT_MIN = 45;

/** 'YYYY-MM-DD' + 'HH:MM' + 时区偏移（分钟，东为正）→ epoch 秒 */
function localEpoch(day, hhmm, tzOffsetMin) {
  const [y, m, d] = String(day || '').split('-').map(Number);
  if (!y || !m || !d) return NaN;
  const [hh, mm] = String(hhmm || '00:00').split(':').map(Number);
  const base = Date.UTC(y, m - 1, d, hh || 0, mm || 0) / 1000;
  return Math.floor(base) - (Number(tzOffsetMin) || 0) * 60;
}

/** 一条习惯 occurrence → [start, end]（epoch 秒），没填结束时间按默认 45 分钟 */
function habitInterval(o, tzOffsetMin) {
  const start = localEpoch(o.date, o.time, tzOffsetMin);
  if (!Number.isFinite(start)) return null;
  let end;
  if (o.end_time && String(o.end_time).includes(':')) {
    end = localEpoch(o.date, o.end_time, tzOffsetMin);
    if (Number.isFinite(end) && end <= start) end += 86400; // 结束早于开始 → 跨零点
  } else {
    end = start + HABIT_DEFAULT_MIN * 60;
  }
  return [start, end];
}

/**
 * @param {object} opts
 * @param {number|null} opts.userId     null = guest
 * @param {string} opts.fromTs          窗口起点（UTC 'YYYY-MM-DD HH:MM:SS'，含）
 * @param {string} opts.toTs            窗口终点（UTC，不含）
 * @param {string} [opts.fromDay]       本地日期，用于展开习惯；缺省由窗口推算
 * @param {string} [opts.toDay]
 * @param {number} [opts.tzOffsetMin]   本地时区偏移分钟（东八区 = 480）
 * @param {number} [opts.nowSec]
 */
function collect(opts, cb) {
  const { userId, fromTs, toTs, fromDay, toDay } = opts || {};
  const tz = Number(opts && opts.tzOffsetMin) || 0;
  const winFrom = toEpoch(fromTs);
  const winTo = toEpoch(toTs);
  if (!Number.isFinite(winFrom) || !Number.isFinite(winTo) || winTo <= winFrom) {
    return cb(new Error('from / to 需要 UTC 时间字符串，且 to 晚于 from'));
  }
  const now = opts.nowSec || Math.floor(Date.now() / 1000);
  const dayOf = (sec) => new Date((sec + tz * 60) * 1000).toISOString().slice(0, 10);
  const fromD = /^\d{4}-\d{2}-\d{2}$/.test(fromDay || '') ? fromDay : dayOf(winFrom);
  const toD = /^\d{4}-\d{2}-\d{2}$/.test(toDay || '') ? toDay : dayOf(winTo - 1);

  // 只取「与窗口有交集」的段落：跨零点的计时段两边都要能画出来
  const where = userId != null ? 'te.user_id = ?' : 'te.user_id IS NULL';
  const params = userId != null ? [userId, toTs, fromTs] : [toTs, fromTs];

  db.all(
    `SELECT te.id, te.event_id, te.started_at, te.ended_at, e.title, e.status
     FROM time_entries te
     LEFT JOIN events e ON e.id = te.event_id
     WHERE ${where} AND te.started_at < ? AND (te.ended_at IS NULL OR te.ended_at > ?)
     ORDER BY te.started_at`,
    params,
    (err, rows) => {
      if (err) return cb(err);

      const segments = (rows || [])
        .map((r) => {
          const s = toEpoch(r.started_at);
          const rawEnd = r.ended_at ? toEpoch(r.ended_at) : now;
          const end = Number.isFinite(rawEnd) ? Math.max(s, rawEnd) : s;
          return {
            id: r.id,
            event_id: r.event_id,
            title: r.title || '（已删除的任务）',
            status: r.status || 'todo',
            started_at: r.started_at,
            ended_at: r.ended_at,
            running: !r.ended_at,
            start_ts: Math.max(s, winFrom),
            end_ts: Math.min(end, winTo),
            seconds: Math.max(0, Math.min(end, winTo) - Math.max(s, winFrom)),
          };
        })
        .filter((s) => s.end_ts > s.start_ts);

      HabitModel.getOccurrences(userId, fromD, toD, (err2, occ) => {
        if (err2) return cb(err2);

        const habits = [];
        (occ || []).forEach((o) => {
          if (o.status !== 'done') return; // 只有真的打卡了才占用时间
          const iv = habitInterval(o, tz);
          if (!iv) return;
          const s = Math.max(iv[0], winFrom);
          const e = Math.min(iv[1], winTo);
          if (e <= s) return;
          habits.push({
            habit_id: o.habit_id,
            title: o.title,
            date: o.date,
            status: o.status,
            start_ts: s,
            end_ts: e,
            seconds: e - s,
          });
        });

        const taskIv = segments.map((s) => [s.start_ts, s.end_ts]);
        const habitIv = habits.map((h) => [h.start_ts, h.end_ts]);
        const all = unionOfIntervals([...taskIv, ...habitIv]);
        const taskOnly = unionOfIntervals(taskIv);
        const habitOnly = unionOfIntervals(habitIv);

        cb(null, {
          fromTs,
          toTs,
          fromDay: fromD,
          toDay: toD,
          tzOffsetMin: tz,
          // 去重后的实际投入（任务 + 习惯，重叠只算一次）
          total_minutes: all.minutes,
          sum_minutes: Math.round((all.sumSeconds / 60) * 10) / 10,
          overlap_minutes: Math.round((all.overlapSeconds / 60) * 10) / 10,
          task_minutes: taskOnly.minutes,
          task_sum_minutes: Math.round((taskOnly.sumSeconds / 60) * 10) / 10,
          habit_minutes: habitOnly.minutes,
          habit_sum_minutes: Math.round((habitOnly.sumSeconds / 60) * 10) / 10,
          segments,
          habits,
        });
      });
    }
  );
}

module.exports = { collect, localEpoch, habitInterval, HABIT_DEFAULT_MIN };
