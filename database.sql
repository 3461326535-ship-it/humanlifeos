-- 便签应用数据库初始化脚本
-- 创建数据库
CREATE DATABASE IF NOT EXISTS wallnotepad DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE wallnotepad;

-- 便签表
CREATE TABLE IF NOT EXISTS notes (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '便签ID',
    content TEXT COMMENT '便签内容',
    color VARCHAR(50) DEFAULT 'yellow' COMMENT '颜色主题',
    x DECIMAL(10, 2) DEFAULT 50 COMMENT 'X坐标',
    y DECIMAL(10, 2) DEFAULT 50 COMMENT 'Y坐标',
    width INT DEFAULT 230 COMMENT '宽度',
    height INT DEFAULT 200 COMMENT '高度',
    z_index INT DEFAULT 1 COMMENT '层级',
    is_deleted TINYINT(1) DEFAULT 0 COMMENT '是否已删除（软删除）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_at TIMESTAMP NULL COMMENT '删除时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='便签数据表';

-- 创建索引
CREATE INDEX idx_is_deleted ON notes(is_deleted);
CREATE INDEX idx_created_at ON notes(created_at);
CREATE INDEX idx_deleted_at ON notes(deleted_at);

-- 删除记录清理索引（用于定时清理已删除的便签）
CREATE EVENT IF NOT EXISTS clean_deleted_notes
ON SCHEDULE EVERY 1 DAY
DO DELETE FROM notes WHERE is_deleted = 1 AND deleted_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
