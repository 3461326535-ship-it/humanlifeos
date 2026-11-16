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
| **一次性任务** | 某个日期要做的一件事，可以有开始/结束日（跨天）与时段 | `events`（`rule_id IS NULL`） | 今天（跨天则逐日出现）、看板、甘特、日历、统计 |
| **周期任务** | 按规则重复，每一次都是可独立勾选的实例 | `recurring_rules` 存规则，实例仍写 `events`（带 `rule_id` + `occurrence_date`） | 今天、看板、日历、统计 |
| **习惯** | 按规则重复，但只有「做了 / 跳过 / 请假」四态，**不产生任务行** | `habits` 存规则 + `habit_overrides` 按日覆盖，**零物化**，查询时现算 | 只在日历（占用时段）与习惯卡 |

三条硬规则：

1. **习惯不物化。** 一个「每天吃药」如果物化成任务行，一年就是 365 条，五年后库里全是打卡垃圾。改成「规则 + 按日覆盖」，`GET /api/habits/occurrences?from&to` 在查询时展开，库里只留你真正动过的那几天。
2. **习惯只进日历，不进看板/甘特。** 看板问「这件事推进到哪一步」，甘特问「这段时间被什么占了、谁等谁」，打卡型的事没有进度也没有依赖，混进去只会把图糊住。日历里画成虚线块（无时长默认占 45 分钟），因为它表达的是「这个时段被占用了」。
3. **跨天任务只存一行，逐日出现靠算。** `date` → `end_date` 是一段工期，不要为了「每天都看见」把它复制成 N 行——那样勾掉一天，剩下 N-1 天还在催你。正确做法是存一条，视图按「今天落在不在区间里」现算，并报出「第 8/12 天」。
4. **周期任务的实例会物化，但要防重复。** `events(rule_id, occurrence_date)` 上有部分唯一索引；超前铺实例走 `POST /api/recurring-rules/ensure-window`；已完成超过 90 天的实例**软归档**（`archived_at`），不删行、不影响统计。
5. **实例要铺，但视图只露「下一次」。** 后端必须铺到 horizon（`generateForwardInstances`：daily 90 / weekly 180 / monthly 365 天），否则日历和甘特看不见未来。但「库里铺出来了」不等于「都该显示」—— 一条周报会同时挂 17 张卡，把真正该干的活全淹了。折叠在视图层做（`web/src/lib/recurring.ts`），别去改数据。Things 3 / Todoist 都是这个做法：只看到下一次，做完才露再下一次。**这条规则有两个必须认下来的后果**：① 凡是会改节律的动作（改规则 / 停规则）都得负责收走已经铺出去的实例，否则日历上还杵着旧节奏那一排；② 看板必须严格执行「一规则只露一期」，松一寸，老问题就会以「日历上有、看板也有」的形式回来。
6. **陈旧任务不自动删、不自动完成，只给一个处置台。** 几个月前的事可能做完了、可能不用做了 —— 程序没资格替你判断。所以要有一个 `回顾` 视图把「一直没决定」的捞出来，而你只能给四种结论：做完 / 改到今天 / 往后推 / 决定不做。「不做」是终态（`canceled_at`），离开待办但留在库里，统计里算「取消」不算「做完」，随时可恢复。
7. **周期实例的「完成 / 不做」只作用于这一期；停规则是另一个动作。** 规则和实例是两层：勾掉 11/6 那期只补记那一期，规则照旧往下走；「跳过这一期」也不会停掉规则。要停整条周期只有 `POST /api/recurring-rules/:id/stop`（明天起不再生成 + 把未来没做的实例一起归档），入口放在任务详情的「停掉整条周期」，**不放在行内按钮上** —— 一个按钮不能有两种含义，用户点下去之前就得知道它动的是哪一层。
8. **完成时间可补录，编辑不许刷新它。** `completed_at` 统一存 UTC（`YYYY-MM-DD HH:MM:SS`），读的时候前端按本地自然日还原。勾选默认记「现在」；长按勾选圈、或点已完成行的「完成于 …」，可以记到真正做完的那天 —— 一件 131 天前就该做的事，今天补勾一下，如果记成「今天完成」，本周完成数好看得不像话，往后回看也查不出来。写库时只在「真正从未完成变成完成」那一下盖章（`COALESCE(completed_at, now)`），否则每改一次标题都会把完成日刷成今天。
9. **改规则 = 按新节奏重排未来，不是删了重来。** 「周报改双周」「洗澡从周五改周日」是高频需求，停掉重建会把历史统计切断、留下一堆孤儿归档 —— 体验上等于删了重来。正确做法是 `POST /api/recurring-rules/:id/change`：改节奏 → 收走不匹配的**未来未完成**实例 → 捞回「以前归档过、新节奏又要用」的那些（`UNIQUE(rule_id, occurrence_date)` 会让 INSERT 被忽略，不捞回来就凭空缺一期）→ 按新规则补齐。**今天及以前不动、已完成永久保留、归档而非删除。** 界面入口是珊瑚色的「改规则…」，和「停掉整条周期」同级，**不放成把只读的重复选择器直接放开编辑** —— 一个控件不能有两种后果。
10. **同一个动作只有一套实现。** 动这一期（完成 / 跳过 / 改期）和动整条规则（改 / 停）全部收在 `web/src/lib/ruleActions.ts`，行内勾选、看板右键菜单、回顾页按钮都调它。入口可以多，逻辑不能漂 —— 否则迟早出现「行内点完成是补记这一期，右键点完成却把整条规则停了」。

---

## 3. 六个视图

### 今天 `/`（`?date=YYYY-MM-DD` 可看任意一天）

- 任务按**上午 / 下午 / 晚上 / 未排时间**分组（依据 `start_time`）
- **跨天任务**（`date` → `end_date`）每天都能看见，不用回头翻开始那天：起点那天落在当天分组里并标「至 11/20 · 共 12 天」；之后每天挂到顶部「进行中」并标「第 8/12 天」，直到被勾掉（勾掉那天进「已完成」，行内保留原区间）。过了 `end_date` 还没完成 → 标「止 11/20 · 超期 2 天」（珊瑚色），仍然每天出现
- **逾期区**：默认收起的一行（`逾期 19 · 点开处理／改期`），点开就是清单，行内可直接勾掉或双击改期；右栏概览里的红数字是同一个入口，点它展开并滚过去。「一个任务只出现在一个地方」：
  - 单日任务过了那天还没做 → 进逾期清单（行内标 `原定 11/9 · 超期 7 天`）
  - **跨天任务过了 `end_date` 不进逾期清单**，它仍然留在「进行中」并标红（`止 11/20 · 超期 2 天`），因为那还是手上正在做的活，塞进收起的面板里等于藏起来
  - 周期任务的往日实例不算逾期——下周还会有同一件事，不该攒成债
- 点任务行**展开子任务**，子任务可原地勾选；双击或点铅笔才进编辑——避免「想看点子任务，结果弹了个编辑框」
- **补记完成日期**：勾选圈单击 = 现在完成；**长按（或右键）勾选圈** = 先选「哪天做完的」再落章；已完成的行会显示 `完成于 今天 / 昨天 / 11/6（37 天前）`，点它可以改。选择的日期落在过去时，面板会直说「记在 N 天前，不算今天完成」
- **周期任务的行首会标 `↻ 每周一`**：这是它的身份，不是「今天有事」。勾掉只作用于这一期，规则照旧；要停整条周期去任务详情
- **任务详情里的两个珊瑚色动作**：「改规则…」和「停掉整条周期」，都明确标着「明天起生效、已完成的不受影响」。改规则面板里选频率（每天/每周/每月/每年）、周几或几号、间隔（每两周 / 每季度）、重复截止，下方实时报出「收走 N 期旧的未完成排期、下一期 11/22、接下来 11/22 · 11/29…」，节律没变时按钮是灰的
- 右栏：正在计时（`ActiveTimer`）、今日概览 2×2、习惯卡（点格子直接打卡）
- 顶部「新建」三项：单次任务、周期任务、习惯

### 看板 `/kanban`

- 四列：待开始 / 进行中 / 待审核 / 已完成。**列头计数是全量（含收起的），卡片只渲染该看的** —— 数字是信息，卡片是噪音
- 拖拽换列与列内排序，`position` 用 `REAL` 取相邻中值，避免整列重排
- 卡片显示标题、优先级牌、`类别 · 日期`、子任务进度条；跨天任务把日期换成工期进度（`工作 · 第 8/12 天`，过了终点标红）
- **三档窗口，只看到期的**：「今天」= 开工日不晚于今天（逾期的一直算数，那是欠账）；「本周」= 开工日不晚于周日；「积压」= 全部。**没有「全部」** —— 不设边界的看板必然被未来实例填满，那个视角留给日历/统计/搜索
- **三档收起，默认一行字、不渲染卡片**：
  - `未到期 N` —— 开工日还在未来，还没轮到看它
  - `陈年旧账 N` + `去回顾` —— 超期 14 天以上，罗列在这儿只是让人心慌
  - `更早完成 N` —— Done 列只露最近 5 条
- **周期任务一条规则只露一次**：`collapseRecurring` 把同规则的实例折成「下一次」（已完成的历史实例照常保留）。实测把待开始从 103 条压到 2 条 —— 原来那 101 条里，一大半是「带乖乖洗澡 1/20、2/20……6/20」这种还没到期的预生成占位
- **卡片上写清节律**（`↻ 每周五 · 工作 · 11/20`）：光一个 ↻ 看不出是每周还是每月，用户没法判断「跳过这一期」意味着什么。节律来自 `rule_rrule`（后端随行带出，实例行本身没有 `recurrence` 字段）
- **右键菜单**：一张卡就是「这条规则的下一期」，所以菜单分成两组 —— 上面动这一期（`完成这一期` / `跳过这一期`），下面动整条规则（`改规则…` / `停掉整条周期`，珊瑚色，带确认）。跳过不该走「拖进已完成」那条路：跳过不是完成

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

### 回顾 `/review`

陈旧任务的处置台，对应 OmniFocus 的 Review、Linear 的 Triage。**不自动删、不自动完成**，只把「一直没决定」的事捞到眼前，让人给结论。

- 三组：`陈年旧账`（一次性任务，过计划日 14 天以上）、`错过的周期任务`（同一条规则攒了几期，只列最近一次并报「连着 N 期没做」）、`搁置的在办`（挂在进行中/待审核但 30 天没动）
- 每条四个动作：**完成** / **今天**（挪到今天）/ **+7 天**（从**今天**起推一周 —— 在 7 月那个过期日上再加七天等于没推）/ **不做**
- **点「完成」不会立刻落章，先问「哪天做完了」**：快捷是今天 / 昨天 / 原定 X 月 X 日，也能自己选。默认不预设成今天 —— 这个页面上全是旧账，默认记今天是最容易骗自己的那一步
- 周期任务的一行有两个额外说法：**补记这期**（这次做完，规则继续）、**跳过这期**（这次不做，规则继续）；要停整条规则用 **停掉周期**（明天起不再生成，未来几期一起收走）
- 跨天任务改期时工期整体平移，不会把 `end_date` 留在原地
- **「不做」是终态，不是删除**：写 `events.canceled_at`，离开所有待办视图（看板/今天/日历都过滤），统计里算「取消」不算「做完」，底部「已决定不做」可随时恢复
- 这是 Google Tasks 的反面教材修正 —— 它把过期任务每天滚到今天，滚出一个越来越大的「愧疚堆」；这里只在你主动打开回顾时才出现

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
| `events` | 任务 / 周期实例 / 里程碑 | `date`、`end_date`、`start_time`、`end_time`、`status`(todo/in_progress/review/done)、`priority`、`project_id`、`position`(REAL)、`completed_at`、`sort_date`、`end_date`、`is_milestone`、`rule_id`、`occurrence_date`、`archived_at`、`canceled_at`（「不做」终态）、`user_id` |
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
| GET/POST | `/events` | 列表 / 新建（可带子任务、结束日、里程碑；带 `recurrence` 时顺带建规则并把这一行挂成第一期） |
| GET/PUT/DELETE | `/events/:id` | 详情 / 更新 / 删除（`?chain=true` 删整条重复链）。`PUT` 可带 `completed_at`（ISO 或 `YYYY-MM-DD`）补录完成日 |
| PATCH | `/events/:id/toggle` | 完成状态切换 |
| PATCH | `/events/:id/status` | 看板改状态（带 `position`）；重复置 done 不会刷新 `completed_at` |
| PATCH | `/events/:id/cancel` | 「不做」/ 恢复（周期实例上就是「跳过这一期」） |
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
| GET/POST/PUT/DELETE | `/recurring-rules` | 规则 CRUD（`DELETE` = 只封规则，不动已有实例） |
| GET | `/recurring-rules/:id` | 单条规则（详情面板预填当前节律） |
| POST | `/recurring-rules/:id/preview` | **改规则前先看影响**：只算不写，返回 `next_dates` / `will_close` / `cadence_changed` |
| POST | `/recurring-rules/:id/change` | **改规则**：改节奏 + 收走不匹配的未来未完成实例 + 捞回被归档但新节奏要用的 + 按新规则补齐（今天及以前、已完成不动） |
| POST | `/recurring-rules/:id/stop` | **停掉整条周期**：封 `valid_to` + 归档明天起没做的实例（今天及以前保留） |
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
9. **完成时间会被「顺手编辑」冲掉。** `updateEvent` 原来只要请求里带 `status`/`completed`（编辑弹窗每次回传整份表单，一定带）就重写 `completed_at = now`，于是改个标题、换个分类，完成日就变成今天。现在改成 `COALESCE(completed_at, now)`：只有真的从「未完成」变成「完成」才盖章。`updateStatus`（看板拖拽）同理 —— 在完成列里拖一下顺序不该改完成日期。
10. **v0.4 之后「新建周期任务」必须真的建规则。** 旧物化写入被闸门停掉以后，`POST /events` 带 `recurrence` 只写了一行、没有规则，UI 上「每周」变成了一个永不重复的字段。现在建完任务会顺带 `createRule` + `attachInstance`（把这一行挂成第一期，否则窗口懒补会在同一天再插一条）+ `ensureWindow(今天, +horizon)`。
11. **改规则的重排范围要盖住「已经铺到的最远那一期」，不是 horizon。** 老数据能一直铺到一年后（周报 52 期）。只按 horizon（180 天）重排的话，horizon 之外的旧排期会全部被判成「不匹配」收走 —— 用户只是把周五改成周日，日历却少了半年。所以 `planChange` 先取 `MAX(date)`，`to = max(horizonEnd, maxOpen)`。
12. **RRULE 不能按字符串比「改没改」。** 库里是 `FREQ=WEEKLY;BYDAY=FR;INTERVAL=1`，前端拼出来是 `FREQ=WEEKLY;INTERVAL=1;BYDAY=FR` —— 段序不同，字符串比较会把「什么都没动」判成「改了」，红按钮亮着、点一下就把 52 期全归档重排。`sameRRule()` 解析后逐字段比（`BYDAY`/`BYMONTHDAY` 排序后比）。
13. **改规则要「捞回」被归档的实例。** `UNIQUE(rule_id, occurrence_date)` 是部分唯一索引，归档行仍占着坑：周五 → 周日 → 又改回周五时，那 52 个周五还躺在 `archived_at` 里，`INSERT OR IGNORE` 会全部忽略，日历上凭空缺一年。所以先按 `occurrence_date` 把这些行 `archived_at = NULL` 捞回来，再补窗口。

---

## 13. 已知限制

- `/app` 还没挂进侧栏导航，只能直接访问；旧版 `/todo.html` 仍在侧栏，两者读写同一套 API
- 甘特暂无多人协作/负责人泳道（本版不做）；里程碑允许不连依赖，会造出「不跟着工作顺延」的假日期
- 周期实例仍按 horizon 铺满（新建的规则铺「今天 → +horizon」，更早的月度规则铺到一年外），只是视图折叠了。若哪天要减库体积，可以只物化最近 1–2 期、完成后再生成下一期；现在选择的是「数据留全、视图收敛」，因为日历/甘特要靠它看未来
- 节律要改去任务详情的「改规则…」（`POST /recurring-rules/:id/change`）：改的是整条规则、只影响明天之后，历史实例不动。实例上的重复选择器仍然只读 —— 「改这一次」和「改规则」必须在界面上是两件事
- 描述、子任务不会跟着规则复制到未来实例（规则表只存标题/时段/分类/优先级/项目）；改规则也不改标题和分类
- 回顾页的「连着 N 期没做」只统计未完成的实例，不算你主动归档掉的
- 看板右键菜单里有「不做 / 跳过这一期」，但列头没有批量操作；拖拽仍是唯一的换状态方式
- 周期任务卡片的「还有 N 期没做」提示还没做（折叠掉的期数目前只在回顾页能看到）
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
