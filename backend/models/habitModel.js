'use strict';

// ══════════════════════════════════════════════════════════════
// Habit 模型：一条 RRULE + 按日 override，零物化（绝不写 events）
//
//  · occurrence 身份 = (habit_id, date)，只存在于投影结果里
//  · 四态 pending / done / skipped / excused
//      - 无 override 且日期已过 → 自动判 skipped（断签），不落库
//      - excused = 合规跳过，从分母扣除、streak 暂停
//  · UNIQUE(habit_id, date) 是 UPSERT 的冲突目标
//  · 规则结构性变更走版本化：封旧 valid_to + 新建 valid_from=今天，
//    历史窗口仍按旧规则投影，历史 override 不丢。
//
// 导出工厂 createHabitModel(db)：路由注入真实 db，测试可注入 stub。
// ══════════════════════════════════════════════════════════════

const R = require('./rrule');

const STATUSES = ['pending', 'done', 'skipped', 'excused'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function createHabitModel(db) {
  function scope(userId) {
    return userId != null ? 'user_id = ?' : 'user_id IS NULL';
  }
  function sp(userId, extra) {
    return userId != null ? [userId, ...extra] : extra;
  }
  function bad(msg, cb) { return process.nextTick(() => cb(new Error(msg), null)); }

  function getHabit(userId, id, cb) {
    db.get(`SELECT * FROM habits WHERE ${scope(userId)} AND id = ?`,
      sp(userId, [id]), (err, row) => cb(err || null, row || null));
  }

  function listHabits(userId, from, to, cb) {
    db.all(
      `SELECT * FROM habits
       WHERE ${scope(userId)} AND archived_at IS NULL
         AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY COALESCE(NULLIF(start_time, ''), '99:99'), id`,
      sp(userId, [to, from]),
      (err, rows) => cb(err || null, rows || [])
    );
  }

  function insertHabit(userId, data, cb) {
    db.run(
      `INSERT INTO habits
         (user_id, title, rrule, dtstart, until_date, start_time, end_time,
          timezone, valid_from, valid_to, category, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
      sp(userId, [
        data.title, data.rrule, data.dtstart, data.until_date || null,
        data.start_time || '', data.end_time || null,
        data.timezone || 'Asia/Shanghai', data.valid_from,
        data.category || '其他',
      ]),
      function (err) {
        if (err) return cb(err, null);
        getHabit(userId, this.lastID, cb);
      }
    );
  }

  function createHabit(userId, data, cb) {
    if (!data || !String(data.title || '').trim()) return bad('title 不能为空', cb);
    if (!DATE_RE.test(data.dtstart || '')) return bad('dtstart 必须是 YYYY-MM-DD', cb);
    try { R.assertAllowed(data.rrule, 'habit'); }
    catch (e) { return bad(e.message, cb); }

    insertHabit(userId, {
      title: String(data.title).trim(),
      rrule: data.rrule,
      dtstart: data.dtstart,
      until_date: data.until_date || null,
      start_time: data.start_time || '',
      end_time: data.end_time || null,
      timezone: data.timezone || 'Asia/Shanghai',
      valid_from: data.valid_from || data.dtstart,
      category: data.category || '其他',
    }, cb);
  }

  // 结构性变更（rrule / dtstart / start_time）→ 封旧 + 新建；其余就地改
  function updateHabit(userId, id, patch, cb) {
    getHabit(userId, id, (err, old) => {
      if (err) return cb(err, null);
      if (!old) return cb(null, null);

      const structural = patch.rrule !== undefined
        || patch.dtstart !== undefined
        || patch.start_time !== undefined;

      if (!structural) {
        const allowed = ['title', 'category', 'until_date', 'end_time', 'valid_to'];
        const sets = [];
        const vals = [];
        allowed.forEach((k) => {
          if (patch[k] !== undefined) { sets.push(`${k} = ?`); vals.push(patch[k]); }
        });
        if (!sets.length) return getHabit(userId, id, cb);
        sets.push('updated_at = CURRENT_TIMESTAMP');
        db.run(`UPDATE habits SET ${sets.join(', ')} WHERE id = ?`,
          [...vals, id],
          (e) => e ? cb(e, null) : getHabit(userId, id, cb));
        return;
      }

      const rrule = patch.rrule !== undefined ? patch.rrule : old.rrule;
      try { R.assertAllowed(rrule, 'habit'); }
      catch (e) { return bad(e.message, cb); }

      const today = R.todayStr();
      const yesterday = R.addDays(today, -1);
      db.serialize(() => {
        db.run(
          `UPDATE habits SET valid_to = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [yesterday, today, id],
          (e) => { if (e) return cb(e, null); }
        );
        insertHabit(userId, {
          title: patch.title !== undefined ? patch.title : old.title,
          rrule,
          dtstart: patch.dtstart || today,
          until_date: patch.until_date !== undefined ? patch.until_date : old.until_date,
          start_time: patch.start_time !== undefined ? patch.start_time : old.start_time,
          end_time: patch.end_time !== undefined ? patch.end_time : old.end_time,
          timezone: old.timezone,
          valid_from: today,
          category: patch.category !== undefined ? patch.category : old.category,
        }, cb);
      });
    });
  }

  function archiveHabit(userId, id, cb) {
    db.run(
      `UPDATE habits SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE ${scope(userId)} AND id = ?`,
      sp(userId, [id]),
      function (e) { cb(e || null, { success: !e, changes: this.changes }); }
    );
  }

  // 窗口投影：habit 展开 × override 合并，永不写 events
  function getOccurrences(userId, from, to, cb) {
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
      return bad('from / to 必须是 YYYY-MM-DD', cb);
    }
    listHabits(userId, from, to, (err, habits) => {
      if (err) return cb(err, null);
      if (!habits.length) return cb(null, []);

      const ids = habits.map((h) => h.id);
      const ph = ids.map(() => '?').join(',');
      db.all(
        `SELECT * FROM habit_overrides
         WHERE habit_id IN (${ph}) AND date BETWEEN ? AND ?`,
        [...ids, from, to],
        (e2, overrides) => {
          if (e2) return cb(e2, null);
          const map = new Map();
          (overrides || []).forEach((o) => map.set(`${o.habit_id}|${o.date}`, o));

          const today = R.todayStr();
          const out = [];
          habits.forEach((h) => {
            let dates;
            try { dates = R.occurrences(h.rrule, h.dtstart, from, to, h.until_date); }
            catch (e) { return; }
            dates
              .filter((d) => d >= h.valid_from && (!h.valid_to || d <= h.valid_to))
              .forEach((date) => {
                const ov = map.get(`${h.id}|${date}`);
                let status = 'pending';
                let reason = null;
                let completedAt = null;
                if (ov) {
                  status = ov.status;
                  reason = ov.reason;
                  completedAt = ov.completed_at;
                } else if (date < today) {
                  status = 'skipped'; // 过去没打卡 = 断签，自动推断、不落库
                }
                out.push({
                  habit_id: h.id,
                  title: h.title,
                  date,
                  time: h.start_time || '',
                  end_time: h.end_time || '',
                  category: h.category,
                  rrule: h.rrule,
                  status,
                  reason,
                  completed_at: completedAt,
                  override_id: ov ? ov.id : null,
                });
              });
          });
          out.sort((a, b) => a.date.localeCompare(b.date)
            || (a.time || '').localeCompare(b.time || '')
            || a.habit_id - b.habit_id);
          cb(null, out);
        }
      );
    });
  }

  // UPSERT：UNIQUE(habit_id, date) 保证一天只有一条
  function setOverride(userId, habitId, date, payload, cb) {
    if (!DATE_RE.test(date || '')) return bad('date 必须是 YYYY-MM-DD', cb);
    const status = payload && payload.status;
    if (!STATUSES.includes(status)) {
      return bad('status 必须是 pending / done / skipped / excused', cb);
    }
    getHabit(userId, habitId, (err, habit) => {
      if (err) return cb(err, null);
      if (!habit) return cb(null, null);

      // reason 只在断签 / 请假时保留；completed_at 只在 done 时有值
      const reason = ['skipped', 'excused'].includes(status) ? (payload.reason || null) : null;
      const completedAt = status === 'done' ? 'CURRENT_TIMESTAMP' : 'NULL';

      db.run(
        `INSERT INTO habit_overrides
           (habit_id, date, status, reason, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ${completedAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(habit_id, date) DO UPDATE SET
           status = excluded.status,
           reason = excluded.reason,
           completed_at = excluded.completed_at,
           updated_at = CURRENT_TIMESTAMP`,
        [habitId, date, status, reason],
        (e) => {
          if (e) return cb(e, null);
          db.get('SELECT * FROM habit_overrides WHERE habit_id = ? AND date = ?',
            [habitId, date], (e2, row) => cb(e2 || null, row || null));
        }
      );
    });
  }

  function deleteOverride(userId, habitId, date, cb) {
    getHabit(userId, habitId, (err, habit) => {
      if (err) return cb(err, null);
      if (!habit) return cb(null, null);
      db.run('DELETE FROM habit_overrides WHERE habit_id = ? AND date = ?',
        [habitId, date],
        function (e) { cb(e || null, { success: !e, changes: this.changes }); });
    });
  }

  // 单习惯统计：effective = due - excused；rate = done / effective
  // streak：从今天往回，done +1、excused 暂停、skipped / pending 归零
  function getStats(userId, habitId, from, to, cb) {
    getOccurrences(userId, from, to, (err, all) => {
      if (err) return cb(err, null);
      const list = habitId ? all.filter((o) => o.habit_id === Number(habitId)) : all;
      const done = list.filter((o) => o.status === 'done').length;
      const skipped = list.filter((o) => o.status === 'skipped').length;
      const excused = list.filter((o) => o.status === 'excused').length;
      const effective = list.length - excused;
      const rate = effective > 0 ? Math.round((done / effective) * 1000) / 1000 : 0;

      let streak = 0;
      if (habitId) {
        const today = R.todayStr();
        const past = list.filter((o) => o.date <= today)
          .sort((a, b) => b.date.localeCompare(a.date));
        for (const o of past) {
          if (o.status === 'done') streak++;
          else if (o.status === 'excused') continue;
          else break;
        }
      }

      cb(null, {
        habit_id: habitId ? Number(habitId) : null,
        from, to,
        due: list.length,
        done, skipped, excused,
        effective,
        rate,
        streak,
      });
    });
  }

  return {
    getHabit, listHabits, createHabit, updateHabit, archiveHabit,
    getOccurrences, setOverride, deleteOverride, getStats,
    STATUSES,
  };
}

module.exports = createHabitModel;
