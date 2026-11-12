/**
 * MCP (Model Context Protocol) Server
 * 监听 4000 端口，直接操作 SQLite 数据库，绕过 HTTP 鉴权层。
 */

const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const path = require('path');

// ── 数据库 ──
const db = require('./models/db');

// ── 配置 ──
const MCP_PORT = process.env.MCP_PORT || 4000;
const API_KEY = process.env.MCP_API_KEY || '123456';

// ── 获取当前活跃用户的 ID（优先选任务数最多的用户）──
function getActiveUserId() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT user_id, COUNT(*) as cnt FROM events
       WHERE user_id IS NOT NULL
       GROUP BY user_id ORDER BY cnt DESC LIMIT 1`,
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.user_id : null);
      }
    );
  });
}

// ── 读所有事件（不按 user 过滤）──
function getAllEvents() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM events ORDER BY date, time`, (err, rows) => {
      if (err) return reject(err);
      if (!rows.length) return resolve([]);

      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.all(
        `SELECT * FROM subtasks WHERE event_id IN (${placeholders})`,
        ids,
        (err2, allSubtasks) => {
          if (err2) return reject(err2);
          const subMap = {};
          allSubtasks.forEach(st => {
            if (!subMap[st.event_id]) subMap[st.event_id] = [];
            subMap[st.event_id].push({ ...st, completed: !!st.completed });
          });
          resolve(rows.map(r => ({
            ...r,
            completed: !!r.completed,
            reminder: !!r.reminder,
            subtasks: subMap[r.id] || [],
          })));
        }
      );
    });
  });
}

// ── 读单个事件 ──
function getEventById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM events WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      db.all(`SELECT * FROM subtasks WHERE event_id = ?`, [id], (err2, subtasks) => {
        if (err2) return reject(err2);
        resolve({
          ...row,
          completed: !!row.completed,
          reminder: !!row.reminder,
          subtasks: subtasks.map(st => ({ ...st, completed: !!st.completed })),
        });
      });
    });
  });
}

// ── 创建事件 ──
function createEvent(userId, data) {
  return new Promise((resolve, reject) => {
    const { title, date, time = '09:00', category = '其他', description = '', recurrence = null } = data;
    db.run(
      `INSERT INTO events (title, date, time, category, description, recurrence, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [title, date, time, category, description, recurrence, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  }).then(id => getEventById(id));
}

// ── 更新事件 ──
function updateEvent(id, data) {
  return new Promise((resolve, reject) => {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        sets.push(`${k} = ?`);
        params.push(v);
      }
    }
    if (!sets.length) return reject(new Error('No fields to update'));
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    db.run(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  }).then(() => getEventById(id));
}

// ── 删除事件 ──
function deleteEvent(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM subtasks WHERE event_id = ?`, [id], () => {
      db.run(`DELETE FROM events WHERE id = ?`, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

// ── Express ──
const app = express();
app.use(express.json());

function authMiddleware(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const transports = new Map();

app.get('/mcp/sse', async (req, res) => {
  const userId = await getActiveUserId();
  const server = createMcpServer(userId);
  const transport = new SSEServerTransport('/mcp/message', res);
  transports.set(transport._sessionId, transport);
  res.on('close', () => transports.delete(transport._sessionId));
  await server.connect(transport);
});

app.post('/mcp/message', authMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  const transport = transports.get(sessionId);
  if (!transport) return res.status(404).json({ error: 'Session not found' });
  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── 工具注册 ──
function createMcpServer(userId) {
  const server = new McpServer(
    { name: '小日志', version: '2.0.0' },
    { capabilities: { tools: {} } }
  );

  // 1. get_tasks
  server.tool(
    'get_tasks',
    '获取所有任务，可按状态筛选',
    {
      status: z.enum(['all', 'active', 'completed']).optional().default('all')
        .describe('all=全部, active=进行中, completed=已完成'),
    },
    async ({ status }) => {
      const events = await getAllEvents();
      let list = events;
      if (status === 'active') list = events.filter(t => !t.completed);
      if (status === 'completed') list = events.filter(t => t.completed);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: list.length,
            tasks: list.map(t => ({
              id: t.id, title: t.title, date: t.date, time: t.time,
              category: t.category, completed: !!t.completed,
              description: t.description || '', recurrence: t.recurrence || null,
              subtasks: (t.subtasks || []).map(s => ({ title: s.title, completed: s.completed })),
            })),
          }, null, 2),
        }],
      };
    }
  );

  // 2. create_task
  server.tool(
    'create_task',
    '创建新任务',
    {
      title: z.string().describe('任务标题'),
      date: z.string().describe('日期 YYYY-MM-DD'),
      time: z.string().optional().default('09:00').describe('时间 HH:MM'),
      category: z.string().optional().default('其他').describe('分类'),
      description: z.string().optional().default('').describe('描述'),
      recurrence: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional().describe('重复类型'),
    },
    async (params) => {
      const task = await createEvent(userId, params);
      return {
        content: [{ type: 'text', text: `✅ 已创建:\n${JSON.stringify(task, null, 2)}` }],
      };
    }
  );

  // 3. update_task
  server.tool(
    'update_task',
    '更新任务',
    {
      id: z.number().describe('任务 ID'),
      title: z.string().optional().describe('新标题'),
      completed: z.boolean().optional().describe('是否完成'),
      date: z.string().optional().describe('新日期'),
      time: z.string().optional().describe('新时间'),
      description: z.string().optional().describe('新描述'),
    },
    async ({ id, title, completed, date, time, description }) => {
      const updates = {};
      if (title !== undefined) updates.title = title;
      if (completed !== undefined) updates.completed = completed ? 1 : 0;
      if (date !== undefined) updates.date = date;
      if (time !== undefined) updates.time = time;
      if (description !== undefined) updates.description = description;
      const task = await updateEvent(id, updates);
      return {
        content: [{ type: 'text', text: `✅ 已更新:\n${JSON.stringify(task, null, 2)}` }],
      };
    }
  );

  // 4. delete_task
  server.tool(
    'delete_task',
    '删除任务',
    {
      id: z.number().describe('任务 ID'),
      delete_chain: z.boolean().optional().default(false).describe('是否删除整个重复系列'),
    },
    async ({ id }) => {
      await deleteEvent(id);
      return {
        content: [{ type: 'text', text: `✅ 已删除 (ID: ${id})` }],
      };
    }
  );

  return server;
}

// ── 启动 ──
app.listen(MCP_PORT, () => {
  console.log(`[MCP] http://localhost:${MCP_PORT}`);
  console.log(`[MCP] SSE: GET /mcp/sse`);
  console.log(`[MCP] Msg: POST /mcp/message  (x-api-key: ${API_KEY})`);
});
