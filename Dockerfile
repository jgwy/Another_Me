# syntax=docker/dockerfile:1
# ============================================================================
# Another Me — ModelScope 创空间 (Docker Studio) 单容器部署
# ----------------------------------------------------------------------------
# 仅本文件 + deploy/modelscope/* 属于创空间新增；不改动任何应用源码。
#   * 对外仅暴露 7860（nginx）：/ 托管前端静态，/api → backend:8000（SSE 已关缓冲）
#   * 容器内置 Postgres，数据持久化到 /mnt/workspace/pgdata
#   * backend / sandbox-runner / nginx 由 supervisord 统一编排
# 本机 / 线上完整版仍使用根目录 docker-compose.yml，与本文件互不影响。
# 注意：docker compose 用的是各子目录下的 Dockerfile，不会用到这个根 Dockerfile。
# ============================================================================

# ---- stage 1: 构建前端静态资源 ----------------------------------------------
FROM node:24-slim AS frontend
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
# 同源相对路径：API_BASE_URL 退化为 ""，浏览器请求走 /api（由 nginx 反代）。
# 这是构建期注入，不需要改动任何源码（api.ts 已用 import.meta.env 读取）。
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---- stage 2: 运行时 --------------------------------------------------------
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    DEBIAN_FRONTEND=noninteractive

# 系统依赖：postgres（内置库）、nginx（反代 + 静态）、supervisor（编排）、gosu（降权）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql postgresql-client nginx supervisor gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# uv 用 pip 安装（避免对 ghcr.io 的网络依赖；版本与 backend/Dockerfile 对齐）
RUN pip install --no-cache-dir uv==0.11.19

# ---- backend 依赖（先装依赖，利用层缓存）------------------------------------
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
# backend 应用代码 + 迁移
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
ENV PATH="/app/backend/.venv/bin:$PATH"

# ---- sandbox-runner（复用 backend 的 venv：依赖完全一致）---------------------
COPY sandbox-runner/main.py /app/sandbox/main.py

# ---- 前端静态产物 -----------------------------------------------------------
COPY --from=frontend /web/dist /app/frontend-dist

# ---- 部署编排文件 -----------------------------------------------------------
COPY deploy/modelscope/nginx.conf /etc/nginx/nginx.conf
COPY deploy/modelscope/supervisord.conf /etc/supervisor/conf.d/another-me.conf
COPY deploy/modelscope/run-postgres.sh /usr/local/bin/run-postgres.sh
COPY deploy/modelscope/run-backend.sh /usr/local/bin/run-backend.sh
RUN chmod +x /usr/local/bin/run-postgres.sh /usr/local/bin/run-backend.sh

# ---- 运行时默认配置（均可在创空间「设置 → 环境变量」覆盖）--------------------
# 注意：敏感项请在创空间运行时环境变量提供 —— JWT_SECRET（后端 config 有不安全的
# 默认值，生产务必覆盖）、以及切真实 LLM 时的 OPENAI_API_KEY 等。内置 Postgres 用
# trust 本地认证，因此无需 POSTGRES_PASSWORD。
ENV PGDATA=/mnt/workspace/pgdata \
    POSTGRES_USER=another_me \
    POSTGRES_DB=another_me \
    DATABASE_URL=postgresql+asyncpg://another_me:another_me@127.0.0.1:5432/another_me \
    SANDBOX_URL=http://127.0.0.1:8001 \
    SANDBOX_TIMEOUT_SECONDS=10 \
    FRONTEND_DIST=/app/frontend-dist \
    LLM_PROVIDER=mock \
    LLM_MODEL=DeepSeek-V4-Pro \
    MOCK_STREAM_DELAY=0.04 \
    MAX_ROUNDS=8 \
    MAX_CONCURRENT_CONVERSATIONS=4 \
    CORS_ORIGINS=*

# ModelScope 创空间固定对外端口 7860（平台占用 8080，切勿使用）
EXPOSE 7860

ENTRYPOINT ["supervisord", "-c", "/etc/supervisor/conf.d/another-me.conf"]
