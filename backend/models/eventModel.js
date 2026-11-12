const db = require('./db');

class EventModel {
  // ===== 读取所有事件 =====
  static getAllEvents(userId, callback, options) {
    const where = userId != null ? 'WHERE user_id = ?' : 'WHERE user_id IS NULL';
    const params = userId != null ? [userId] : [];
    // v0.4：看板 / 日历默认隐藏软归档的周期实例（archived_at IS NULL）。
    // 只有新 schema 就绪后才会传 activeOnly，迁移前列不存在也不会拼进 SQL。
    const activeFilter = options && options.activeOnly ? ' AND archived_at IS NULL' : '';
    db.all(`SELECT * FROM events ${where}${activeFilter} ORDER BY date, time`, params, (err, rows) => {
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
    const {
      title, date, time = '', category = '其他', description = '', reminder = 0,
      subtasks = [], recurrence = null, recurrence_end_date = null,
      status, start_time, end_time, project_id, position, priority, sort_date,
      end_date = null
    } = eventData;
    let called = false; // 防重复调用

    // completed ↔ status 派生（单点，见 updateEvent 注释）
    const normStatus = normalizeStatus(status);
    const completed = (normStatus === 'done') ? 1 : 0;
    const completedAt = (normStatus === 'done') ? nowSqlite() : null;
    const startTimeVal = (start_time !== undefined && start_time !== null) ? start_time : (time || '');

    // 规范化子任务：过滤无效条目，确保每个子任务都有有效的 title
    const validSubtasks = subtasks
      .filter(st => st && typeof st === 'object' && typeof st.title === 'string' && st.title.trim())
      .map(st => ({ title: st.title.trim(), completed: !!st.completed }));

    db.run(
      `INSERT INTO events (title, date, time, category, description, reminder, recurrence, recurrence_end_date, user_id,
        status, start_time, end_time, project_id, position, completed_at, priority, sort_date, end_date,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [title, date, time, category, description, reminder ? 1 : 0, recurrence, recurrence_end_date,
        userId != null ? userId : null,
        normStatus, startTimeVal,
        end_time != null ? end_time : null,
        project_id != null ? project_id : null,
        position != null ? position : null,
        completedAt,
        priority != null ? priority : null,
        sort_date != null ? sort_date : null,
        // end_date 早于 date 视为脏数据，收敛为 NULL（= 单日）
        (end_date && end_date > date) ? end_date : null],
      function (err) {
        if (err) {
          if (!called) { called = true; callback(err, null); }
          return;
        }

        const eventId = this.lastID;
        EventModel._logActivity(userId, eventId, project_id != null ? project_id : null, 'create', title, null);

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

    // 【子任务保护】只有调用方真的传了 subtasks 数组，本次才允许重建子任务；
    // 否则一律保持原样。避免「只想改标题/状态却没带 subtasks」把子任务静默清空。
    const hasSubtasks = Array.isArray(eventData.subtasks);

    // 规范化子任务：过滤无效条目，确保每个子任务都有有效的 title
    const validSubtasks = subtasks
      .filter(st => st && typeof st === 'object' && typeof st.title === 'string' && st.title.trim())
      .map(st => ({ title: st.title.trim(), completed: !!st.completed }));

    // 子任务整体替换（DELETE + 逐条 INSERT）。未显式传 subtasks 时直接跳过，不碰库。
    const syncSubtasks = (done) => {
      if (!hasSubtasks) return done(null);
      db.run(`DELETE FROM subtasks WHERE event_id = ?`, [id], (err2) => {
        if (err2) return done(err2);
        if (validSubtasks.length === 0) return done(null);

        let inserted = 0;
        let failed = false;

        validSubtasks.forEach(subtask => {
          db.run(
            `INSERT INTO subtasks (event_id, title, completed) VALUES (?, ?, ?)`,
            [id, subtask.title, subtask.completed ? 1 : 0],
            (err3) => {
              if (failed) return;
              if (err3) {
                failed = true;
                return done(err3);
              }
              inserted++;
              if (inserted === validSubtasks.length) done(null);
            }
          );
        });
      });
    };

    // ===== completed ↔ status 单点双向派生（勿在路由层重复实现！）=====
    // 规则：
    //  - 只传 status  → 由 status 派生 completed
    //  - 只传 completed → 由 completed 派生 status
    //  - 两者都传且冲突（done 状态与 completed 布尔不一致）→ completed 优先
    //    （兼容旧端/ai.js 全量回传行快照：快照里的 status 是旧值，completed 才是用户意图）
    //  - status 变 done → completed_at = 当前时间；离开 done → completed_at = NULL
    let derivedCompletedAt; // undefined = 本次更新不涉及状态
    if ('status' in fields || 'completed' in fields) {
      let s;
      if ('status' in fields && 'completed' in fields) {
        const statusDone = (normalizeStatus(fields.status) === 'done');
        const completedTruthy = !!fields.completed;
        s = (statusDone !== completedTruthy)
          ? (completedTruthy ? 'done' : 'todo')   // 冲突：completed 优先
          : normalizeStatus(fields.status);       // 一致：以 status 为准（保留 in_progress/review）
      } else if ('status' in fields) {
        s = normalizeStatus(fields.status);
      } else {
        s = fields.completed ? 'done' : 'todo';
      }
      fields.status = s;
      fields.completed = (s === 'done') ? 1 : 0;
      derivedCompletedAt = (s === 'done') ? nowSqlite() : null;
    }

    // 动态构建 SET 子句：只更新实际传入的字段
    const allowedFields = ['title', 'date', 'time', 'category', 'description', 'completed', 'reminder',
      'recurrence', 'recurrence_end_date', 'status', 'start_time', 'end_time', 'project_id',
      'position', 'priority', 'sort_date', 'end_date'];
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
      // 没有任何要更新的字段：若调用方只改了子任务，仍要落库；否则直接返回当前事件
      if (!hasSubtasks) return EventModel.getEventById(userId, id, callback);
      return syncSubtasks((err) => {
        if (err) {
          if (!called) { called = true; callback(err, null); }
          return;
        }
        if (!called) { called = true; EventModel.getEventById(userId, id, callback); }
      });
    }

    // 派生出的 completed_at（仅当本次更新涉及状态字段）
    if (derivedCompletedAt !== undefined) {
      setClauses.push('completed_at = ?');
      values.push(derivedCompletedAt);
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

        // 动态流记录（fire-and-forget，不阻塞回调）
        if (fields.status !== undefined) {
          EventModel._logActivityForEvent(userId, id,
            fields.status === 'done' ? 'complete' : 'status_change',
            { status: fields.status });
        } else {
          EventModel._logActivityForEvent(userId, id, 'update',
            { fields: allowedFields.filter(f => f in fields) });
        }

        // 子任务同步：只有显式传了 subtasks 才重建
        syncSubtasks((err2) => {
          if (err2) {
            if (!called) { called = true; callback(err2, null); }
            return;
          }
          if (!called) { called = true; EventModel.getEventById(userId, id, callback); }
        });
      }
    );
  }

  // ===== 删除事件 =====
  static deleteEvent(userId, id, callback) {
    const where = userId != null ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ? AND user_id IS NULL';
    const params = userId != null ? [id, userId] : [id];
    // 先取行（记录动态流用），再删
    db.get(`SELECT title, project_id FROM events ${where}`, params, (fetchErr, row) => {
      if (fetchErr) return callback(fetchErr, null);
      db.run(`DELETE FROM events ${where}`, params, (err) => {
        if (err) return callback(err, null);
        // 甘特：连带清掉这条件上的依赖，避免留下指向已删任务的孤儿边
        db.run(`DELETE FROM task_dependencies WHERE event_id = ? OR depends_on = ?`, [id, id], () => {});
        if (row) EventModel._logActivity(userId, id, row.project_id, 'delete', row.title, null);
        callback(null, { success: true, id });
      });
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

        // 甘特：扫掉指向已删任务的孤儿依赖（一次全表，量级很小）
        db.run(
          `DELETE FROM task_dependencies
            WHERE event_id NOT IN (SELECT id FROM events)
               OR depends_on NOT IN (SELECT id FROM events)`,
          () => {}
        );

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

  // ══════════════════════════════════════════════════════════
  // v2 新增：看板 / 计时 / 动态流
  // ══════════════════════════════════════════════════════════

  // ===== 动态流：插入一条 activity（fire-and-forget，永不阻塞主流程）=====
  static _logActivity(userId, eventId, projectId, type, content, meta) {
    db.run(
      `INSERT INTO activities (user_id, event_id, project_id, type, content, meta) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId != null ? userId : null, eventId != null ? eventId : null,
        projectId != null ? projectId : null, type, content != null ? content : null,
        meta ? JSON.stringify(meta) : null],
      (err) => { if (err) console.error('[Activity] 记录失败:', err.message); }
    );
  }

  // ===== 动态流：按事件 ID 记录（自动带出 title/project_id）=====
  static _logActivityForEvent(userId, eventId, type, meta) {
    db.get(`SELECT title, project_id FROM events WHERE id = ?`, [eventId], (err, row) => {
      if (err || !row) return;
      EventModel._logActivity(userId, eventId, row.project_id, type, row.title, meta);
    });
  }

  // ===== 看板：更新状态（内部走同一套派生规则）=====
  static updateStatus(userId, id, status, position, callback) {
    const s = normalizeStatus(status);
    const completed = (s === 'done') ? 1 : 0;
    const completedAt = (s === 'done') ? nowSqlite() : null;
    const setClauses = ['status = ?', 'completed = ?', 'completed_at = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [s, completed, completedAt];
    const hasPosition = (position !== undefined && position !== null && Number.isFinite(Number(position)));
    if (hasPosition) {
      setClauses.push('position = ?');
      values.push(Number(position));
    }
    const where = userId != null ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ? AND user_id IS NULL';
    if (userId != null) values.push(userId);
    values.push(id);

    db.run(`UPDATE events SET ${setClauses.join(', ')} ${where}`, values, (err) => {
      if (err) return callback(err, null);
      EventModel._logActivityForEvent(userId, id, s === 'done' ? 'complete' : 'status_change', { status: s });

      const finish = () => EventModel.getEventById(userId, id, callback);

      if (!hasPosition) return finish();

      // ── LexoRank 精度自愈：midpoint 取中值法在两卡间反复拖拽约 50 次后会耗尽双精度，
      //    表现为同列出现重复 position。检测到重复 → 整列按现有顺序重排（1024 间隔）──
      const dupWhere = userId != null
        ? 'WHERE status = ? AND position = ? AND id != ? AND user_id = ?'
        : 'WHERE status = ? AND position = ? AND id != ? AND user_id IS NULL';
      const dupParams = userId != null ? [s, Number(position), id, userId] : [s, Number(position), id];
      db.get(`SELECT COUNT(*) AS n FROM events ${dupWhere}`, dupParams, (err2, row) => {
        if (!err2 && row && row.n > 0) {
          EventModel._rebalanceColumn(userId, s, finish);
        } else {
          finish();
        }
      });
    });
  }

  // ===== 看板：整列重排（按当前 position,id 顺序赋 1024 间隔，事务保证）=====
  static _rebalanceColumn(userId, status, callback) {
    const where = userId != null ? 'WHERE status = ? AND user_id = ?' : 'WHERE status = ? AND user_id IS NULL';
    const params = userId != null ? [status, userId] : [status];
    db.all(`SELECT id FROM events ${where} ORDER BY position, id`, params, (err, rows) => {
      if (err || !rows || rows.length === 0) return callback(null);
      console.log(`[Kanban] 列 ${status} position 精度耗尽，整列重排 ${rows.length} 张卡`);
      db.serialize(() => {
        db.run('BEGIN IMMEDIATE');
        let done = 0;
        rows.forEach((r, i) => {
          db.run(`UPDATE events SET position = ? WHERE id = ?`, [(i + 1) * 1024, r.id], (e2) => {
            if (e2) console.error('[Kanban] 重排失败:', e2.message);
            done++;
            if (done === rows.length) {
              db.run('COMMIT', (e3) => {
                if (e3) console.error('[Kanban] COMMIT 失败:', e3.message);
                callback(null);
              });
            }
          });
        });
      });
    });
  }

  // ===== 看板：批量排序 =====
  static reorder(userId, items, callback) {
    const valid = (items || []).filter(it => it && Number.isInteger(it.id) && typeof it.position === 'number');
    if (valid.length === 0) return callback(null, { success: true, updated: 0 });

    const where = userId != null ? 'AND user_id = ?' : 'AND user_id IS NULL';
    let done = 0, hasError = false;
    valid.forEach(item => {
      const params = userId != null ? [item.position, item.id, userId] : [item.position, item.id];
      db.run(`UPDATE events SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? ${where}`, params, (err) => {
        if (hasError) return;
        if (err) { hasError = true; return callback(err, null); }
        done++;
        if (done === valid.length) callback(null, { success: true, updated: done });
      });
    });
  }

  // ===== 计时：开始（同一任务同时只允许一个进行中的计时）=====
  static startTimer(userId, id, callback) {
    EventModel.getEventById(userId, id, (err, event) => {
      if (err) return callback(err, null);
      if (!event) return callback(null, null);

      db.get(`SELECT id FROM time_entries WHERE event_id = ? AND ended_at IS NULL`, [id], (err2, active) => {
        if (err2) return callback(err2, null);
        if (active) return callback({ code: 'TIMER_RUNNING', message: '该任务已有进行中的计时' }, null);

        const startedAt = nowSqlite();
        db.run(
          `INSERT INTO time_entries (event_id, user_id, started_at, source) VALUES (?, ?, ?, 'timer')`,
          [id, userId != null ? userId : null, startedAt],
          function (err3) {
            if (err3) return callback(err3, null);
            EventModel._logActivityForEvent(userId, id, 'timer', { action: 'start', entryId: this.lastID });
            callback(null, { id: this.lastID, event_id: id, started_at: startedAt, ended_at: null, source: 'timer' });
          }
        );
      });
    });
  }

  // ===== 计时：结束 =====
  static stopTimer(userId, id, callback) {
    EventModel.getEventById(userId, id, (err, event) => {
      if (err) return callback(err, null);
      if (!event) return callback(null, null);

      db.get(
        `SELECT * FROM time_entries WHERE event_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1`,
        [id], (err2, entry) => {
          if (err2) return callback(err2, null);
          if (!entry) return callback({ code: 'NO_TIMER', message: '该任务没有进行中的计时' }, null);

          const endedAt = nowSqlite();
          const durationMin = Math.max(1, Math.round(
            (new Date(endedAt.replace(' ', 'T') + 'Z') - new Date(entry.started_at.replace(' ', 'T') + 'Z')) / 60000
          ));
          db.run(`UPDATE time_entries SET ended_at = ?, duration_min = ? WHERE id = ?`, [endedAt, durationMin, entry.id], (err3) => {
            if (err3) return callback(err3, null);
            EventModel._logActivityForEvent(userId, id, 'timer', { action: 'stop', entryId: entry.id, duration_min: durationMin });
            callback(null, { ...entry, ended_at: endedAt, duration_min: durationMin });
          });
        }
      );
    });
  }

  // ===== 计时记录列表 =====
  static getTimeEntries(userId, id, callback) {
    EventModel.getEventById(userId, id, (err, event) => {
      if (err) return callback(err, null);
      if (!event) return callback(null, null);
      db.all(`SELECT * FROM time_entries WHERE event_id = ? ORDER BY started_at DESC`, [id], (err2, rows) => {
        if (err2) return callback(err2, null);
        callback(null, rows);
      });
    });
  }

  // ===== 计时：获取当前进行中的计时（顶栏实时计时器用）=====
  static getActiveTimer(userId, callback) {
    const where = userId != null ? 'WHERE te.user_id = ?' : 'WHERE te.user_id IS NULL';
    db.get(
      `SELECT te.id, te.event_id, te.started_at, e.title AS event_title, e.status AS event_status
       FROM time_entries te LEFT JOIN events e ON e.id = te.event_id
       ${where} AND te.ended_at IS NULL ORDER BY te.id DESC LIMIT 1`,
      userId != null ? [userId] : [],
      (err, row) => {
        if (err) return callback(err, null);
        callback(null, row || null);
      }
    );
  }
}

// ===== v2 工具函数 =====
// SQLite CURRENT_TIMESTAMP 格式（UTC，'YYYY-MM-DD HH:MM:SS'）
function nowSqlite() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// status 归一化（非法值一律回落 todo）
function normalizeStatus(raw) {
  const s = String(raw == null ? 'todo' : raw).toLowerCase();
  return ['todo', 'in_progress', 'review', 'done'].includes(s) ? s : 'todo';
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
