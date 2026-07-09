const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { validate, RULES } = require('../middleware/validate');

// 获取所有便签（不包括已删除的）
router.get('/notes', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM notes WHERE is_deleted = 0 ORDER BY created_at DESC'
        );
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('获取便签失败:', error);
        res.status(500).json({
            success: false,
            message: '获取便签失败',
            error: error.message
        });
    }
});

// 创建新便签
router.post('/notes', validate({
  content: { rule: RULES.string, message: 'content 必须是字符串', optional: true },
  color: { rule: RULES.string, message: 'color 必须是字符串', optional: true },
  x: { rule: RULES.number, message: 'x 必须是数字', optional: true },
  y: { rule: RULES.number, message: 'y 必须是数字', optional: true },
  width: { rule: RULES.number, message: 'width 必须是数字', optional: true },
  height: { rule: RULES.number, message: 'height 必须是数字', optional: true },
  z_index: { rule: RULES.number, message: 'z_index 必须是数字', optional: true }
}), async (req, res) => {
    try {
        const { content = '', color = 'yellow', x = 50, y = 50, width = 230, height = 200, z_index = 1 } = req.body;
        
        const [result] = await pool.query(
            'INSERT INTO notes (content, color, x, y, width, height, z_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [content, color, x, y, width, height, z_index]
        );
        
        const [newNote] = await pool.query('SELECT * FROM notes WHERE id = ?', [result.insertId]);
        
        res.json({
            success: true,
            message: '便签创建成功',
            data: newNote[0]
        });
    } catch (error) {
        console.error('创建便签失败:', error);
        res.status(500).json({
            success: false,
            message: '创建便签失败',
            error: error.message
        });
    }
});

// 更新便签
router.put('/notes/:id', validate({
  content: { rule: RULES.string, message: 'content 必须是字符串', optional: true },
  color: { rule: RULES.string, message: 'color 必须是字符串', optional: true },
  x: { rule: RULES.number, message: 'x 必须是数字', optional: true },
  y: { rule: RULES.number, message: 'y 必须是数字', optional: true },
  width: { rule: RULES.number, message: 'width 必须是数字', optional: true },
  height: { rule: RULES.number, message: 'height 必须是数字', optional: true },
  z_index: { rule: RULES.number, message: 'z_index 必须是数字', optional: true }
}), async (req, res) => {
    try {
        const { id } = req.params;
        const { content, color, x, y, width, height, z_index } = req.body;
        
        // 构建更新字段
        const updates = [];
        const values = [];
        
        if (content !== undefined) {
            updates.push('content = ?');
            values.push(content);
        }
        if (color !== undefined) {
            updates.push('color = ?');
            values.push(color);
        }
        if (x !== undefined) {
            updates.push('x = ?');
            values.push(x);
        }
        if (y !== undefined) {
            updates.push('y = ?');
            values.push(y);
        }
        if (width !== undefined) {
            updates.push('width = ?');
            values.push(width);
        }
        if (height !== undefined) {
            updates.push('height = ?');
            values.push(height);
        }
        if (z_index !== undefined) {
            updates.push('z_index = ?');
            values.push(z_index);
        }
        
        if (updates.length === 0) {
            return res.json({
                success: true,
                message: '没有需要更新的字段'
            });
        }
        
        values.push(id);
        
        await pool.query(
            `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        const [updatedNote] = await pool.query('SELECT * FROM notes WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: '便签更新成功',
            data: updatedNote[0]
        });
    } catch (error) {
        console.error('更新便签失败:', error);
        res.status(500).json({
            success: false,
            message: '更新便签失败',
            error: error.message
        });
    }
});

// 删除便签（软删除，支持撤销）
router.delete('/notes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 软删除，记录删除时间
        await pool.query(
            'UPDATE notes SET is_deleted = 1, deleted_at = NOW() WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: '便签已删除'
        });
    } catch (error) {
        console.error('删除便签失败:', error);
        res.status(500).json({
            success: false,
            message: '删除便签失败',
            error: error.message
        });
    }
});

// 撤销删除
router.post('/notes/:id/undo', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query(
            'UPDATE notes SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
            [id]
        );
        
        const [restoredNote] = await pool.query('SELECT * FROM notes WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: '便签已恢复',
            data: restoredNote[0]
        });
    } catch (error) {
        console.error('撤销删除失败:', error);
        res.status(500).json({
            success: false,
            message: '撤销删除失败',
            error: error.message
        });
    }
});

// 获取最近删除的便签（用于撤销）
router.get('/notes/recent-deleted', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM notes WHERE is_deleted = 1 ORDER BY deleted_at DESC LIMIT 1'
        );
        
        res.json({
            success: true,
            data: rows[0] || null
        });
    } catch (error) {
        console.error('获取最近删除的便签失败:', error);
        res.status(500).json({
            success: false,
            message: '获取失败',
            error: error.message
        });
    }
});

// 批量更新便签位置和大小（用于拖拽和调整大小）
router.post('/notes/batch-update', validate({
  notes: { rule: RULES.array, message: 'notes 必须是数组', optional: false }
}), async (req, res) => {
    try {
        const { notes } = req.body;
        
        if (!Array.isArray(notes) || notes.length === 0) {
            return res.json({
                success: true,
                message: '没有需要更新的便签'
            });
        }
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            for (const note of notes) {
                const { id, x, y, width, height, z_index } = note;
                
                const updates = [];
                const values = [];
                
                if (x !== undefined) {
                    updates.push('x = ?');
                    values.push(x);
                }
                if (y !== undefined) {
                    updates.push('y = ?');
                    values.push(y);
                }
                if (width !== undefined) {
                    updates.push('width = ?');
                    values.push(width);
                }
                if (height !== undefined) {
                    updates.push('height = ?');
                    values.push(height);
                }
                if (z_index !== undefined) {
                    updates.push('z_index = ?');
                    values.push(z_index);
                }
                
                if (updates.length > 0) {
                    values.push(id);
                    await connection.query(
                        `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`,
                        values
                    );
                }
            }
            
            await connection.commit();
            res.json({
                success: true,
                message: '批量更新成功'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('批量更新失败:', error);
        res.status(500).json({
            success: false,
            message: '批量更新失败',
            error: error.message
        });
    }
});

module.exports = router;
