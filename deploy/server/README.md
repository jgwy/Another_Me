# 自托管服务器部署（腾讯云 EdgeOne · HTTP 回源）

把前端 + 后端合并到单个 HTTP 端口（compose 的 `gateway` 服务，默认 `:80`），
让 EdgeOne 以 **HTTP 回源** 指向本机。TLS 在 EdgeOne 边缘终结，源站只跑 HTTP。

```
浏览器 ──HTTPS──▶ EdgeOne 边缘 ──HTTP 回源(:80)──▶ 服务器 gateway(nginx)
                  缓存静态/透传动态                ├─ /      → frontend:4173
                                                   └─ /api/  → backend:8000 (含 SSE)
```

## 一、服务器上启动

```bash
# 1) 准备环境变量
cp .env.example .env
#   必改：JWT_SECRET、数据库密码、OPENAI_API_KEY 等
#   保持 VITE_API_BASE_URL 为空（同源 /api）
#   GATEWAY_PORT 默认 80；若被占用可改，并让 EdgeOne 回源到该端口

# 2) 构建并启动
docker compose up -d --build

# 3) 自检（源站本机）
curl -i http://localhost/health        # 期望 200
curl -i http://localhost/              # 期望 200，返回前端 index.html
```

仅 `gateway` 的端口对公网开放；`db(5432)`、`backend(8000)` 只绑定 `127.0.0.1`，
`frontend`、`sandbox-runner` 无对外端口。安全组/防火墙放行 `GATEWAY_PORT`（80）即可。

## 二、EdgeOne 配置要点

1. **添加站点 / 域名**，回源配置：
   - 回源协议：**HTTP**
   - 源站地址：服务器公网 IP（或内网，视部署而定）
   - 回源端口：**80**（与 `GATEWAY_PORT` 一致）
2. **HTTPS**：在 EdgeOne 侧申请/上传证书，对外开启 HTTPS（边缘终结）。
3. **SSE 透传（关键，否则观战流不逐条推送）**——对路径 `/api/*` 配置：
   - 关闭缓存（缓存 → 不缓存 / Cache Bypass）。
   - 关闭智能压缩 / Gzip（动态压缩会缓冲响应）。
   - 使用 **动态加速 / 全站加速** 能力承载 `/api`（而非纯静态缓存）。
   - 回源/读超时调大（≥ 60s，建议数百秒），匹配长连接 SSE。
4. **静态加速**：`/assets/*`（带 hash 的 JS/CSS）可放心缓存，这是加速收益点。

## 三、更新发布

```bash
git pull
docker compose up -d --build   # 前端镜像启动时会重新 vite build（读取 .env 的 VITE_API_BASE_URL）
```

> 仅本机直连（不经 EdgeOne）调试时，浏览器访问 `http://<服务器IP>:<GATEWAY_PORT>` 即可，
> 同源 `/api` 同样生效，无需任何额外配置。
