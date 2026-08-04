const express = require('express');
const router = express.Router();
const { pool } = require('../config/yuexin-db');
const UID = 1;

// 获取所有记录
router.get('/records', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT start_date, end_date, flow, symptoms, note FROM yuexin_records WHERE user_id = ? ORDER BY start_date ASC',
      [UID]
    );
    const records = rows.map(r => ({
      start: r.start_date,
      end: r.end_date,
      flow: r.flow || 0,
      sym: (typeof r.symptoms === 'string' ? JSON.parse(r.symptoms) : r.symptoms) || [],
      note: r.note || ''
    }));
    res.json({ success: true, records });
  } catch (err) {
    console.error('月信获取记录失败:', err);
    res.status(500).json({ success: false, message: '获取记录失败' });
  }
});

// 全量同步：替换用户所有记录
router.post('/sync', async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) {
    return res.status(400).json({ success: false, message: 'records 必须是数组' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 删除旧数据
    await conn.query('DELETE FROM yuexin_records WHERE user_id = ?', [UID]);
    // 批量插入
    for (const r of records) {
      await conn.query(
        'INSERT INTO yuexin_records (user_id, start_date, end_date, flow, symptoms, note) VALUES (?, ?, ?, ?, ?, ?)',
        [UID, r.start, r.end || null, r.flow || 0, JSON.stringify(r.sym || []), r.note || '']
      );
    }
    await conn.commit();
    res.json({ success: true, count: records.length });
  } catch (err) {
    await conn.rollback();
    console.error('月信同步失败:', err);
    res.status(500).json({ success: false, message: '同步失败' });
  } finally {
    conn.release();
  }
});

// 单条更新/插入
router.post('/save', async (req, res) => {
  const { start, end, flow, sym, note } = req.body;
  if (!start) return res.status(400).json({ success: false, message: '缺少开始日期' });

  try {
    await pool.query(
      `INSERT INTO yuexin_records (user_id, start_date, end_date, flow, symptoms, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE end_date=VALUES(end_date), flow=VALUES(flow), symptoms=VALUES(symptoms), note=VALUES(note)`,
      [UID, start, end || null, flow || 0, JSON.stringify(sym || []), note || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('月信保存失败:', err);
    res.status(500).json({ success: false, message: '保存失败' });
  }
});

// 删除单条记录
router.delete('/record', async (req, res) => {
  const { start } = req.body;
  if (!start) return res.status(400).json({ success: false, message: '缺少开始日期' });

  try {
    await pool.query('DELETE FROM yuexin_records WHERE user_id = ? AND start_date = ?', [UID, start]);
    res.json({ success: true });
  } catch (err) {
    console.error('月信删除失败:', err);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

module.exports = router;
