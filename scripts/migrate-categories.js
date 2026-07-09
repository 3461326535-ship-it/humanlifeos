/**
 * Database migration script:
 * 1. Add recurrence columns to events table
 * 2. Migrate category names: Sales→工作, Marketing→生活, Other→其他
 *
 * Usage: node scripts/migrate-categories.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration...');

db.serialize(() => {
  // Step 1: Add recurrence columns if they don't exist
  db.run(`ALTER TABLE events ADD COLUMN recurrence TEXT DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('  Add recurrence column failed:', err.message);
    } else if (err) {
      console.log('  recurrence column already exists (skip)');
    } else {
      console.log('  ✓ Added recurrence column');
    }
  });

  db.run(`ALTER TABLE events ADD COLUMN recurrence_end_date TEXT DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('  Add recurrence_end_date column failed:', err.message);
    } else if (err) {
      console.log('  recurrence_end_date column already exists (skip)');
    } else {
      console.log('  ✓ Added recurrence_end_date column');
    }
  });

  // Step 2: Migrate category names
  const categoryMap = {
    'Sales': '工作',
    'Marketing': '生活',
    'Other': '其他',
  };

  let migrated = 0;

  Object.entries(categoryMap).forEach(([oldName, newName]) => {
    db.run(`UPDATE events SET category = ? WHERE category = ?`, [newName, oldName], function (err) {
      if (err) {
        console.error(`  Migrate "${oldName}" → "${newName}" failed:`, err.message);
      } else if (this.changes > 0) {
        console.log(`  ✓ Migrated ${this.changes} tasks: "${oldName}" → "${newName}"`);
        migrated += this.changes;
      }
    });
  });

  // Summary
  db.all(`SELECT category, COUNT(*) as count FROM events GROUP BY category`, (err, rows) => {
    if (err) {
      console.error('  Summary query failed:', err.message);
    } else {
      console.log('\nCategory distribution after migration:');
      rows.forEach(row => {
        console.log(`  ${row.category}: ${row.count} tasks`);
      });
    }
    console.log(`\nMigration complete. Total category updates: ${migrated}`);
    db.close();
  });
});
