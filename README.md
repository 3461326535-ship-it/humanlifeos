# 人类生活实验日志 · HumanLifeOS

一个跑在自己服务器上的个人生活/工作操作系统。单进程 Express 服务 + 本地 SQLite 主库，前端一套 React 应用（`/app`）加若干独立原生页面。

主线是任务系统：**一次性任务、周期任务、习惯**三种时间语义分开建模，用今天 / 看板 / 甘特 / 日历 / 统计五个视图看同一批数据。所有时长都收敛到同一份「实际投入」口径，AI 助手只负责草拟，写操作必须人工确认。

- 生产入口：`/todo.html`（旧版）· `/app`（React 版，灰度中）
- 仓库：`git@github.com:3461326535-ship-it/humanlifeos.git`（分支 `main`）

---

## 1. 模块地图

| 入口 | 模块 | 说明 | 数据源 |
|---|---|---|---|
| `/home.html` | 总览 | 首页聚合（今日任务、入口宫格） | SQLite + 前端 |
| `/app` | **任务系统（React）** | 今天 / 看板 / 甘特 / 日历 / 统计 五视图，AI 助手、计时 | SQLite |
| `/todo.html` | 实验排期（旧版） | 上一代排期页，仍挂在侧栏 | SQLite |
| `/project-management/` | 项目进度管理 | 早期甘特 / 看板 / 日历三合一页 | SQLite |
| `/yuexin.html` | 月信 | 周期追踪记录 | MySQL（独立库） |
| `/finance.html` | 资产管理 | 收支预算 | 纯前端 `localStorage` |
| `/common-sites.html` | 快捷入口 | 常用网站书签 + 分类 | MySQL（独立库） |
| `/wallnotepad.html` | 灵感便签 | 多墙面便签，可拖拽、调大小、撤销删除 | MySQL（独立库） |
| `/globaltime.html` | 世界时钟 | 多时区对照 | 纯前端 |
| `/timekeeper.html` | 计时实验 | 计时器实验页 | 纯前端 |
| `/colorpro.html` | 色彩工坊 | 调色 / 配色 | 纯前端 |
| `/markdown-editor.html` | Markdown 编辑器 | 本地编辑预览 | 纯前端 |
| `/html_editor_preview.html` | 代码实验台 | HTML 实时预览 | 纯前端 |

侧栏 `nav.html` 是各页面共用的导航，由 `js/nav-loader.js` 注入；`/app` 通过它拿到同一套侧栏，模块自身不再画侧边栏。

---

## 2. 核心概念：三种时间

任务系统最容易烂掉的地方，是把「重复的事」和「有工期的事」塞进同一张表。这里刻意分成三类：

| 类型 | 语义 | 存储 | 出现在 |
|---|---|---|---|
| **一次性任务** | 某个日期要做的一件事，可以有开始/结束日与时段 | `events`（`rule_id IS NULL`） | 今天、看板、甘特、日历、统计 |
| **周期任务** | 按规则重复，每一次都是可独立勾选的实例 | `recurring_rules` 存规则，实例仍写 `events`（带 `rule_id` + `occurrence_date`） | 今天、看板、日历、统计 |
| **习惯** | 按规则重复，但只有「做了 / 跳过 / 请假」四态，**不产生任务行** | `habits` 存规则 + `habit_overrides` 按日覆盖，**零物化**，查询时现算 | 只在日历（占用时段）与习惯卡 |

三条硬规则：

1. **习惯不物化。** 一个「每天吃药」如果物化成任务行，一年就是 365 条，五年后库里全是打卡垃圾。改成「规则 + 按日覆盖」，`GET /api/habits/occurrences?from&to` 在查询时展开，库里只留你真正动过的那几天。
2. **习惯只进日历，不进看板/甘特。** 看板问「这件事推进到哪一步」，甘特问「这段时间被什么占了、谁等谁」，打卡型的事没有进度也没有依赖，混进去只会把图糊住。日历里画成虚线块（无时长默认占 45 分钟），因为它表达的是「这个时段被占用了」。
3. **周期任务的实例会物化，但要防重复。** `events(rule_id, occurrence_date)` 上有部分唯一索引；超前铺实例走 `POST /api/recurring-rules/ensure-window`；已完成超过 90 天的实例**软归档**（`archived_at`），不删行、不影响统计。

---

## 3. 五个视图

### 今天 `/`（`?date=YYYY-MM-DD` 可看任意一天）

- 任务按**上午 / 下午 / 晚上 / 未排时间**分组（依据 `start_time`）
- 点任务行**展开子任务**，子任务可原地勾选；双击或点铅笔才进编辑——避免「想看点子任务，结果弹了个编辑框」
- 右栏：正在计时（`ActiveTimer`）、今日概览 2×2、习惯卡（点格子直接打卡）
- 顶部「新建」三项：单次任务、周期任务、习惯

### 看板 `/kanban`

- 四列：待开始 / 进行中 / 待审核 / 已完成，列头带计数
- 拖拽换列与列内排序，`position` 用 `REAL` 取相邻中值，避免整列重排
- 卡片显示标题、优先级牌、`类别 · 日期`、子任务进度条

### 甘特 `/gantt`

不是「把任务画成条」，而是有依赖与级联的排程图。

- **完整状态**：`date` → `end_date` 是一段工期；条的颜色是状态，条内实体填充是子任务进度；逾期、今天线、周末底色、项目分组、浮动天数都在
- **依赖**：FS（完成→开始，默认）/ SS / FF / SF，支持滞后天数；画在条的边缘，走折线
- **级联**：拖 A 往后 3 天，所有下游按拓扑序自动顺延，工期不变；工具栏可关掉
- **自动排程**：按依赖把相关任务紧凑重排（会往前挪，不只往后推），执行前确认
- **关键路径**：服务端做 CPM（正向 ES/EF + 逆拓扑 LS/LF），`slack = 0` 且有依赖的才算，珊瑚色描边
- **里程碑**：菱形单点，只有「达成日」，不占工期；能作为依赖两端被顺延；建的时候即使填了结束日期也会被后端丢掉
- **三个手势**：拖中间平移、拖两端改工期、悬停条右侧出圆点→点它再点另一条=连依赖
- **周期实例默认不进甘特**（库里 160 条任务中有 105 条是铺出来的实例），工具栏有开关
- 环检测：A→B→A 由后端 409 拦下，不会把排程算死

### 日历 `/calendar`

- 周视图 08–20 时间网格 + 月视图切换；月视图只标 `↻n` 角标，不做点击打卡（太挤）
- 任务块与习惯虚线块**碰撞时左右分栏**，不会互相盖住
- **计划 / 实际双层**：计划层画 `start_time–end_time`；实际层画计时区间与已打卡习惯，看「计划 vs 实际」差在哪
- 习惯块可点击打卡（周视图）

### 统计 `/stats`

- 周期 7 / 30 / 90 天，四张卡：本周期完成、完成率、平均专注、连续完成
- 近 N 天完成细柱、本周期项目工时、状态分布、每日战报
- **口径统一**：状态分布 / 完成率 / 项目工时一律限定在所选周期内，不拿全量任务算（否则周期一换数字不动）

---

## 4. 计时与实际投入

- 任务行内一键计时，外加全局浮标；支持**暂停/继续**，继续后表盘连续不归零
- **允许多个任务同时计时**：同时干两件事是真实场景，切换任务不再打断旧计时
- **时长按时间轴去重**：实际投入 = 任务计时区间 ∪ 已打卡习惯时段，重叠部分只算一次。渲染时顺手写的周报，不会被算成两小时
- 唯一出处是 `GET /api/timeline/actual`，统计、每日战报、日历实际层共用同一份结果，不会各算各的

---

## 5. AI 助手

DeepSeek `deepseek-chat`，走 `/api/ai/*`。

```
用户输入
  → 意图分类（chat / task_single / task_batch / project / query）
  → 模式闸门（chat / task / mixed，决定 allow_execution）
  → 需要写操作：落 pending_actions，返回预览
  → 前端确认弹窗 → POST /api/ai/confirm 执行
```

- **写操作永远要确认**。`pending_actions` 落库（30 分钟过期），不靠内存，PM2 重启不会「操作已过期」
- **按用户隔离**：pending 动作记 `user_id`，确认时校验 `ownerUserId === uid(req)`。历史上这里写死过 `NULL`，导致真实账号确认必定失败
- 未配置 `DEEPSEEK_API_KEY` 时降级为纯聊天，不执行任何操作
- 聊天记录 `chat_history` 保留 7 天，每小时清理
- 另有 `backend/mcp-server.js`（MCP 服务，4000 端口），让 Claude Desktop 等外部客户端直接查任务，见 `backend/MCP_README.md`

---

## 6. 技术栈

**后端**：Node.js ≥ 16 · Express 4 · SQLite（`sqlite3`，主库）· MySQL（便签 / 月信 / 书签）· JWT（httpOnly cookie）· bcryptjs · helmet · express-rate-limit · PM2

**前端 `/app`**：React 18 · TypeScript · Vite 5 · Tailwind 3（自定义纸感色板）· TanStack Query 5（乐观更新）· dnd-kit · react-router 6

**其他**：移动端 Capacitor 工程在 `mobile/`（可打 APK）

---

## 7. 目录结构

```
/www/wwwroot/todo
├── app.js                     # Express 入口：中间件、路由挂载、/app 静态与 SPA fallback
├── auth.js                    # 登录/注册/改密
├── nav.html  js/nav-loader.js # 共用侧栏与注入脚本
├── ecosystem.config.json      # PM2：todo-app + mcp-server
├── backend/
│   ├── models/
│   │   ├── db.js              # SQLite 连接 + 建表 + 全部 ALTER 迁移（启动即跑，幂等）
│   │   ├── eventModel.js      # 任务 CRUD、子任务同步、周期链、软归档
│   │   ├── habitModel.js      # 习惯：规则 + 按日四态，零物化展开
│   │   ├── recurringRuleModel.js
│   │   ├── ganttModel.js      # CPM 关键路径、级联松弛、环检测、依赖增删
│   │   └── rrule.js           # 轻量 rrule 解析/展开/规范化
│   ├── routes/                # events / projects / habits / recurring-rules /
│   │                          # gantt / calendar / stats / reports / timers /
│   │                          # timeline / activities / ai
│   ├── services/
│   │   ├── actualLoad.js      # 实际投入：计时 ∪ 习惯，按时间轴去重
│   │   └── ai/                # 分类、模式闸门、分解、排程、执行
│   ├── mcp-server.js
│   └── migrations/
├── routes/                    # 走 MySQL 的独立模块：notes / yuexin / common-sites
├── middleware/                # validate / requireAuth / sanitizeError
├── config/                    # 各 MySQL 连接池
├── web/                       # React 前端（base = /app）
│   ├── index.html             # 注意：侧栏与 /app 适配补丁写在这里，见 §11
│   ├── src/pages|components|lib
│   └── dist/                  # vite 产物，由 app.js 以静态目录提供
├── mobile/                    # Capacitor 移动端
├── data/database.sqlite       # 主库（勿提交）
└── *.html                     # 其余独立页面
```

---

## 8. 数据模型（SQLite）

| 表 | 作用 | 关键列 |
|---|---|---|
| `events` | 任务 / 周期实例 / 里程碑 | `date`、`end_date`、`start_time`、`end_time`、`status`(todo/in_progress/review/done)、`priority`、`project_id`、`position`(REAL)、`completed_at`、`sort_date`、`end_date`、`is_milestone`、`rule_id`、`occurrence_date`、`archived_at`、`user_id` |
| `subtasks` | 子任务，级联删除 | `event_id`、`title`、`completed` |
| `projects` | 项目分组与颜色 | `name`、`color`、`status`、`start_date`、`end_date` |
| `task_dependencies` | 甘特依赖边 | `event_id`、`depends_on`、`type`(FS/SS/FF/SF)、`lag_days` |
| `habits` | 习惯规则 | `rrule`、`dtstart`、`until_date`、`start_time`/`end_time`、`timezone`、`valid_from`/`valid_to`、`archived_at` |
| `habit_overrides` | 习惯按日状态（UPSERT 目标） | `habit_id`、`date`、`status`(pending/done/skipped/excused)、`reason`；`UNIQUE(habit_id, date)` |
| `recurring_rules` | 周期任务规则 | `rrule`、`dtstart`、`until_date`、`start_time`/`end_time`、`estimate_minutes`、`project_id`、`priority` |
| `time_entries` | 计时区间 | `event_id`、`started_at`、`ended_at`、`duration_min`、`source` |
| `activities` | 动态流 | `event_id`、`project_id`、`type`、`content`、`meta` |
| `users` | 账号 | `username`、`password_hash`、`is_default_password` |
| `pending_actions` | AI 待确认写操作 | `confirm_id`(PK)、`type`、`data_json`、`user_id` |
| `chat_history` | AI 聊天记录（留 7 天） | `role`、`message`、`user_id` |

关系：`events` 1—N `subtasks` / `time_entries` / `activities`；`events` N—1 `projects`；`events` N—1 `recurring_rules`；`events` N—N `events`（经 `task_dependencies`）；`habits` 1—N `habit_overrides`。

**迁移策略**：所有建表与 `ALTER TABLE` 都写在 `db.js` 里，进程启动时按顺序跑一遍，重复执行会报 `duplicate column` 并被静默忽略——没有独立迁移文件，也没有版本号台账。加列只改这里。

**多用户与游客**：`optionalAuth` 让未登录请求也能用，此时 `user_id IS NULL` 即游客数据。查询一律走 `scopeWhere(userId)`，登录前后的数据是两套，不互相污染。

---

## 9. API

所有接口前缀 `/api`，除 `auth` 外均为 `optionalAuth`（未登录=游客数据）。

### 任务与项目
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/events` | 列表 / 新建（可带子任务、结束日、里程碑） |
| GET/PUT/DELETE | `/events/:id` | 详情 / 更新 / 删除（`?chain=true` 删整条重复链） |
| PATCH | `/events/:id/toggle` | 完成状态切换 |
| PATCH | `/events/:id/status` | 看板改状态（带 `position`） |
| POST | `/events/reorder` | 批量排序 |
| POST | `/events/:id/timer/start` `/stop` | 计时开始 / 结束 |
| GET | `/events/:id/time-entries` | 该任务的计时明细 |
| PATCH | `/events/:id/unarchive` | 归档实例恢复 |
| GET/POST/PUT/DELETE | `/projects` | 项目 CRUD |
| GET/POST | `/activities` | 动态流 |

### 习惯与周期任务
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/habits/occurrences?from&to` | 窗口内展开（零物化，四态） |
| GET/POST/PUT/DELETE | `/habits` | 规则 CRUD（删除=归档） |
| PUT/DELETE | `/habits/:id/overrides/:date` | 打卡 / 跳过 / 请假 / 撤销 |
| GET | `/habits/stats` | 习惯统计 |
| GET/POST/PUT/DELETE | `/recurring-rules` | 规则 CRUD |
| POST | `/recurring-rules/ensure-window` | 按窗口补齐实例 |
| POST | `/recurring-rules/archive-old` | 软归档 90 天前的已完成实例 |
| GET | `/recurring-rules/instances` | 实例列表 |

### 甘特
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/gantt?project_id&include_recurring` | 图数据（任务 + 依赖 + 关键路径 + 统计） |
| PATCH | `/gantt/tasks/:id` | 移动/拉伸/转里程碑，`cascade` 控制级联 |
| POST | `/gantt/auto-schedule` | 按依赖紧凑重排 |
| POST | `/gantt/dependencies` | 加依赖 |
| PATCH/DELETE | `/gantt/dependencies/:eventId/:dependsOn` | 改类型滞后 / 删除 |

### 日历 / 统计 / 计时
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/calendar?from&to` | 三分类统一投影（task / habit / recurring） |
| GET | `/stats/overview?range&fromDay&toDay&tz` | 概览（周期内口径） |
| GET | `/stats/v04` | 习惯维度统计 |
| GET | `/reports/daily?date&tz` | 每日战报 |
| GET | `/timeline/actual?from&to&tz` | 实际投入（去重后的唯一出处） |
| GET | `/timers/active` / `running` / `summary` | 计时状态 |

### AI 与账号
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/ai/chat` | 对话（限流 20 次/分） |
| POST | `/ai/confirm` / `cancel` | 确认 / 取消待执行动作 |
| GET/POST/DELETE | `/ai/history` | 聊天记录 |
| POST | `/auth/login` `register` `logout` | 账号 |
| GET | `/auth/status` | 当前登录态 |
| POST | `/auth/change-password` | 改密 |

### 独立模块（MySQL）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST/PUT/DELETE | `/notes` `/notes/:id` | 便签（删除为软删） |
| POST | `/notes/:id/undo` | 撤销删除 |
| GET | `/notes/recent-deleted` | 回收站 |
| GET/POST | `/yuexin/records` `/save` `/sync` | 月信 |
| GET/POST | `/common-sites` `/sync` `/save` `/categories` | 书签与分类 |

---

## 10. 本地开发

```bash
# 后端（依赖已装在 /www/wwwroot/todo/node_modules）
cp .env.example .env      # 填 DB / JWT_SECRET / DEEPSEEK_API_KEY
node app.js               # 或 npm run dev（nodemon）

# 前端（/app）
cd web
npm install
npm run dev               # vite dev server，需把 /api 代理到 3000
npm run build             # 产物进 web/dist，由 app.js 直接提供
```

`.env` 关键项：

```env
PORT=3000
JWT_SECRET=...                 # 必填，签 cookie 用
ADMIN_PASSWORD=admin123        # 首次启动建 admin
DEEPSEEK_API_KEY=...           # 不填则 AI 只聊天
ALLOWED_ORIGINS=http://localhost,http://127.0.0.1   # 必须含实际访问来源（含端口）
DB_HOST / DB_USER / DB_PASSWORD / DB_NAME           # 便签墙 MySQL
```

---

## 11. 部署

```bash
cd /www/wwwroot/todo
git pull
npm install                  # 后端依赖有变动时
(cd web && npm install && npm run build)
pm2 restart todo-app --update-env
pm2 list
```

Nginx：站点根目录指向 `/www/wwwroot/todo`，`/api` 与 `/app` 反代到 `http://127.0.0.1:3000`，其余静态文件直出。

```nginx
location /api { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
location /app { proxy_pass http://127.0.0.1:3000; }
location /     { root /www/wwwroot/todo; try_files $uri $uri/ /index.html; }
```

运维要点：

- **备份**：主库就一个文件 `data/database.sqlite`，改结构或跑批量脚本前先 `cp` 一份带日期的备份
- **日志**：`logs/out.log` / `logs/err.log`；`pm2 logs todo-app --lines 60 --nostream`
- **健康检查**：`GET /health`

---

## 12. 踩过的坑（改之前先看）

1. **`npm run build` 会覆盖 `web/dist/index.html`。** 侧栏注入、`#sidebar` 挂载点、`/app` 路径适配补丁都写在**源文件 `web/index.html`** 里（Vite 会把它当模板产出）。曾经手工改 `dist/index.html`，下次构建侧栏就消失了。要改壳子，改源文件。
2. **Playwright / 自动化必须用 `http://localhost:3000`。** 用 `127.0.0.1:3000` 会因 `ALLOWED_ORIGINS` 不含带端口的 127 而被 CORS 中间件拦成 500，表现是静态资源 500 + MIME 变成 json——看着像构建坏了，其实是跨域。JWT 可现签：`node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({userId:4,username:'Allie'},process.env.JWT_SECRET,{expiresIn:'1d'}))"`。
3. **弹窗层级。** 甘特表头用了 `z-30`/`z-40`，早期的编辑弹窗是 `z-20`，结果关闭按钮被表头盖住点不到。现在统一：编辑弹窗 `z-[70]` > 自动排程确认 `z-[56]` > 详情/习惯弹窗 `z-[55]` > AI 浮标 60。新增弹窗请对齐这套层级。
4. **习惯 rrule 要规范化后再比较。** 库里存 `FREQ=DAILY;INTERVAL=1`、表单提交 `FREQ=DAILY`，直接字符串比较会把「改个名字」误判成结构变更、顺手清空历史打卡。
5. **SQLite 单连接下并发 `BEGIN` 会互踩。** 甘特的写操作（`BEGIN IMMEDIATE`）用 Promise 链串行化，不要并发开事务。
6. **周期实例的唯一索引不容易建成。** `idx_events_chain_unique` 在存量脏数据下建不上，所以 v0.4 改成 `events(rule_id, occurrence_date)` 的部分唯一索引，并在迁移完成前停掉旧的物化写入（`v04Schema.isV04SchemaReady` 作为闸门）。
7. **服务端时区不可信。** 所有「按天」的统计窗口由前端按本地时区算好，以 `fromDay/toDay/fromTs/toTs/tz` 传进来，后端只用传进来的窗口。
8. **`node -e "require('./backend/models/xxx')"` 不会自己退出**（sqlite 连接挂着），ssh 会被 SIGTERM 且无输出。加 `process.exit(0)`。

---

## 13. 已知限制

- `/app` 还没挂进侧栏导航，只能直接访问；旧版 `/todo.html` 仍在侧栏，两者读写同一套 API
- 甘特暂无多人协作/负责人泳道（本版不做）；里程碑允许不连依赖，会造出「不跟着工作顺延」的假日期
- 子任务拖拽排序未做（需 `subtasks.position` 列）
- 统计页暂无按小时聚合的「专注时段热力图」（目前用状态分布占位）
- `events` 的 `time` 与 `start_time` 双字段并存：`time` 是旧端兼容字段，新代码一律读 `start_time`
- 财务页纯 `localStorage`，换设备不同步

---

## 附录 A：灵感便签（MySQL）独立部署

便签墙、月信、快捷入口走 MySQL，与主库 SQLite 无关；MySQL 挂了只影响这三个模块，服务会打一行警告继续跑。

```bash
# 1. 建库（宝塔 → 数据库 → 添加），库名 wallnotepad
# 2. 导入表结构
mysql -u wallnotepad -p wallnotepad < database.sql
# 3. .env 填 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
# 4. 重启
pm2 restart todo-app --update-env
```

接口：`GET/POST /api/notes`、`PUT/DELETE /api/notes/:id`、`POST /api/notes/:id/undo`、`GET /api/notes/recent-deleted`。删除是软删（`is_deleted`），撤销只恢复最近删除。

## 附录 B：移动端

`mobile/` 是 Capacitor 工程（`mobile/app` 为前端源码），可打 APK：

```bash
cd mobile
./build_apk.sh      # 或 build_cap.sh 走 Capacitor
```

产物在 `mobile/app/android/app/build/outputs/apk/debug/`。

---

MIT License
