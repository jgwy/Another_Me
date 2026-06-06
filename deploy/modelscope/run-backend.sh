#!/usr/bin/env bash
# backend 启动脚本（创空间专用）：等待 Postgres → 迁移 → 幂等 seed → uvicorn。
# 复用 backend 现有的迁移与 seed 逻辑，不改动任何应用源码。
set -euo pipefail

export PATH="/app/backend/.venv/bin:$PATH"

echo "[backend] waiting for postgres on 127.0.0.1:5432 ..."
for _ in $(seq 1 90); do
  if pg_isready -h 127.0.0.1 -p 5432 -U "${POSTGRES_USER:-another_me}" >/dev/null 2>&1; then
    echo "[backend] postgres is ready"
    break
  fi
  sleep 1
done

cd /app/backend

echo "[backend] alembic upgrade head"
alembic upgrade head

echo "[backend] seeding (idempotent)"
python -m app.seeds.run || echo "[backend] seed returned non-zero — continuing to serve"

echo "[backend] starting uvicorn on 0.0.0.0:8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
