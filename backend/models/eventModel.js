const db = require('./db');

class EventModel {
  // ===== 读取所有事件 =====
  static getAllEvents(userId, callback) {
    const where = userId != null ? 'WHERE user_id = ?' : 'WHERE user_id IS NULL';
    const params = userId != null ? [userId] : [];
    db.all(`SELECT * FROM events ${where} ORDER BY date, time`, params, (err, rows) => {
      if (err) return callback(err, null);

      const events = rows.map(row => ({
        ...row,
        completed: !!row.completed,
        reminder: !!row.reminder
      }));

      EventModel._attachSubtasks(events, callback);
    });
  }

  // ===== 批量加载子任务（修复 N+1：一次 IN 查询替代逐个查询）=====
  static _attachSubtasks(events, callback) {
    if (events.length === 0) return callback(null, []);

    const ids = events.map(e => e.id);
    const placeholders = ids.map(() => '?').join(',');

    db.all(
      `SELECT * FROM subtasks WHERE event_id IN (${placeholders})`,
      ids,
      (err, allSubtasks) => {
        if (err) return callback(err, null);

        // 按 event_id 分组
        const subtaskMap = {};
        allSubtasks.forEach(st => {
          if (!subtaskMap[st.event_id]) subtaskMap[st.event_id] = [];
          subtaskMap[st.event_id].push({
            ...st,
            completed: !!st.completed
          });
        });

        // 保持原始 events 顺序
        const result = events.map(e => ({
          ...e,
          subtasks: subtaskMap[e.id] || []
        }));

        callback(null, result);
      }
    );
  }

  // ===== 按 ID 获取单个事件 =====
  static getEventById(userId, id, callback) {
    const where = userId != null ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ? AND user_id IS NULL';
    const params = userId != null ? [id, userId] : [id];
    db.get(`SELECT * FROM events ${where}`, params, (err, row) => {
      if (err) return callback(err, null);
      if (!row) return callback(null, null);

      const event = {
        ...row,
        completed: !!row.completed,
        reminder: !!row.reminder
      };

      db.all(`SELECT * FROM subtasks WHERE event_id = ?`, [id], (err2, subtasks) => {
        if (err2) return callback(err2, null);
        callback(null, {
          ...event,
          subtasks: subtasks.map(st => ({
            ...st,
            completed: !!st.completed
          }))
        });
      });
    });
  }

  // ===== 创建事件（防双重回调）=====
  static createEvent(userId, eventData, callback) {
    const { title, date, time, category = '其他', description = '', reminder = 0, subtasks = [], recurrence = null, recurrence_end_date = null } = eventData;
    let called = false; // 防重复调用

    // 规范化子任务：过滤无效条目，确保每个子任务都有有效的 title
    const validSubtasks = subtasks
      .filter(st => st && typeof st === 'object' && typeof st.title === 'string' && st.title.trim())
      .map(st => ({ title: st.title.trim(), completed: !!st.completed }));

    db.run(
      `INSERT INTO events (title, date, time, category, description, reminder, recurrence, recurrence_end_date, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [title, date, time, category, description, reminder ? 1 : 0, recurrence, recurrence_end_date, userId != null ? userId : null],
      function (err) {
        if (err) {
          if (!called) { called = true; callback(err, null); }
          return;
        }

        const eventId = this.lastID;

        if (validSubtasks.length === 0) {
          if (!called) { called = true; EventModel.getEventById(userId, eventId, callback); }
          return;
        }

        let inserted = 0;
        let hasError = false;

        validSubtasks.forEach(subtask => {
          db.run(
            `INSERT INTO subtasks (event_id, title, completed) VALUES (?, ?, ?)`,
            [eventId, subtask.title, subtask.completed ? 1 : 0],
            (err2) => {
              if (hasError) return; // 已出错，跳过
              if (err2) {
                hasError = true;
                if (!called) { called = true; callback(err2, null); }
                return;
              }
              inserted++;
              if (inserted === validSubtasks.length) {
                if (!called) { called = true; EventModel.getEventById(userId, eventId, callback); }
              }
            }
          );
        });
      }
    );
  }

  // ===== 更新事件（防双重回调）=====
  static updateEvent(userId, id, eventData, callback) {
    const { subtasks = [], ...fields } = eventData;
    let called = false;

    // 规范化子任务：过滤无效条目，确保每个子任务都有有效的 title
    const validSubtasks = subtasks
      .filter(st => st && typeof st === 'object' && typeof st.title === 'string' && st.title.trim())
      .map(st => ({ title: st.title.trim(), completed: !!st.completed }));

    // 动态构建 SET 子句：只更新实际传入的字段
    const allowedFields = ['title', 'date', 'time', 'category', 'description', 'completed', 'reminder', 'recurrence', 'recurrence_end_date'];
    const setClauses = [];
    const values = [];

    allowedFields.forEach(field => {
      if (field in fields) {
        setClauses.push(`${field} = ?`);
        // completed 和 reminder 需要转为 0/1
        values.push((field === 'completed' || field === 'reminder') ? (fields[field] ? 1 : 0) : fields[field]);
      }
    });

    if (setClauses.length === 0) {
      // 没有任何要更新的字段 — 直接返回当前事件
      return EventModel.getEventById(userId, id, callback);
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    // user_id 过滤
    const where = userId != null ? 'AND user_id = ?' : 'AND user_id IS NULL';
    if (userId != null) values.push(userId);

    db.run(
      `UPDATE events SET ${setClauses.join(', ')} WHERE id = ? ${where}`,
      values,
      (err) => {
        if (err) {
          if (!called) { called = true; callback(err, null); }
          return;
        }

        // 删除旧子任务
        db.run(`DELETE FROM subtasks WHERE event_id = ?`, [id], (err2) => {
          if (err2) {
            if (!called) { called = true; callback(err2, null); }
            return;
          }

          if (validSubtasks.length === 0) {
            if (!called) { called = true; EventModel.getEventById(userId, id, callback); }
            return;
          }

          let inserted = 0;
          let hasError = false;

          validSubtasks.forEach(subtask => {
            db.run(
              `INSERT INTO subtasks (event_id, title, completed) VALUES (?, ?, ?)`,
              [id, subtask.title, subtask.completed ? 1 : 0],
              (err3) => {
                if (hasError) return;
                if (err3) {
                  hasError = true;
                  if (!called) { called = true; callback(err3, null); }
                  return;
                }
                inserted++;
                if (inserted === validSubtasks.length) {
                  if (!called) { called = true; EventModel.getEventById(userId, id, callback); }
                }
              }
            );
          });
        });
      }
    );
  }

  // ===== 删除事件 =====
  static deleteEvent(userId, id, callback) {
    const where = userId != null ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ? AND user_id IS NULL';
    const params = userId != null ? [id, userId] : [id];
    db.run(`DELETE FROM events ${where}`, params, (err) => {
      if (err) return callback(err, null);
      callback(null, { success: true, id });
    });
  }

  // ===== 删除整个重复链条（从该事件日期起，所有同链事件）=====
  static deleteEventChain(userId, id, callback) {
    // 先获取该事件，确定链标识
    const where = userId != null ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ? AND user_id IS NULL';
    const params = userId != null ? [id, userId] : [id];
    db.get(`SELECT * FROM events ${where}`, params, (err, event) => {
      if (err) return callback(err);
      if (!event) return callback(null, { success: false, message: '事件不存在' });
      if (!event.recurrence) return callback(null, { success: false, message: '该事件不是周期性任务' });

      const chainWhere = userId != null
        ? `WHERE title = ? AND recurrence = ? AND date >= ? AND user_id = ?`
        : `WHERE title = ? AND recurrence = ? AND date >= ? AND user_id IS NULL`;
      const chainParams = userId != null
        ? [event.title, event.recurrence, event.date, userId]
        : [event.title, event.recurrence, event.date];

      // 1. 删除 >= 该日期的所有同链事件
      db.run(`DELETE FROM events ${chainWhere}`, chainParams, function (err2) {
        if (err2) return callback(err2);
        const deleted = this.changes;

        // 2. 将剩余同链事件（date < 该日期）全部"封口"——清掉 recurrence，防止 catchUp 再生
        const sealWhere = userId != null
          ? `WHERE title = ? AND recurrence = ? AND date < ? AND user_id = ?`
          : `WHERE title = ? AND recurrence = ? AND date < ? AND user_id IS NULL`;
        const sealParams = userId != null
          ? [event.title, event.recurrence, event.date, userId]
          : [event.title, event.recurrence, event.date];

        db.run(
          `UPDATE events SET recurrence = NULL, recurrence_end_date = NULL, updated_at = CURRENT_TIMESTAMP ${sealWhere}`,
          sealParams,
          (err3) => {
            if (err3) return callback(err3);
            callback(null, { success: true, deleted, fromDate: event.date });
          }
        );
      });
    });
  }

  // ===== 确保重复任务链条延伸到 horizon（每次 GET 时兜底）=====
  static catchUpRecurringEvents(userId, callback) {
    const where = userId != null
      ? "WHERE recurrence IS NOT NULL AND recurrence != '' AND user_id = ?"
      : "WHERE recurrence IS NOT NULL AND recurrence != '' AND user_id IS NULL";
    const params = userId != null ? [userId] : [];

    // 1. 找出所有重复事件，按日期降序排列
    db.all(
      `SELECT * FROM events ${where} ORDER BY date DESC`,
      params,
      (err, rows) => {
        if (err) return callback(err);
        if (rows.length === 0) return callback(null);

        // 2. 按 (title, recurrence, user) 分组，每组取最新日期的事件
        const chainMap = {};
        rows.forEach(e => {
          const key = `${e.title}|||${e.recurrence}|||${e.user_id != null ? e.user_id : 'guest'}`;
          if (!chainMap[key]) {
            chainMap[key] = e; // rows 已按 date DESC 排序，第一个就是最新的
          }
        });

        // 3. 加载每个 latestEvent 的子任务（generateForwardInstances 需要完整事件）
        const chains = Object.values(chainMap);
        const chainIds = chains.map(c => c.id);
        const placeholders = chainIds.map(() => '?').join(',');

        db.all(
          `SELECT * FROM subtasks WHERE event_id IN (${placeholders})`,
          chainIds,
          (err2, allSubtasks) => {
            if (err2) return callback(err2);

            // 按 event_id 分组子任务
            const subtaskMap = {};
            allSubtasks.forEach(st => {
              if (!subtaskMap[st.event_id]) subtaskMap[st.event_id] = [];
              subtaskMap[st.event_id].push({
                ...st,
                completed: !!st.completed
              });
            });

            // 4. 为每个链条调用 generateForwardInstances 延伸至 horizon
            let completed = 0;
            let hasError = false;

            if (chains.length === 0) return callback(null);

            chains.forEach(latestEvent => {
              const eventWithSubtasks = {
                ...latestEvent,
                subtasks: subtaskMap[latestEvent.id] || []
              };

              EventModel.generateForwardInstances(userId, eventWithSubtasks, (err3) => {
                if (hasError) return;
                if (err3) { hasError = true; return callback(err3); }
                completed++;
                if (completed === chains.length) callback(null);
              });
            });
          }
        );
      }
    );
  }

  // ===== 前置生成所有未来重复实例（创建时调用 + catchUp 兜底）=====
  static generateForwardInstances(userId, templateEvent, callback) {
    const HORIZON_DAYS = { daily: 90, weekly: 180, monthly: 365, yearly: 1095 };
    const offsetDays = HORIZON_DAYS[templateEvent.recurrence] || 90;

    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    // 计算 horizon 日期（today + offsetDays）
    const horizonDate = new Date(today);
    horizonDate.setDate(horizonDate.getDate() + offsetDays);
    const horizonStr = horizonDate.getFullYear() + '-' +
      String(horizonDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(horizonDate.getDate()).padStart(2, '0');

    // 以 recurrence_end_date 和 horizon 中更早的为准
    const endDate = templateEvent.recurrence_end_date || null;
    const stopDate = (endDate && endDate < horizonStr) ? endDate : horizonStr;

    // 收集所有需要创建的日期
    const dates = [];
    let nextDate = computeNextRecurrenceDate(templateEvent.date, templateEvent.recurrence);
    while (nextDate <= stopDate) {
      dates.push(nextDate);
      nextDate = computeNextRecurrenceDate(nextDate, templateEvent.recurrence);
    }

    if (dates.length === 0) return callback(null);

    // 子任务模板：重置 completed 为 false
    const subtaskTemplates = (templateEvent.subtasks || []).map(st => ({
      title: st.title,
      completed: false,
    }));

    let created = 0;
    let hasError = false;

    dates.forEach(date => {
      EventModel.createEvent(userId, {
        title: templateEvent.title,
        date: date,
        time: templateEvent.time,
        category: templateEvent.category || '其他',
        description: templateEvent.description || '',
        reminder: templateEvent.reminder ? 1 : 0,
        recurrence: templateEvent.recurrence,
        recurrence_end_date: templateEvent.recurrence_end_date || null,
        subtasks: subtaskTemplates,
      }, (err) => {
        if (hasError) return;
        if (err) {
          // SQLITE_CONSTRAINT(19)：唯一索引防重 — 实例已存在，静默跳过
          if (err.errno === 19) {
            // 不算错误，继续
          } else {
            hasError = true;
            return callback(err);
          }
        }
        created++;
        if (created === dates.length) callback(null);
      });
    });
  }

  // ===== 按日期获取事件 =====
  static getEventsByDate(userId, date, callback) {
    const where = userId != null ? 'WHERE date = ? AND user_id = ?' : 'WHERE date = ? AND user_id IS NULL';
    const params = userId != null ? [date, userId] : [date];
    db.all(`SELECT * FROM events ${where} ORDER BY time`, params, (err, rows) => {
      if (err) return callback(err, null);

      const events = rows.map(row => ({
        ...row,
        completed: !!row.completed,
        reminder: !!row.reminder
      }));

      EventModel._attachSubtasks(events, callback);
    });
  }
}

// 计算下一个重复日期
function computeNextRecurrenceDate(currentDate, recurrence) {
  const d = new Date(currentDate + 'T00:00:00');
  switch (recurrence) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: return currentDate;
  }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

module.exports = EventModel;
