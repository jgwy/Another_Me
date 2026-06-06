#!/usr/bin/env sh
set -e

echo "[entrypoint] applying database migrations (alembic upgrade head)..."
alembic upgrade head

echo "[entrypoint] running seeds (python -m app.seeds.run)..."
python -m app.seeds.run

echo "[entrypoint] starting API (uvicorn app.main:app :8000)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
