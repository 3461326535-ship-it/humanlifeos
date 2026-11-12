/**
 * 一次性迁移：合并 bookmarks 表中的重复记录
 * 规则：按规范化 URL 分组，每组保留最早 id 的记录，删除其余重复项；随后重排 sort_order。
 *
 * 用法: node scripts/dedupe-bookmarks.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/common-sites-db');

// 与 routes/common-sites.js、前端 urlKey 保持一致的规范化逻辑
function canonicalUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.href;
  } catch (e) {
    return null;
  }
}

(async () => {
  const [rows] = await pool.query(
    'SELECT id, client_id, name, url, category, sort_order FROM bookmarks ORDER BY sort_order ASC, id ASC'
  );

  // 备份
  const backupDir = path.join(__dirname, '../data/backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `bookmarks-backup-${ts}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
  console.log('✅ 已备份', rows.length, '条记录 →', backupPath);

  // 按规范化 URL 分组
  const groups = {};
  rows.forEach(r => {
    const key = canonicalUrl(r.url) || String(r.url).trim().toLowerCase();
    (groups[key] = groups[key] || []).push(r);
  });

  const survivors = [];
  const dupIds = [];
  const mergedLog = [];
  for (const key of Object.keys(groups)) {
    const list = groups[key].sort((a, b) => a.id - b.id);
    survivors.push(list[0]); // 保留最早 id
    list.slice(1).forEach(r => dupIds.push(r.id));
    if (list.length > 1) {
      mergedLog.push(`  ${list[0].name} (${key})：${list.length} 条 → 保留 id=${list[0].id}`);
    }
  }
  survivors.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  if (!dupIds.length) {
    console.log('✨ 未发现重复记录，无需合并。');
    process.exit(0);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM bookmarks WHERE id IN (?)', [dupIds]);
    for (let i = 0; i < survivors.length; i++) {
      await conn.query('UPDATE bookmarks SET sort_order = ? WHERE id = ?', [i, survivors[i].id]);
    }
    await conn.commit();

    console.log('\n📚 合并明细：');
    mergedLog.forEach(l => console.log(l));
    console.log(`\n✅ 去重完成：${rows.length} 条 → ${survivors.length} 条（删除 ${dupIds.length} 条重复）`);
  } catch (err) {
    await conn.rollback();
    console.error('❌ 迁移失败，已回滚:', err);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
})();
