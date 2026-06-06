#!/usr/bin/env bash
# 内置 Postgres 启动脚本（创空间专用）。
# 首次启动时把数据目录初始化到 /mnt/workspace/pgdata 并创建角色/库；
# 之后直接以 5432 端口在 127.0.0.1 上提供服务（仅容器内可达）。
set -euo pipefail

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n1)"
export PATH="$PG_BIN:$PATH"

PGDATA="${PGDATA:-/mnt/workspace/pgdata}"
DB_USER="${POSTGRES_USER:-another_me}"
DB_NAME="${POSTGRES_DB:-another_me}"

mkdir -p "$PGDATA"
chown -R postgres:postgres "$PGDATA"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[postgres] initializing data directory at $PGDATA"
  gosu postgres initdb -D "$PGDATA" -E UTF8 --no-locale --auth=trust >/dev/null
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "unix_socket_directories = '/tmp'"
    echo "port = 5432"
  } >> "$PGDATA/postgresql.conf"

  echo "[postgres] bootstrapping role '${DB_USER}' and database '${DB_NAME}'"
  # 临时实例只监听 /tmp socket（无 TCP），避免 backend 的 wait-for-5432
  # 在 bootstrap 完成前就连上来。
  gosu postgres pg_ctl -D "$PGDATA" -w \
    -o "-p 5433 -c listen_addresses='' -k /tmp" start
  gosu postgres psql -h /tmp -p 5433 -d postgres -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || gosu postgres createuser -h /tmp -p 5433 -s "${DB_USER}"
  gosu postgres psql -h /tmp -p 5433 -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || gosu postgres createdb -h /tmp -p 5433 -O "${DB_USER}" "${DB_NAME}"
  gosu postgres pg_ctl -D "$PGDATA" -w stop
fi

echo "[postgres] starting server on 127.0.0.1:5432"
exec gosu postgres postgres -D "$PGDATA"
