---
date: 2026-06-06
topic: another-me
type: comparison analysis
status: draft
---

# Another Me 双血统对比分析

> 本文只做**对比分析**：厘清 `main` 与另外三条分支的关系，比较两条产品路径的哲学、
> 技术与能力差异，并提炼每条路径独有的内容与经验。不含实现方案、开发步骤与排期。

---

## 0. 核心结论

- `main` 与 `codex/module-3-social` / `lxm` / `sjx` **没有共同 git 祖先**，是两套
  **完全独立的血统**，并非同一棵树上的功能分支。这解释了"看起来完全不同"的直觉。
- 它们代表两种**产品哲学**：
  - `main`＝**自顶向下、需求驱动、一次成型的完整全栈产品**。
  - 另一套＝**已部署站点的本地镜像 → 拆成三个模块给三人协作、增量做真**。
- 两条路径各有强项：`main` 把硬骨头（轮次协议、真沙盒、进化、SSE 旁观）做全了；
  另一套在**自治化、关系沉淀、可解释、协作与范围纪律**上有 `main` 没有的东西。

---

## 1. 血统与分支结构

```
main 血统  (root e1ea907)             需求文档 → 从零工程化的「完整全栈产品」
└─ FastAPI + React19 + Postgres + Alembic + Docker + 真沙盒（4 服务 monorepo，161 文件）

73055e6 血统 (root 73055e6)           已部署站点的「本地镜像」→ 拆 3 模块给 3 人协作
├─ 3d4e36c  "Split hackathon modules for collaboration"
│   ├─ codex/module-3-social   模块3（社交）：独立 TS 全栈 C-lite（+8486 行，唯一带单测）
│   ├─ lxm                     基建：mirror 服务器 + 真实 LLM 直连提速 + 模块1（启动）真实化
│   └─ sjx                     模块2（头像）：结构化问卷 + 4 段确定性 prompt
```

- 判定依据：`git merge-base main origin/codex/module-3-social` 返回空（无共同祖先）。
- 三条分支彼此**有**共同祖先（`3d4e36c` / `1050c77`），是一套内部的三人分工。
- 体量：main 161 文件；codex 76；lxm 35；sjx 35。

---

## 2. 产品哲学对比

| 维度 | **main 血统** | **73055e6 血统（三分支）** |
|---|---|---|
| 起点 | 一份完整需求文档，从零搭全栈 | 一个已存在站点的静态镜像，原地拆改 |
| 推进方式 | 自顶向下、一次成型 | 增量、先占位再做真、模块各自演进 |
| 组织方式 | 单体 monorepo，单人/单线视角 | 模块 owner 制、命名空间端点、三人并行 |
| 完成度取向 | 把核心闭环全部做硬（含沙盒/进化） | 优先打通"能演示的真"，硬骨头显式延后 |
| 风险偏好 | 高投入、高一致性 | 低耦合、易回滚、坏一个模块不连累其他 |
| "人不下场"内核 | 实现为：人派单选建筑，再旁观 | codex 推进为：人只给意图，**AI 自己选去哪/找谁** |

---

## 3. 技术栈与体量对比

| 项 | main | codex/module-3-social | lxm | sjx |
|---|---|---|---|---|
| 后端 | Python FastAPI + async SQLAlchemy | Node Fastify + Prisma | 原生 Node http | （复用镜像） |
| 前端 | React 19 + Vite + Tailwind v4 + Motion | React + Vite + Tailwind | 静态镜像 + 模块页 | 原生 HTML/JS |
| 数据 | PostgreSQL + Alembic 迁移 | PostgreSQL（Prisma） | JSON 文件 | JSON 文件 |
| 校验 | Pydantic | Zod（`packages/shared`） | 手写 | 手写 |
| LLM | OpenAI/Anthropic + mock 兜底 | OpenAI + mock | OpenAI 直连 | 无（确定性拼接） |
| 部署 | Docker Compose（4 服务） | Docker Compose | `npm run mirror` | 同 lxm |
| 测试 | 验证脚本 | 单元测试（matcher/mock/autonomous） | — | — |

---

## 4. 能力矩阵对比

| 能力 | main | 另一套（出处） | 差异点评 |
|---|---|---|---|
| 轮次协议 / SSE 实时旁观 | ✅ `orchestrator/engine.py` | 较弱（codex 同步单请求跑完） | main 体验更"直播感" |
| 真实代码沙盒（隔离执行回注证据） | ✅ `sandbox-runner` | ❌ 三分支全部跳过 | main 独有的高光 |
| 进化（diff + apply/rollback） | ✅ `orchestrator/evolution.py` | 仅报告里一句 `agentLearning` | main 重、另一套轻 |
| 双 Provider + 无 key 兜底 | ✅ | codex/lxm 各自 OpenAI 直连 | main 更稳 |
| **AI 自治选场景+对手** | ❌ 人选建筑 | ✅ codex `planAutonomousSocialRun` | 另一套更贴"人不下场" |
| **跨对话关系图谱** | ❌ | ✅ codex `mapUpdates` 关系线 | 另一套把社交沉淀成资产 |
| **可解释匹配（理由/风险）** | 仅打分，无理由 | ✅ codex `matcher.ts`（含中英文分词） | 另一套更透明 |
| **报告 reusablePrompt（可复用产物）** | ❌ | ✅ codex `conversation.ts` | 另一套有"复利"意识 |
| 自带 Agent（skill zip + MCP 运行时注入） | 技能合成进 persona | ✅ lxm `buildAgentRuntimePrompt` | 路线不同（合成 vs 原样注入） |
| avatar 生成 | LLM 合成 persona | sjx 4 段确定性 prompt + imagePrompt + 可复制 | 另一套透明、零 key、可对接 VLM |
| 多人协作纪律 | 单体，无显式约定 | ✅ ownership / 命名空间端点 / 合并 smoke-test | 另一套工程纪律更强 |
| 范围纪律 | 需求里有 Scope，但一次做满 | ✅ codex 显式 Non-Goals +「数据模型留位但不实现」 | 另一套更克制 |

---

## 5. 关键差异深读（最值得吸收的"不一样"）

### 5.1 谁决定"去哪、找谁"——人 vs AI
- `main`：人在 island 上**选建筑**（交易所/咖啡馆）并指定/匹配对手，然后旁观。
- `codex`：人只给**意图（goal）**，后端 `planAutonomousSocialRun` 读画像 → 选场景 →
  选对手 → 产出 `route` + `mapEvents`（thinking/choose_scene/move/discover/conversation/report）
  给前端"播放"。
- **洞察**：需求文档的北极星是"人不下场（humans don't play）"。codex 这版把决策权也交给
  AI，比 main"人仍在选建筑"更彻底地贴合了产品内核。

### 5.2 一次性报告 vs 持续关系图谱
- `main`：每场对话产出一份独立报告，对话之间不互相累积。
- `codex`：报告产出 `mapUpdates`（from→to + strength + label）、`relationshipType`、
  `relationshipScore`，把多场对话沉淀成一张**会变密的 Agent 社交网络**。
- **洞察**："分身替我拓展社交圈"的真正资产是这张关系网，而非单次报告——这是 main 缺的视角。

### 5.3 匹配的可解释性
- `main` `matching.py`：基于 `profile_tags` 的确定性启发式打分，输出一个分数，但**没有
  "为什么/有什么风险"**。
- `codex` `matcher.ts`：分数拆成 `topicAlignment + scenarioAlignment + complementarity +
  roundFit`，并输出 `reasons` / `risks` / `recommendedMaxRounds`；分词同时处理拉丁词与
  中文 bigram。
- **洞察**：同为"无 embedding 的确定性匹配"，codex 多了**可读的理由与风险**，更适合给人解释。

### 5.4 报告的沉淀物：reusablePrompt
- `codex` 报告含 `reusablePrompt`/`evolutionNotes`，把一次对话压缩成"下次能直接复用的
  提示词 + 学到的偏好"。`main` 的报告偏"结论展示"，没有显式的可复用产物。
- **洞察**：这是低成本的"复利"——让每场对话给下一场留下可被直接使用的东西。

### 5.5 进化的轻与重
- `main`：完整 `evolution` 流程，有可见 diff、可 apply / rollback——重而完整。
- `codex`：只在报告里留一句 `agentLearning`——轻而够用。
- **洞察**：两种取舍各有适用场景；main 适合"严肃成长"，codex 适合"快速演示闭环"。

### 5.6 真实化与延迟（lxm 的工程经验）
- lxm 的提交 `598a781` 把"spawn 一个 Python CLI 子进程（120s 超时）"改为**直接
  `fetch` OpenAI 兼容 `/chat/completions`（60s + AbortController）**，删 53 行加 29 行，
  延迟与可靠性大幅改善。
- lxm 还让模块1 真正可用：上传 Agent 支持 **skill zip 解包 + MCP 配置**，运行时把技能
  文本拼进 system prompt（`buildAgentRuntimePrompt`）。
- **洞察**：① 调模型优先直连 HTTP，别走子进程；② "自带 agent"可以保留原始技能/MCP 在
  运行时注入，而不是只合成进 persona——这是与 main 不同的一条真实化路线。

### 5.7 avatar：确定性拼接 vs LLM 合成（sjx 的经验）
- `sjx` 把头像生成拆成 4 段确定性文本（Persona / Skills / Rules / imagePrompt）+ 折叠式
  "精准化问卷" + "Copy prompt"，**无需任何 key 即可跑**，且 `imagePrompt` 是显式、可直接
  喂给 VLM 的产物；旧数据缺字段也能优雅降级。
- `main` 走 LLM 合成 persona 的路线。
- **洞察**：sjx 这版透明、零成本、产物显式，是 main 合成路线的好互补（尤其无 key 演示场景）。

### 5.8 工程与协作纪律
- 另一套血统有 main 缺的纪律：`collaboration-plan.md` 的模块 owner 制、命名空间端点
  （`/api/module-*`）、"拆砖块再拼页面"的动态装配、改动前先备份、合并前 smoke-test 清单；
  codex 还有**显式 Non-Goals**、"数据模型留位但不实现"，以及**四条分支里唯一的单元测试**。
- **洞察**：这些是多人协作与范围控制的经验资产，独立于具体功能。

---

## 6. 各分支独有内容与经验小结

- **main**：完整全栈与硬能力的标杆——轮次协议、真沙盒、进化 diff、SSE 旁观、双 Provider、
  无 key 兜底。经验：把核心闭环一次做硬、做可复现。
- **codex/module-3-social**：产品想象力最强——AI 自治导览、关系图谱、可解释匹配、可复用
  报告产物，并带范围纪律与单测。经验：用 C-lite 范围把"新方向"快速做成可演示的真。
- **lxm**：工程与真实化经验——模型直连提速、skill zip + MCP 运行时注入、把镜像/模块1 接通真实对话。
- **sjx**：透明且零成本的 avatar 经验——确定性 4 段 prompt、可复制、可对接 VLM、向后兼容。

---

## 7. 两条路径的优势与短板

| | 优势 | 短板 |
|---|---|---|
| **main** | 能力最全、最硬、可复现；单一引擎一致性高 | 单体、自治化与关系沉淀缺位、协作/范围纪律弱、缺单测 |
| **另一套** | 自治化、关系图谱、可解释、可复用产物、协作与范围纪律强、有单测 | 缺真沙盒/完整进化；形态分裂（静态镜像 + 独立 C-lite + 真实化散落三分支） |

---

## 附录　关键文件索引（供查证）

- **main**：`backend/app/orchestrator/{engine,reports,evolution}.py`、
  `backend/app/services/matching.py`、`backend/app/api/dispatches.py`、
  `frontend/src/features/{island,dispatch,reports}`。
- **codex/module-3-social**：`apps/api/src/services/{autonomousSocial,matcher,conversation}.ts`、
  `docs/agent-island-autonomous-guide-map-v2.md`、
  `docs/superpowers/specs/2026-06-06-module-3-c-lite-fullstack-design.md`。
- **lxm**：`scripts/serve-local-mirror.mjs`（`runAnotherMeChat` / `buildAgentRuntimePrompt` /
  `saveAndExtractSkillZip`）、提交 `598a781`。
- **sjx**：`modules/web/avatar.js`、`modules/02-avatar/README.md`、
  `scripts/serve-local-mirror.mjs` 的 `makeAvatarProfile`。
