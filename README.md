# 墙面便签 - 云端存储版

一个基于 Node.js + MySQL 的云端便签应用，支持多端数据同步。

## 📋 目录结构

```
/www/wwwroot/todo/
├── config/
│   └── database.js          # 数据库配置
├── routes/
│   └── notes.js             # 便签API路由
├── logs/                     # 日志目录（自动创建）
├── index.html               # 前端页面
├── server.js                # 后端服务器
├── package.json             # Node.js依赖配置
├── ecosystem.config.json    # PM2配置
├── database.sql             # 数据库初始化脚本
├── .env                     # 环境变量配置（需自行创建）
├── .env.example             # 环境变量示例
└── README.md                # 本文档
```

## 🚀 快速部署（宝塔面板）

### 第一步：环境准备

1. **安装 Node.js**
   - 登录宝塔面板
   - 进入「软件商店」→ 搜索「Node.js版本管理器」
   - 点击「安装」，安装完成后点击「设置」
   - 在版本管理器中安装 Node.js 16.x 或 18.x

2. **安装 MySQL**
   - 软件商店 → 搜索「MySQL」→ 安装（如已安装可跳过）

3. **安装 PM2**
   - 软件商店 → 搜索「PM2管理器」→ 安装

### 第二步：创建数据库

1. 宝塔面板 → 数据库 → 添加数据库
   - 数据库名：`wallnotepad`
   - 用户名：`wallnotepad`
   - 密码：（自行设置，记住备用）

2. 导入数据表结构
   - 点击数据库后的「管理」→ phpMyAdmin
   - 选择 `wallnotepad` 数据库
   - 点击「SQL」标签
   - 复制 `database.sql` 文件内容，粘贴并执行

### 第三步：配置环境变量

创建 `.env` 文件（复制 `.env.example` 并修改）：

```bash
cd /www/wwwroot/todo
cp .env.example .env
```

编辑 `.env` 文件，填入正确的数据库信息：

```env
# 服务器配置
PORT=3000

# MySQL数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=wallnotepad
DB_PASSWORD=你的数据库密码
DB_NAME=wallnotepad

# 前端允许的域名（用于CORS）
ALLOWED_ORIGINS=http://你的域名,http://localhost
```

### 第四步：安装依赖

```bash
cd /www/wwwroot/todo
npm install
```

或使用国内镜像加速：

```bash
npm install --registry=https://registry.npmmirror.com
```

### 第五步：启动服务（PM2）

**方式一：通过宝塔面板**
1. 软件商店 → PM2管理器 → 设置
2. 点击「添加项目」
   - 项目名称：`wallnotepad`
   - 启动文件：`/www/wwwroot/todo/server.js`
   - 点击「提交」

**方式二：通过命令行**
```bash
cd /www/wwwroot/todo
pm2 start ecosystem.config.json
pm2 save
```

### 第六步：配置 Nginx 反向代理

宝塔面板 → 网站 → 添加站点
- 域名：你的域名
- 根目录：`/www/wwwroot/todo`

点击站点「设置」→「反向代理」→「添加反向代理」
- 代理名称：`wallnotepad`
- 目标URL：`http://127.0.0.1:3000`
- 发送域名：`$host`

**完整 Nginx 配置示例：**

```nginx
server {
    listen 80;
    server_name 你的域名;
    
    # 前端静态文件
    location / {
        root /www/wwwroot/todo;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    # API反向代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 第七步：验证部署

访问你的域名，应该能看到便签应用界面。

## 🔧 常用命令

```bash
# 查看PM2进程状态
pm2 status

# 查看日志
pm2 logs wallnotepad

# 重启服务
pm2 restart wallnotepad

# 停止服务
pm2 stop wallnotepad

# 删除服务
pm2 delete wallnotepad
```

## 📊 API 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes` | 获取所有便签 |
| POST | `/api/notes` | 创建新便签 |
| PUT | `/api/notes/:id` | 更新便签 |
| DELETE | `/api/notes/:id` | 删除便签（软删除） |
| POST | `/api/notes/:id/undo` | 撤销删除 |
| GET | `/api/notes/recent-deleted` | 获取最近删除的便签 |

## 🐛 常见问题

### 1. 数据库连接失败
- 检查 `.env` 文件中的数据库配置是否正确
- 确认 MySQL 服务是否启动
- 检查数据库用户权限

### 2. PM2 启动失败
- 查看错误日志：`pm2 logs wallnotepad --err`
- 确认 Node.js 版本 >= 14
- 确认已执行 `npm install`

### 3. 前端无法访问API
- 检查 Nginx 反向代理配置
- 确认后端服务正在运行：`pm2 status`
- 检查防火墙设置

### 4. 跨域问题
- 在 `.env` 文件中添加你的域名到 `ALLOWED_ORIGINS`
- 多个域名用逗号分隔

## 🔒 安全建议

1. **修改数据库密码**：使用强密码
2. **限制数据库访问**：仅允许本地连接
3. **启用 HTTPS**：在宝塔面板申请 SSL 证书
4. **定期备份**：设置数据库定时备份

## 📝 更新日志

### v1.0.0 (2024-01-xx)
- 初始版本
- 支持便签的增删改查
- 支持拖拽、调整大小
- 支持多种颜色主题
- 支持撤销删除
- 云端数据存储

## 📄 许可证

MIT License
