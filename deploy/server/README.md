# 自托管服务器部署（腾讯云 EdgeOne · HTTP 回源）

把前端 + 后端合并到 compose 的 `gateway`(nginx) 单端口，让 EdgeOne 以 **HTTP 回源**
访问。TLS 在 EdgeOne 边缘终结，源站只跑 HTTP。

根据这台机器是否已有别的 nginx，选一种拓扑：

## 拓扑 A：机器已有宿主 nginx（推荐，避免端口串台）

宿主 nginx 继续占 `:80` 当唯一入口，`gateway` 只监听 `127.0.0.1:8080`，由宿主
nginx 的站点 vhost 反代进去，与其它站点互不影响。

```
浏览器 ─HTTPS─▶ EdgeOne ─HTTP回源(:80)─▶ 宿主 nginx(vhost) ─▶ 127.0.0.1:8080 gateway
                                                              ├─ /     → frontend:4173
                                                              └─ /api/ → backend:8000 (SSE)
```

- `.env` 保持默认：`GATEWAY_BIND=127.0.0.1`、`GATEWAY_PORT=8080`。
- 把 `host-nginx-vhost.conf` 内容加到宿主 nginx（如 `/etc/nginx/conf.d/another-me.conf`），
  改好 `server_name`，`nginx -t && systemctl reload nginx`。
- **EdgeOne 回源地址不变**（仍指向宿主 nginx 的 `:80`）。
- 关键：vhost 里 `/api` 也要 `proxy_buffering off`（SSE 又一跳），文件里已写好。

## 拓扑 B：机器上没有其它 nginx

让 `gateway` 直接占公网 `:80`，EdgeOne 回源指向本机 `:80`。

```
浏览器 ─HTTPS─▶ EdgeOne ─HTTP回源(:80)─▶ gateway(nginx) ├─ / → frontend:4173
                                                         └─ /api/ → backend:8000 (SSE)
```

- `.env` 改为：`GATEWAY_BIND=0.0.0.0`、`GATEWAY_PORT=80`。

## 一、服务器上启动

```bash
# 1) 准备环境变量
cp .env.example .env
#   必改：JWT_SECRET、数据库密码、OPENAI_API_KEY 等
#   保持 VITE_API_BASE_URL 为空（同源 /api）
#   GATEWAY_PORT 默认 80；若被占用可改，并让 EdgeOne 回源到该端口

# 2) 构建并启动
docker compose up -d --build

# 3) 自检（在源站本机，端口用你的 GATEWAY_PORT）
curl -i http://127.0.0.1:8080/health   # 期望 200（拓扑 A 默认 8080）
curl -i http://127.0.0.1:8080/         # 期望 200，返回前端 index.html
# 拓扑 A 还要确认走宿主 nginx 的入口（带域名 Host）：
curl -i -H 'Host: your-domain.com' http://127.0.0.1/health
```

`db(5432)`、`backend(8000)`、`gateway` 均只绑 `127.0.0.1`，`frontend`、`sandbox-runner`
无对外端口。公网只由宿主 nginx 的 `:80` 暴露（拓扑 A），或由 `gateway` 的 `:80`（拓扑 B）。

## 二、EdgeOne 配置要点

1. **添加站点 / 域名**，回源配置：
   - 回源协议：**HTTP**
   - 源站地址：服务器公网 IP
   - 回源端口：**80**（拓扑 A 指向宿主 nginx；拓扑 B 指向 `gateway`）
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

> 拓扑 A 下若 EdgeOne 回源后页面串台/错乱，多半是宿主 nginx 没有为本域名配 vhost、
> 被 `default_server` 或别的站点抢走了。确保 `host-nginx-vhost.conf` 的 `server_name`
> 精确匹配 EdgeOne 回源 Host，并 `nginx -t && systemctl reload nginx`。
