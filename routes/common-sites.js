const express = require('express');
const router = express.Router();
const { pool } = require('../config/common-sites-db');

// 与前端 urlKey 保持一致的 URL 规范化，作为书签去重的唯一标识
function canonicalUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = ''; // 忽略锚点
    return u.href;
  } catch (e) {
    return null;
  }
}

// 获取所有书签
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT client_id, name, url, category FROM bookmarks ORDER BY sort_order ASC, id ASC'
    );
    const bookmarks = rows.map(r => ({ id: r.client_id, name: r.name, url: r.url, category: r.category || '' }));
    res.json({ success: true, bookmarks });
  } catch (err) {
    console.error('常用网站获取失败:', err);
    res.status(500).json({ success: false, message: '获取失败' });
  }
});

// 全量同步：替换所有书签
router.post('/sync', async (req, res) => {
  const { bookmarks } = req.body;
  if (!Array.isArray(bookmarks)) {
    return res.status(400).json({ success: false, message: 'bookmarks 必须是数组' });
  }

  // 按规范化 URL 去重，保留首次出现的记录（保持客户端传入顺序）
  const seen = new Set();
  const unique = [];
  for (const b of bookmarks) {
    if (!b || !b.id || !b.name || !b.url) continue;
    const key = canonicalUrl(b.url) || String(b.url).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM bookmarks');
    for (let i = 0; i < unique.length; i++) {
      const b = unique[i];
      await conn.query(
        'INSERT INTO bookmarks (client_id, name, url, category, sort_order) VALUES (?, ?, ?, ?, ?)',
        [String(b.id), b.name, b.url, b.category || '', i]
      );
    }
    await conn.commit();
    res.json({ success: true, count: unique.length });
  } catch (err) {
    await conn.rollback();
    console.error('常用网站同步失败:', err);
    res.status(500).json({ success: false, message: '同步失败' });
  } finally {
    conn.release();
  }
});

// 单条保存（插入或更新）
router.post('/save', async (req, res) => {
  const { id, name, url, category } = req.body;
  if (!id || !name || !url) {
    return res.status(400).json({ success: false, message: '缺少 id / name / url' });
  }

  try {
    await pool.query(
      `INSERT INTO bookmarks (client_id, name, url, category) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), url = VALUES(url), category = VALUES(category)`,
      [String(id), name, url, category || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('常用网站保存失败:', err);
    res.status(500).json({ success: false, message: '保存失败' });
  }
});

// 获取所有分类
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT name FROM bookmark_categories ORDER BY sort_order ASC, id ASC'
    );
    res.json({ success: true, categories: rows.map(r => r.name) });
  } catch (err) {
    console.error('常用网站分类获取失败:', err);
    res.status(500).json({ success: false, message: '获取分类失败' });
  }
});

// 全量同步分类
router.post('/categories/sync', async (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) {
    return res.status(400).json({ success: false, message: 'categories 必须是数组' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM bookmark_categories');
    for (let i = 0; i < categories.length; i++) {
      const name = (categories[i] || '').trim();
      if (!name) continue;
      await conn.query(
        'INSERT INTO bookmark_categories (name, sort_order) VALUES (?, ?)',
        [name, i]
      );
    }
    await conn.commit();
    res.json({ success: true, count: categories.length });
  } catch (err) {
    await conn.rollback();
    console.error('常用网站分类同步失败:', err);
    res.status(500).json({ success: false, message: '分类同步失败' });
  } finally {
    conn.release();
  }
});

// 删除单条
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ success: false, message: '缺少 id' });

  try {
    await pool.query('DELETE FROM bookmarks WHERE client_id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('常用网站删除失败:', err);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

module.exports = router;
