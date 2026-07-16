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

  // ===== 追补重复事件：确保重复任务链条到达今天 =====
  static catchUpRecurringEvents(userId, callback) {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

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

        // 3. 计算每个链条需要追补的日期
        const toCreate = [];
        Object.values(chainMap).forEach(latestEvent => {
          const endDate = latestEvent.recurrence_end_date || null;
          const stopDate = endDate && endDate < todayStr ? endDate : todayStr;

          let nextDate = computeNextRecurrenceDate(latestEvent.date, latestEvent.recurrence);

          while (nextDate <= stopDate) {
            // 避免重复：检查该链条该日期是否已有事件
            const alreadyExists = rows.some(r =>
              r.title === latestEvent.title &&
              r.date === nextDate &&
              r.recurrence === latestEvent.recurrence &&
              (r.user_id != null ? r.user_id : 'guest') === (latestEvent.user_id != null ? latestEvent.user_id : 'guest')
            );

            if (!alreadyExists) {
              toCreate.push({
                title: latestEvent.title,
                date: nextDate,
                time: latestEvent.time,
                category: latestEvent.category || '其他',
                description: latestEvent.description || '',
                reminder: latestEvent.reminder ? 1 : 0,
                recurrence: latestEvent.recurrence,
                recurrence_end_date: latestEvent.recurrence_end_date || null,
                // 子任务：需要从 latestEvent 加载，见下文
                _latestEventId: latestEvent.id,
              });
            }

            nextDate = computeNextRecurrenceDate(nextDate, latestEvent.recurrence);
          }
        });

        if (toCreate.length === 0) return callback(null);

        // 4. 批量加载最新事件的子任务
        const latestIds = [...new Set(toCreate.map(t => t._latestEventId))];
        const placeholders = latestIds.map(() => '?').join(',');

        db.all(
          `SELECT * FROM subtasks WHERE event_id IN (${placeholders})`,
          latestIds,
          (err2, allSubtasks) => {
            if (err2) return callback(err2);

            // 按 event_id 分组子任务
            const subtaskMap = {};
            allSubtasks.forEach(st => {
              if (!subtaskMap[st.event_id]) subtaskMap[st.event_id] = [];
              subtaskMap[st.event_id].push(st);
            });

            // 5. 创建追补事件（带上子任务）
            let created = 0;
            let hasError = false;

            toCreate.forEach(data => {
              const subtasks = (subtaskMap[data._latestEventId] || []).map(st => ({
                title: st.title,
                completed: false, // 新事件子任务重置为未完成
              }));

              EventModel.createEvent(userId, {
                title: data.title,
                date: data.date,
                time: data.time,
                category: data.category,
                description: data.description,
                reminder: data.reminder,
                recurrence: data.recurrence,
                recurrence_end_date: data.recurrence_end_date,
                subtasks: subtasks,
              }, (err3) => {
                if (hasError) return;
                if (err3) {
                  // SQLITE_CONSTRAINT(19)：并发安全 — 重复事件已由另一个请求创建，静默跳过
                  if (err3.errno === 19) {
                    // 不算错误，继续
                  } else {
                    hasError = true;
                    return callback(err3);
                  }
                }
                created++;
                if (created === toCreate.length) callback(null);
              });
            });
          }
        );
      }
    );
  }

  // ===== 完成重复事件后创建下一个事件（跳至今天之后）=====
  // 用于 PUT/PATCH 完成 + AI 批量完成等所有完成路径
  static fillRecurringChain(userId, completedEvent) {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    const endDate = completedEvent.recurrence_end_date || null;

    // 从完成日期 +1 间隔开始，跳到第一个超过今天的日期
    let nextDate = computeNextRecurrenceDate(completedEvent.date, completedEvent.recurrence);
    while (nextDate <= todayStr) {
      nextDate = computeNextRecurrenceDate(nextDate, completedEvent.recurrence);
    }

    if (!endDate || nextDate <= endDate) {
      EventModel.createEvent(userId, {
        title: completedEvent.title,
        date: nextDate,
        time: completedEvent.time,
        category: completedEvent.category || '其他',
        description: completedEvent.description || '',
        reminder: completedEvent.reminder ? 1 : 0,
        recurrence: completedEvent.recurrence,
        recurrence_end_date: completedEvent.recurrence_end_date || null,
        subtasks: (completedEvent.subtasks || []).map(st => ({ title: st.title, completed: false })),
      }, () => {});
    }
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
