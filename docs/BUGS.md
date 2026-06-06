# Bug 审查清单（sjx review）

> 审查日期：2026-06-07
> 审查范围：`backend/`、`frontend/`、`sandbox-runner/`、`docker-compose.yml`
> 审查者：sjx + Claude
> 当前 main 提交：`b884282`

按 **P0 安全 → P1 正确性 → P2 质量** 三级排序。每条含：位置、现象、修复方向。

---

## P0 — 安全（必须先修）

### 1. JWT 默认弱密钥

- **位置**：`backend/app/core/config.py:25`
- **现象**：`jwt_secret: str = "dev-insecure-change-me"` 提供了默认值，未设置环境变量时进程仍能启动 → 生产环境若忘配 `JWT_SECRET`，token 可被任意伪造。`docker-compose.yml:15,41,43` 同样使用明文默认凭证。
- **修复方向**：去掉默认值，缺失时 `ValidationError`；compose 用 `${JWT_SECRET:?required}`。

### 2. SSE 通过 URL 查询参数传 JWT

- **位置**：`frontend/src/lib/sse.ts:87`（会话流）、`frontend/src/lib/sse.ts:209`（行程流）
- **现象**：`EventSource(.../stream?token=...)` 会把 token 写入浏览器历史、CDN / 反代访问日志、Referer。
- **修复方向**：后端 SSE 路由改用 HttpOnly Cookie 鉴权；或前端先 POST 拿一次性短期 token 再订阅。

### 3. PATCH /agents 字段提权 (IDOR)

- **位置**：`backend/app/api/agents.py:234-237`
- **现象**：`body.model_dump(exclude_unset=True)` + `setattr(agent, field, value)` 没有字段白名单，客户端可写 `owner_id` / `id` / `created_at` 等任意 ORM 字段，可直接夺取他人 Agent 或伪造时间戳。
- **修复方向**：定义业务字段白名单（`name / description / avatar / profile_tags / prompt_config / visibility` 等），其它字段忽略；同时校验 `agent.owner_id == current_user.id`。

### 4. 会话越权读取

- **位置**：`backend/app/api/conversations.py:30-37`、`88-92`、`102-113`
- **现象**：`get_conversation` / `list_messages` 用 `OptionalUser`，只检查存在性。匿名调用者按 `conversation_id` 枚举即可读取私有会话内容。
- **修复方向**：按 `Conversation.visibility` 判定；私有会话必须 `current_user` 是参与者之一。

### 5. 沙箱执行面无速率限制

- **位置**：`backend/app/api/sandbox.py:27-43`、配套 `backend/app/orchestrator/sandbox.py:21`（`extract_python_code` 接受 `python/py` 围栏）
- **现象**：任何已认证用户可向 sandbox-runner 投递任意 Python，单账号即可探测环境 / 做 DoS。
- **修复方向**：按用户做令牌桶限流（如 5 req/min）；把 `/api/sandbox/run` 限制为内部服务调用，用户侧通过 conversation 间接触发。

---

## P1 — 正确性

### 6. cancel_trip 状态竞态

- **位置**：`backend/app/api/trips.py:170-182`
- **现象**：API 把 `trip.status='cancelled'` 提交后，trip 引擎可能并发再写回 `running/failed`；`request_cancel` 只翻一个进程内 set，多 worker 失效。
- **修复方向**：用 `SELECT ... FOR UPDATE` 锁定 trip；落 `Trip.cancel_requested` 字段让引擎周期性检查；状态机只允许合法跃迁。

### 7. clone_agent 扣点无事务补偿

- **位置**：`backend/app/api/marketplace.py:202-213`（克隆 + 扣点 + `forks += 1`）、`marketplace.py:237-250`（like toggle 同样无锁）
- **现象**：先改 `current_user.points` 再 commit，如果 commit 失败用户积分已扣无回滚；并发克隆可双扣 / 重复计数。
- **修复方向**：单事务 `try/await session.rollback()` 补偿；`SELECT FOR UPDATE` 锁定用户行。

### 8. pubsub 历史无界增长（内存泄漏）

- **位置**：`backend/app/orchestrator/pubsub.py:22-28`
- **现象**：`_subs / _history / _counter / _done` 都是进程内字典，`_history[cid]` 永不清理，`reset()` 从不被调用。
- **修复方向**：每条目用 `deque(maxlen=N)`；会话 end 延迟 N 秒删除；多 worker 时换 Redis pub/sub。

### 9. EventSource 错误不重连

- **位置**：`frontend/src/lib/sse.ts:90`、`136`、`212`
- **现象**：`EventSource` 一旦 error 即关闭，用户看到"已结束"假象。
- **修复方向**：加指数退避重连（500ms→8s，cap），重连失败次数上限后 surface 到 UI。

### 10. orMock 静默吞错

- **位置**：`frontend/src/lib/queries.ts:106-113`、`frontend/src/lib/trips.ts:460-467`
- **现象**：任何后端 500 都退化成 mock 数据，UI 只显示 demo 徽章，用户不知道线上炸了。
- **修复方向**：`orMock` 仅在 `import.meta.env.DEV` 且显式开启 demo 模式时回退；生产环境失败 throw 让 React Query 走 error 态。

### 11. useSpectate replay 不回填 REST 历史

- **位置**：`frontend/src/features/conversation/useSpectate.ts:68`、`155`
- **现象**：`mockStore.getConversation` 同步检查决定 mock/real 路径，存在时序竞态；replay 重订 SSE 但真实会话已结束时不会 REST 回填历史，replay 实际为空。
- **修复方向**：replay 路径先 `GET /conversations/{id}/messages` 拉历史，再决定是否订阅 SSE。

### 12. SkillUploader `key={i}` 串行错位

- **位置**：`frontend/src/features/create-agent/SkillUploader.tsx:53`
- **现象**：用 index 作 key，插入/删除导致 React 复用错误的 input、光标跳动、值串位。
- **修复方向**：用稳定 id（`crypto.randomUUID()` 在 add 时生成并固化）作 key。

### 13. blank avatar 覆盖后端值

- **位置**：`frontend/src/features/create-agent/questionnaire.ts:191`
- **现象**：`avatar` 输入留空时构造 `null` 上送，会覆盖后端已存的头像。
- **修复方向**：留空时 `delete payload.avatar`，不 PATCH 该字段。

---

## P2 — 质量 / 可观测性

### 14. 后端 13 处 blanket `except Exception` + `noqa: BLE001`

- **位置（代表）**：
  - `backend/app/llm/base.py:167,202,214` — LLM 出错全部静默回退 mock provider
  - `backend/app/llm/openai_provider.py:65` — 吞错不记日志
  - `backend/app/orchestrator/engine.py:165,477`、`trip_engine.py:89,338`、`sandbox.py:55`、`planner.py:133`、`synthesis.py:209`、`generate.py:158`、`prompts.py:64`
- **现象**：API key 失效 / 限额 / 计费问题对运营完全不可见；启动期异常变成 `task exception was never retrieved` 告警。
- **修复方向**：至少 `logger.exception(...)`；LLM 回退 mock 时打 metric；`asyncio.create_task` 包 `_with_log()` 拦截异常。

### 15. LLM provider 绕过 pydantic-settings

- **位置**：`backend/app/llm/openai_provider.py:46`、`backend/app/llm/anthropic_provider.py:44`
- **现象**：直接 `os.environ.get("OPENAI_MODEL")` / `ANTHROPIC_MODEL`，绕过 `app/core/config.py` 统一配置层，不在 `.env` 模板里。
- **修复方向**：把模型名加进 `Settings`，统一从 `settings.openai_model` / `settings.anthropic_model` 读。

### 16. sandbox-runner 输出截断在内存里发生

- **位置**：`sandbox-runner/main.py:90`、`106-107`
- **现象**：`subprocess.run(..., capture_output=True)` 把完整 stdout/stderr 缓存进父进程内存后才截断到 100k，恶意脚本可打印大量数据吃光 runner 内存（虽然容器有 256MB mem_limit，但仍违背"先截断"初衷）。
- **修复方向**：改 `subprocess.Popen` + 流式 `read(8192)`，累计达到上限即 `proc.kill()` 并写入"truncated"标记。

### 17. 基础设施缺失

- **位置**：
  - `backend/` — 无 `pytest` / `tests/`，只有 `scripts/verify_*.py` 临时脚本
  - `frontend/` — 无 ESLint / Prettier / Vitest 配置
  - `sandbox-runner/Dockerfile` — 无 seccomp profile（README §已自述 hackathon-grade）
  - `docker-compose.yml:11` — `postgres:18.4` tag 待核（PG 18 GA 状态需确认）
  - `docker-compose.yml:36-38` — backend 未 `depends_on: sandbox-runner`，沙箱挂掉时 `/api/sandbox/run` 静默返回 200 + error
  - `docker-compose.yml:66` — `CORS_ORIGINS: "*"` 默认值
- **修复方向**：
  - 后端引入 `pytest` + `pytest-asyncio` + `httpx[asgi]`，先覆盖 auth、conversations 越权、PATCH agents 白名单、trip cancel 竞态、pubsub TTL
  - 前端补 ESLint flat config + Prettier + Vitest + Testing Library，先覆盖 `useSpectate` replay 与 `orMock` 边界
  - sandbox 引入 seccomp profile；compose 收紧 CORS、加 depends_on、核对 PG tag

---

## 修复优先级建议

1. **本周内**：P0 全部（5 条）+ P1 #6/#7/#10
2. **下个迭代**：P1 剩余 + P2 #14/#15
3. **基础设施周**：P2 #16/#17

## 验证方式

每条修复后按以下方式验证（详见 `C:\Users\85910\.claude\plans\cosmic-tumbling-cupcake.md` 中"验证方式"段落）：

- JWT：`unset JWT_SECRET && docker compose up backend` 应启动失败
- SSE：DevTools Network 面板确认 `EventSource` URL **不带** `?token=`
- IDOR：用 user A token PATCH user B agent 含 `owner_id` → 403/422
- 会话越权：未登录 `curl /api/conversations/{private_id}/messages` → 401/403
- 沙箱限流：单 token 30 秒发 100 次 `/api/sandbox/run` → 后续 429
- 取消行程：并发 cancel + 引擎写状态，最终 DB status 必为 `cancelled`，无负积分
- 前端 SSE：手动断后端，UI 显示"重连中"而非"已结束"
- orMock：`NODE_ENV=production` + 后端 500，UI 显示 error toast 非假数据
- SkillUploader：插入/删除技能 input 内容跟随条目，不串位
