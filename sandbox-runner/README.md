# sandbox-runner

Standalone, isolated code-execution service for **Another Me**. The backend's
orchestrator posts Agent-generated code here and gets back captured output to
re-inject into a conversation as "evidence".

> Isolation in v1 is deliberately simple (non-root user, short-lived subprocess,
> hard wall-clock timeout, scrubbed environment). Deployment provides the strong
> guarantees: **no DB, no secrets, internal-only network (no internet)**. A later
> agent hardens per-run resource limits (memory/CPU/pids/seccomp).

## API

See the locked contract in [`../docs/api-contract.md`](../docs/api-contract.md) §5.

### `POST /run`
```json
{ "code": "print(2 + 2)", "language": "python", "timeout_seconds": 10, "stdin": "" }
```
→
```json
{ "stdout": "4\n", "stderr": "", "exit_code": 0, "duration_ms": 31, "timed_out": false, "language": "python" }
```

### `GET /health`
```json
{ "status": "ok", "service": "sandbox-runner" }
```

## Run locally (without Docker)

```bash
cd sandbox-runner
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8001
```

## Run via Docker

```bash
docker build -t another-me-sandbox ./sandbox-runner
docker run --rm -p 8001:8001 another-me-sandbox
```

In the full stack it is started by the root `docker-compose.yml` on an
internal-only network and is **not** published to the host.
