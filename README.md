# 旅游推荐 Agent

通过自然语言定制个性化游玩方案：输入一句需求（目的地、天数、人数、偏好、预算），Agent 会自动抽取需求、搜索**真实 POI**（高德地图）、生成逐日行程，并在前端以卡片 + 地图可视化展示。

## 功能特性

- 自然语言行程定制（支持多轮澄清追问）
- 接入真实 POI：景点 / 美食 / 酒店（高德 Web 服务 API，含真实坐标、地址、评分）
- LangGraph 多节点 Agent 编排，SSE 流式进度反馈
- 逐日行程卡片 + 高德地图打点连线可视化
- 会话与行程持久化（SQLite + Prisma）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + Vite + TypeScript + 高德 JS API 2.0 |
| 后端 | NestJS + TypeScript |
| Agent | LangGraph.js（`@langchain/langgraph`） |
| 模型 | OpenAI 兼容端点（默认 `deepseek-v4-flash`，可切换） |
| 数据库 | SQLite + Prisma |
| 仓库 | pnpm workspace monorepo |

## 目录结构

```
travel/
├─ apps/
│  ├─ api/                 # NestJS 后端
│  │  └─ src/
│  │     ├─ agent/         # LangGraph 图 + prompt + LLM 封装 + CLI
│  │     ├─ amap/          # 高德 Web 服务 API 封装
│  │     ├─ chat/          # SSE 聊天接口 + 会话/消息/行程持久化
│  │     └─ prisma/        # Prisma schema (SQLite)
│  └─ web/                 # React 前端
│     └─ src/
│        ├─ components/    # 聊天 / 行程卡片 / 地图
│        └─ lib/api.ts     # SSE 客户端
└─ packages/
   └─ shared/              # 前后端共享类型
```

## 快速开始

```bash
# 1. 安装依赖（会自动构建 shared 类型包）
pnpm install

# 2. 生成 Prisma client 并初始化数据库
pnpm --filter @travel/api prisma:generate
pnpm --filter @travel/api prisma:migrate

# 3. 启动（api:3001  web:5173）
pnpm dev
```

打开 http://localhost:5173 即可使用。

## 环境变量

在 `apps/api/.env`（后端）和 `apps/web/.env`（前端）中配置：

```env
# 后端 apps/api/.env
DATABASE_URL="file:./dev.db"
AMAP_KEY="你的高德 Web 服务 key"
OPENAI_BASE_URL="https://.../v1"
OPENAI_API_KEY="..."
OPENAI_MODEL="deepseek-v4-flash"   # 建议用快模型

# 前端 apps/web/.env
VITE_AMAP_KEY="你的高德 JS API key"
VITE_AMAP_SECURITY_CODE=""
```

> 高德 key 需在控制台创建应用后开通对应服务：后端用「Web服务 API」，前端用「Web端(JS API)」。

## Agent 工作流

```
START → 抽取需求 → 判断是否完整
                     ├─ 不完整 → 生成追问（多轮对话）
                     └─ 完整 → 生成搜索计划 → 搜索真实 POI → 生成逐日行程 → 收尾
```

## 命令行调试

不使用前端，直接用一句话测试 Agent：

```bash
pnpm --filter @travel/api agent:run "我想去杭州玩3天，2个人，喜欢美食"
```# agentTarvel
