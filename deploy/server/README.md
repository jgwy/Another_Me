# 自托管服务器部署（腾讯云 EdgeOne · HTTP 回源）

把前端 + 后端合并到 compose 的 `gateway`(nginx) 单端口，让 EdgeOne 以 **HTTP 回源**
访问。TLS 在 EdgeOne 边缘终结，源站只跑 HTTP。

**多站共存的关键**：本站给 `gateway` 分配一个**独立的对外端口**（`GATEWAY_PORT`），
在 EdgeOne 把本域名的**回源端口**指到它即可。机器上其它站点各用各自的端口、各自的
EdgeOne 回源配置，互不干扰——**不需要**共享 80，也不需要再套一层宿主 nginx。

```
浏览器 ─HTTPS─▶ EdgeOne(本域名, 回源端口=GATEWAY_PORT) ─HTTP回源─▶ 服务器:GATEWAY_PORT
                                                          gateway(nginx)
                                                          ├─ /     → frontend:4173
                                                          └─ /api/ → backend:8000 (含 SSE)

# 同机另一个站点：另一个 EdgeOne 域名 + 另一个回源端口 → 它自己的服务，互不影响
```

## 一、服务器上启动

```bash
# 1) 环境变量
cp .env.example .env
#   必改：JWT_SECRET、POSTGRES_PASSWORD、OPENAI_API_KEY
#   保持 VITE_API_BASE_URL 为空（同源 /api）
#   GATEWAY_PORT：挑一个本机没被占用的端口（默认 8080），和 EdgeOne 回源端口保持一致

# 2) 构建并启动
docker compose up -d --build

# 3) 自检（源站本机，端口换成你的 GATEWAY_PORT）
curl -i http://127.0.0.1:8080/health   # 期望 200
curl -i http://127.0.0.1:8080/         # 期望 200，返回前端 index.html
```

端口暴露情况：仅 `gateway` 的 `GATEWAY_PORT` 对外；`db(5432)`、`backend(8000)` 只绑
`127.0.0.1`，`frontend`、`sandbox-runner` 无对外端口。防火墙/安全组放行 `GATEWAY_PORT`。

> 选 `GATEWAY_PORT` 前先确认没被占用：`ss -ltnp | grep :8080`（或换个端口）。

## 二、EdgeOne 配置要点

1. **本域名的回源配置**：
   - 回源协议：**HTTP**
   - 源站地址：服务器公网 IP
   - 回源端口：**= 你的 `GATEWAY_PORT`**（EdgeOne 支持自定义回源端口）
2. **HTTPS**：在 EdgeOne 侧申请/上传证书，对外开启 HTTPS（边缘终结，源站仍 HTTP）。
3. **SSE 透传（关键，否则观战流不逐条推送）**——对路径 `/api/*`：
   - 关闭缓存（不缓存 / Cache Bypass）。
   - 关闭智能压缩 / Gzip（动态压缩会缓冲响应）。
   - 用 **动态加速 / 全站加速** 承载 `/api`（而非纯静态缓存）。
   - 回源/读超时调大（≥ 60s，建议数百秒），匹配长连接 SSE。
4. **静态加速**：`/assets/*`（带 hash 的 JS/CSS）可放心缓存，这是加速收益点。

## 三、（可选）只允许 EdgeOne 回源

`GATEWAY_PORT` 直接暴露后，理论上有人能绕过 EdgeOne 直连源站。需要时可：
- 防火墙/安全组仅放行 EdgeOne 的回源 IP 段；或
- 在 EdgeOne 配一个自定义回源 Header（密钥），并在 `deploy/server/nginx.conf` 校验它，
  非法请求返回 403。

## 四、更新发布

```bash
git pull
docker compose up -d --build   # 前端镜像启动时会重新 vite build（读取 .env 的 VITE_API_BASE_URL）
```
