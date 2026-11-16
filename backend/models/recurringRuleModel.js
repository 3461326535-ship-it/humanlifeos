'use strict';

// ══════════════════════════════════════════════════════════════
// Recurring Task 模型：规则 + 窗口物化 events 实例
//
//  · 与旧实现的根本区别：不再一次生成 90~1095 行，只按查询窗口懒补，
//    用 UNIQUE(rule_id, occurrence_date) + INSERT OR IGNORE 防重复。
//  · 新实例刻意不写 events.recurrence：旧 catchUp 看到非空会继续写重复行；
//    迁移后的历史实例保留非空仅供双读一周，之后清理。
//  · 改期只改 date，occurrence_date 不变（实例身份不变，见方案 §4.4）。
//  · 归档 = 软标记 archived_at，绝不物理删除（工时 / subtasks 外键考虑）。
//
// 导出工厂 createRecurringRuleModel(db)：路由注入真实 db，测试可注入 stub。
// ══════════════════════════════════════════════════════════════

const R = require('./rrule');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['todo', 'in_progress', 'review', 'done'];
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// 铺实例的窗口长度：日历要看得见未来排期，所以一次铺够；改/停规则时必须负责收走。
// daily 120 / weekly 180 / monthly·yearly 365 —— 与旧 generateForwardInstances 同一口径。
const HORIZON_DAYS = { DAILY: 120, WEEKLY: 180, MONTHLY: 365, YEARLY: 365 };

/** 两条 RRULE 是不是同一个节奏（段序不同不算改：FREQ=W;BYDAY=FR;INTERVAL=1 vs FREQ=W;INTERVAL=1;BYDAY=FR） */
function sameRRule(a, b) {
  try {
    const norm = (x) => {
      const p = R.parseRRule(String(x));
      return JSON.stringify({
        f: p.freq,
        i: p.interval,
        d: (p.byday || []).slice().sort(),
        m: (p.bymonthday || []).slice().sort((u, v) => u - v),
        s: p.bysetpos,
      });
    };
    return norm(a) === norm(b);
  } catch (e) {
    return String(a) === String(b);
  }
}

function horizonDays(rrule) {
  try { return HORIZON_DAYS[R.parseRRule(String(rrule || '')).freq] || 120; }
  catch (e) { return 120; }
}

/**
 * 前端只说人话（每周 + 周日），RRULE 在这里拼 —— 不让界面碰 RRULE 字符串。
 * 传了 rrule 就直接用（日历页等老调用方）。
 */
function rruleFromPatch(patch) {
  if (patch.rrule) return String(patch.rrule).toUpperCase();
  const FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[
    String(patch.recurrence || '').toLowerCase()
  ];
  if (!FREQ) return null;
  const interval = Math.min(365, Math.max(1, Number(patch.interval) || 1));
  let out = `FREQ=${FREQ};INTERVAL=${interval}`;

  if (FREQ === 'WEEKLY' && patch.weekday !== undefined && patch.weekday !== null && patch.weekday !== '') {
    const w = Number(patch.weekday);
    if (!Number.isInteger(w) || w < 0 || w > 6) throw new Error('weekday 必须是 0~6（周日=0）');
    out += `;BYDAY=${DAY_CODES[w]}`;
  }
  if (FREQ === 'MONTHLY' && patch.monthday !== undefined && patch.monthday !== null && patch.monthday !== '') {
    const m = Number(patch.monthday);
    if (!(m === -1 || (Number.isInteger(m) && m >= 1 && m <= 31))) {
      throw new Error('monthday 必须是 1~31，或 -1 表示月末');
    }
    out += `;BYMONTHDAY=${m}`;
  }
  return out;
}

function createRecurringRuleModel(db) {
  function scope(userId, alias) {
    const p = alias ? alias + '.' : '';
    return userId != null ? `${p}user_id = ?` : `${p}user_id IS NULL`;
  }
  function sp(userId, extra) {
    return userId != null ? [userId, ...extra] : extra;
  }
  function bad(msg, cb) { return process.nextTick(() => cb(new Error(msg), null)); }

  function getRule(userId, id, cb) {
    db.get(`SELECT * FROM recurring_rules WHERE ${scope(userId)} AND id = ?`,
      sp(userId, [id]), (err, row) => cb(err || null, row || null));
  }

  function listRules(userId, from, to, cb) {
    db.all(
      `SELECT * FROM recurring_rules
       WHERE ${scope(userId)} AND archived_at IS NULL
         AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY COALESCE(NULLIF(start_time, ''), '99:99'), id`,
      sp(userId, [to, from]),
      (err, rows) => cb(err || null, rows || [])
    );
  }

  function createRule(userId, data, cb) {
    if (!data || !String(data.title || '').trim()) return bad('title 不能为空', cb);
    if (!DATE_RE.test(data.dtstart || '')) return bad('dtstart 必须是 YYYY-MM-DD', cb);
    try { R.assertAllowed(data.rrule, 'recurring_task'); }
    catch (e) { return bad(e.message, cb); }
    if (data.default_status && !STATUSES.includes(data.default_status)) {
      return bad('default_status 非法', cb);
    }

    db.run(
      `INSERT INTO recurring_rules
         (user_id, title, rrule, dtstart, until_date, start_time, end_time,
          estimate_minutes, project_id, priority, default_status, category, timezone,
          valid_from, valid_to, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      sp(userId, [
        String(data.title).trim(), data.rrule, data.dtstart,
        data.until_date || null, data.start_time || '', data.end_time || null,
        data.estimate_minutes || null, data.project_id || null, data.priority || null,
        data.default_status || 'todo', data.category || '其他', data.timezone || 'Asia/Shanghai',
        data.valid_from || data.dtstart,
      ]),
      function (err) {
        if (err) return cb(err, null);
        getRule(userId, this.lastID, cb);
      }
    );
  }

  // 改规则：就地更新。已有实例的 occurrence_date / date 一律不动，
  // 新窗口按新规则懒补；「改这一次 vs 改规则」由前端弹层区分。
  function updateRule(userId, id, patch, cb) {
    getRule(userId, id, (err, old) => {
      if (err) return cb(err, null);
      if (!old) return cb(null, null);
      if (patch.rrule !== undefined) {
        try { R.assertAllowed(patch.rrule, 'recurring_task'); }
        catch (e) { return bad(e.message, cb); }
      }
      const allowed = ['title', 'rrule', 'start_time', 'end_time', 'estimate_minutes',
        'project_id', 'priority', 'default_status', 'category', 'until_date', 'valid_to'];
      const sets = [];
      const vals = [];
      allowed.forEach((k) => {
        if (patch[k] !== undefined) { sets.push(`${k} = ?`); vals.push(patch[k]); }
      });
      if (!sets.length) return getRule(userId, id, cb);
      sets.push('updated_at = CURRENT_TIMESTAMP');
      db.run(`UPDATE recurring_rules SET ${sets.join(', ')} WHERE id = ?`,
        [...vals, id],
        (e) => e ? cb(e, null) : getRule(userId, id, cb));
    });
  }

  // 归档规则 = 停止生成新实例（封 valid_to），已有实例全部保留
  function archiveRule(userId, id, cb) {
    const today = R.todayStr();
    db.run(
      `UPDATE recurring_rules
       SET valid_to = ?, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE ${scope(userId)} AND id = ?`,
      (userId != null ? [today, userId, id] : [today, id]),
      function (e) { cb(e || null, { success: !e, changes: this.changes }); }
    );
  }

  /**
   * 停掉整条周期：「明天起不再生成」，并把已经铺出去、还没做的未来实例一起收起来。
   *
   * 为什么不能只封规则：窗口懒补早把未来几个月的实例写进 events 了，
   * 只封规则的话，用户点完「停掉」发现日历上那一排还杵在那儿 —— 等于没停。
   * 归档（archived_at）而不是物理删除：工时 / 子任务外键还在，删了说不清，
   * 而且真要恢复，unarchive 还能捞回来。
   *
   * 今天及以前的实例一律保留：今天这一期可能正开在用户眼前，
   * 不能因为点了「停掉」就把手上的活抽走。
   */
  function stopRule(userId, id, cb) {
    getRule(userId, id, (err, rule) => {
      if (err) return cb(err, null);
      if (!rule) return cb(null, null);
      const today = R.todayStr();
      db.run(
        `UPDATE recurring_rules
         SET valid_to = ?, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [today, id],
        (e) => {
          if (e) return cb(e, null);
          db.run(
            `UPDATE events SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE ${scope(userId)} AND rule_id = ? AND archived_at IS NULL
               AND completed = 0 AND COALESCE(canceled_at, '') = ''
               AND date > ?`,
            sp(userId, [id, today]),
            function (e2) {
              if (e2) return cb(e2, null);
              cb(null, { success: true, rule_id: id, closed_instances: this.changes || 0 });
            }
          );
        }
      );
    });
  }

  /**
   * 改规则 = 「按新节奏重排明天之后」，不是「删了重来」。
   *
   * 为什么不能只 UPDATE 规则行：窗口懒补早把未来几个月写进 events 了，
   * 光改规则，日历上仍然是旧节奏那一排（周五照旧出现），新节奏一条也不生成。
   * 所以必须做三件事：收走不匹配的、捞回被归档但新节奏又要用的、按新规则补齐。
   *
   * 三条硬边界：
   *   · 今天及以前不动 —— 手上的活和已经过去的历史不能被一次改频率擦掉；
   *   · 已完成的永久保留 —— 统计口径靠它，改规则不该切断历史；
   *   · 归档而不是删除 —— 工时/子任务外键还在，且真改错了还能捞回来。
   *
   * 身份用 occurrence_date（不是 date）：用户把 11/20 那期挪到 11/21 之后，
   * 它仍然是「11/20 这一期」，改规则不该把它当成孤儿收走。
   */
  function planChange(userId, rule, patch, cb) {
    let newRrule;
    try {
      newRrule = rruleFromPatch(patch || {}) || rule.rrule;
      R.assertAllowed(newRrule, 'recurring_task');
    } catch (e) {
      return bad(e.message, cb);
    }

    const today = R.todayStr();
    const from = R.addDays(today, 1);
    const untilDate = patch && patch.until_date !== undefined
      ? (patch.until_date || null)
      : rule.until_date;

    const cols = 'id, date, occurrence_date';
    const base = `FROM events WHERE ${scope(userId)} AND rule_id = ?
      AND completed = 0 AND COALESCE(canceled_at, '') = '' AND date >= ?`;

    db.all(`SELECT ${cols} ${base} AND archived_at IS NULL`, sp(userId, [rule.id, from]), (e1, open) => {
      if (e1) return cb(e1, null);
      db.all(`SELECT ${cols} ${base} AND archived_at IS NOT NULL`, sp(userId, [rule.id, from]), (e2, archived) => {
        if (e2) return cb(e2, null);

        // 重排的范围必须盖住「已经铺出去的最远那一期」，不能只铺 horizon。
        // 老数据可能一直铺到一年后：只铺 180 天的话，horizon 之外的旧排期
        // 会全部被判成「不匹配」收走 —— 用户改一个字，日历就少掉半年。
        const maxOpen = (open || []).reduce((m, r) => (r.date > m ? r.date : m), '');
        const horizonEnd = R.addDays(today, horizonDays(newRrule));
        const to = maxOpen && maxOpen > horizonEnd ? maxOpen : horizonEnd;

        let dates;
        try {
          // dtstart 保持原值：它是 INTERVAL 的锚点（「每两周」从哪一周算起），
          // 换掉会让「每周五 → 每周日」这类改动把双周的相位也一起挪了。
          dates = R.occurrences(newRrule, rule.dtstart, from, to, untilDate)
            .filter((d) => d >= rule.valid_from);
        } catch (e) {
          return bad(e.message, cb);
        }
        const keep = new Set(dates);
        const key = (r) => r.occurrence_date || r.date;

        cb(null, {
          rule,
          newRrule,
          untilDate,
          from,
          to,
          dates,
          closeIds: (open || []).filter((r) => !keep.has(key(r))).map((r) => r.id),
          restoreIds: (archived || []).filter((r) => keep.has(key(r))).map((r) => r.id),
        });
      });
    });
  }

  // 只算不改：详情面板里要先说清「会收走几期、下一期是哪天」再让人按确认
  function previewChange(userId, id, patch, cb) {
    getRule(userId, id, (err, rule) => {
      if (err) return cb(err, null);
      if (!rule) return cb(null, null);
      planChange(userId, rule, patch, (e2, plan) => {
        if (e2) return cb(e2, null);
        cb(null, {
          rrule: plan.newRrule,
          next_dates: plan.dates.slice(0, 4),
          will_close: plan.closeIds.length,
          will_restore: plan.restoreIds.length,
          // 只比字符串的话，段序不同就会被当成「改了」—— 用户什么都没动却亮着红按钮
          cadence_changed:
            !sameRRule(plan.newRrule, rule.rrule) ||
            (plan.untilDate || null) !== (rule.until_date || null),
        });
      });
    });
  }

  function changeRule(userId, id, patch, cb) {
    getRule(userId, id, (err, rule) => {
      if (err) return cb(err, null);
      if (!rule) return cb(null, null);
      planChange(userId, rule, patch, (e2, plan) => {
        if (e2) return cb(e2, null);
        const inClause = (ids) => ids.map(() => '?').join(',');

        const finish = (created) => cb(null, {
          success: true,
          rule_id: id,
          rrule: plan.newRrule,
          closed_instances: plan.closeIds.length,
          restored_instances: plan.restoreIds.length,
          created_instances: created || 0,
          next_date: plan.dates[0] || null,
        });

        const closeThenRestore = () => {
          if (!plan.restoreIds.length) return ensureWindow(userId, plan.from, plan.to, (e, r) => finish(e ? 0 : r.inserted));
          db.run(
            `UPDATE events SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE ${scope(userId)} AND id IN (${inClause(plan.restoreIds)})`,
            sp(userId, plan.restoreIds),
            (e) => {
              if (e) return cb(e, null);
              ensureWindow(userId, plan.from, plan.to, (e3, r) => finish(e3 ? 0 : r.inserted));
            }
          );
        };

        const writeRule = () => {
          db.run(
            `UPDATE recurring_rules SET rrule = ?, until_date = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [plan.newRrule, plan.untilDate, id],
            (e) => {
              if (e) return cb(e, null);
              if (!plan.closeIds.length) return closeThenRestore();
              db.run(
                `UPDATE events SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE ${scope(userId)} AND id IN (${inClause(plan.closeIds)})`,
                sp(userId, plan.closeIds),
                (e2) => { if (e2) return cb(e2, null); closeThenRestore(); }
              );
            }
          );
        };

        // 先把规则行改成新节奏：ensureWindow 读的是库里的规则，不是内存里的
        writeRule();
      });
    });
  }

  // 新建周期任务时，把「已经建好的那一行」挂成规则的第一期。
  // 不挂的话，第一次窗口懒补会在同一天再插一条（UNIQUE(rule_id, occurrence_date) 拦不住
  // rule_id 还是 NULL 的原始行），用户会看到两条一模一样的任务。
  function attachInstance(userId, ruleId, eventId, occurrenceDate, cb) {
    const where = userId != null ? 'id = ? AND user_id = ?' : 'id = ? AND user_id IS NULL';
    const vals = userId != null
      ? [ruleId, occurrenceDate, eventId, userId]
      : [ruleId, occurrenceDate, eventId];
    db.run(
      `UPDATE events SET rule_id = ?, occurrence_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE ${where}`,
      vals,
      function (e) { cb(e || null, { success: !e, changes: this.changes }); }
    );
  }

  // ── 窗口懒补：只补 [from, to] 且规则有效期内的实例 ──
  function ensureWindow(userId, from, to, cb) {
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
      return bad('from / to 必须是 YYYY-MM-DD', cb);
    }
    listRules(userId, from, to, (err, rules) => {
      if (err) return cb(err, null);
      const pairs = [];
      rules.forEach((rule) => {
        let dates;
        try { dates = R.occurrences(rule.rrule, rule.dtstart, from, to, rule.until_date); }
        catch (e) { return; }
        dates
          .filter((d) => d >= rule.valid_from && (!rule.valid_to || d <= rule.valid_to))
          .forEach((date) => pairs.push({ rule, date }));
      });
      if (!pairs.length) return cb(null, { checked: 0, inserted: 0 });

      let i = 0;
      let inserted = 0;
      const sql = `INSERT OR IGNORE INTO events
        (user_id, title, date, time, category, description, status,
         start_time, end_time, project_id, priority,
         rule_id, occurrence_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      const next = () => {
        if (i >= pairs.length) return cb(null, { checked: pairs.length, inserted });
        const { rule, date } = pairs[i++];
        db.run(sql, sp(userId, [
          rule.title, date, rule.start_time || '', rule.category || '其他',
          rule.default_status || 'todo', rule.start_time || null, rule.end_time || null,
          rule.project_id || null, rule.priority || null,
          rule.id, date,
        ]), function (e) {
          if (e) return cb(e, null);
          inserted += this.changes || 0;
          next();
        });
      };
      next();
    });
  }

  function listInstances(userId, from, to, includeArchived, cb) {
    const archiveFilter = includeArchived ? '' : ' AND archived_at IS NULL';
    db.all(
      `SELECT * FROM events
       WHERE ${scope(userId)} AND rule_id IS NOT NULL
         AND date BETWEEN ? AND ?${archiveFilter}
       ORDER BY date, time, id`,
      sp(userId, [from, to]),
      (err, rows) => cb(err || null, rows || [])
    );
  }

  // 改期：只改 date / time，occurrence_date 保持原值（实例身份不变）
  function patchInstance(userId, id, payload, cb) {
    if (payload.date !== undefined && !DATE_RE.test(payload.date)) {
      return bad('date 必须是 YYYY-MM-DD', cb);
    }
    db.get(
      `SELECT id, date, occurrence_date, rule_id FROM events
       WHERE ${scope(userId)} AND id = ? AND rule_id IS NOT NULL`,
      sp(userId, [id]),
      (err, row) => {
        if (err) return cb(err, null);
        if (!row) return cb(null, null);
        const sets = [];
        const vals = [];
        if (payload.date !== undefined) { sets.push('date = ?'); vals.push(payload.date); }
        if (payload.time !== undefined) {
          sets.push('time = ?'); vals.push(payload.time);
          sets.push('start_time = ?'); vals.push(payload.time || null);
        }
        if (!sets.length) return cb(null, row);
        sets.push('updated_at = CURRENT_TIMESTAMP');
        db.run(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`,
          [...vals, id], (e) => {
            if (e) return cb(e, null);
            db.get('SELECT * FROM events WHERE id = ?', [id], (e2, full) => cb(e2 || null, full || null));
          });
      }
    );
  }

  // 软归档：只归档「已完成 + 完成时间早于 N 天」的周期实例；
  // 未完成逾期项必须留在看板上，一次性 Task 完全不动。
  function archiveOldInstances(userId, days, limit, cb) {
    const d = Number.isInteger(days) && days > 0 ? days : 90;
    const lim = Number.isInteger(limit) && limit > 0 ? limit : 500;
    db.run(
      `UPDATE events SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT e.id FROM events e
         WHERE ${scope(userId, 'e')} AND e.rule_id IS NOT NULL
           AND e.archived_at IS NULL AND e.status = 'done'
           AND e.completed_at IS NOT NULL
           AND e.completed_at < datetime('now', ?)
         ORDER BY e.completed_at LIMIT ?
       )`,
      sp(userId, [`-${d} days`, lim]),
      function (e) { cb(e || null, { success: !e, archived: this.changes || 0 }); }
    );
  }

  function unarchive(userId, id, cb) {
    db.run(
      `UPDATE events SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE ${scope(userId)} AND id = ? AND rule_id IS NOT NULL`,
      sp(userId, [id]),
      function (e) { cb(e || null, { success: !e, changes: this.changes || 0 }); }
    );
  }

  // 周期任务按时交付率：统计口径不加 archived 过滤（看长期表现）
  function getStats(userId, from, to, cb) {
    db.get(
      `SELECT COUNT(*) AS due,
              SUM(CASE WHEN e.status = 'done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN e.status = 'done' AND e.completed_at IS NOT NULL
                        AND substr(e.completed_at, 1, 10) <= e.date THEN 1 ELSE 0 END) AS on_time,
              SUM(CASE WHEN e.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
       FROM events e
       WHERE ${scope(userId, 'e')} AND e.rule_id IS NOT NULL
         AND e.date BETWEEN ? AND ?`,
      sp(userId, [from, to]),
      (err, row) => {
        if (err) return cb(err, null);
        const due = row ? row.due : 0;
        const onTime = row && row.on_time ? row.on_time : 0;
        cb(null, {
          from, to, due,
          done: row && row.done ? row.done : 0,
          on_time: onTime,
          archived: row && row.archived ? row.archived : 0,
          on_time_rate: due > 0 ? Math.round((onTime / due) * 1000) / 1000 : 0,
        });
      }
    );
  }

  return {
    getRule, listRules, createRule, updateRule, archiveRule,
    ensureWindow, listInstances, patchInstance, attachInstance,
    stopRule, changeRule, previewChange, horizonDays,
    archiveOldInstances, unarchive, getStats,
    STATUSES,
  };
}

module.exports = createRecurringRuleModel;
