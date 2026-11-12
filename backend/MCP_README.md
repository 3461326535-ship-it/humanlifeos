# 小日志 MCP 服务

为「小日志」后端添加的 MCP (Model Context Protocol) 服务，让 Claude Desktop 等 AI 客户端可以通过自然语言管理你的日程任务。

## 快速开始

```bash
cd /www/wwwroot/todo/backend

# 同时启动 Web 服务(3000) + MCP 服务(4000)
npm run start:all

# 或分开启动
npm start    # Web  → 3000
npm run mcp  # MCP  → 4000
```

## 端点

| 方法 | 路径 | 鉴权 |
|------|------|------|
| `GET` | `/mcp/sse` | 无 |
| `POST` | `/mcp/message?sessionId=xxx` | `x-api-key` 头 |

## 环境变量

在 `backend/.env` 中配置：

```env
PORT=3000          # Web 服务端口
MCP_PORT=4000      # MCP 服务端口
MCP_API_KEY=123456 # API 密钥（修改为你自己的）
```

## 可用工具

AI 可以通过这 4 个工具操作你的任务数据：

### 1. get_tasks — 查看任务

```
参数: status (可选) — all / active / completed
示例: "帮我看看今天有哪些任务"
      "列出所有未完成的任务"
```

### 2. create_task — 创建任务

```
参数: title (必填), date (必填), time, category, description, recurrence
示例: "帮我创建一个明天上午9点的会议任务"
```

### 3. update_task — 更新任务

```
参数: id (必填), title, completed, date, time, description
示例: "把 ID 为 42 的任务标记为完成"
```

### 4. delete_task — 删除任务

```
参数: id (必填), delete_chain (可选，删除周期性任务的后续)
示例: "删除 ID 为 10 的任务"
```

## 连接 Claude Desktop

1. 找到 Claude Desktop 配置文件：
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. 添加以下配置：

```json
{
  "mcpServers": {
    "小日志": {
      "url": "https://humanlifeos.art/mcp/sse",
      "headers": {
        "x-api-key": "123456"
      }
    }
  }
}
```

3. 重启 Claude Desktop，看到 🔌 图标即表示连接成功。

## 架构

```
┌─────────────────┐     SSE (4000)     ┌──────────────────┐
│  Claude Desktop  │ ◄──────────────► │  MCP Server       │
│  (AI 客户端)     │                   │  (mcp-server.js)  │
└─────────────────┘                   └────────┬─────────┘
                                               │ fetch()
                                               ▼
                                        ┌──────────────────┐
                                        │  Web Server       │
                                        │  (server.js:3000) │
                                        │  RESTful API      │
                                        └────────┬─────────┘
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │  SQLite           │
                                        └──────────────────┘
```

- MCP 服务与 Web 服务**独立运行**，互不干扰
- 工具内部通过 `localhost:3000` 调用现有 REST API
- 每次 SSE 连接创建独立的工具实例，会话隔离

## 安全

- `POST /mcp/message` 需要 `x-api-key` 头校验
- 默认密钥 `123456`，**生产环境请通过 `MCP_API_KEY` 环境变量修改**
- MCP 服务仅监听本地，不暴露到公网
