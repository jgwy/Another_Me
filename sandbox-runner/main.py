"""Another Me — Sandbox Runner.

A minimal, standalone code-execution service. It runs untrusted Agent code in a
short-lived subprocess with a hard wall-clock timeout and returns the captured
output. It is intentionally simple here; a later agent hardens isolation
(memory/CPU/pids limits, seccomp, read-only FS, etc.).

Isolation guarantees provided by deployment (docker-compose):
  * runs as a non-root user in its own container
  * attached only to an ``internal`` network (no external/internet access)
  * no database connection and no secret environment variables
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Hard upper bound regardless of what the caller requests.
MAX_TIMEOUT_SECONDS = 30.0
DEFAULT_TIMEOUT_SECONDS = float(os.environ.get("SANDBOX_TIMEOUT_SECONDS", "10"))
# Truncate very large output so a runaway script cannot exhaust memory in the caller.
MAX_OUTPUT_CHARS = 100_000

SUPPORTED_LANGUAGES = {"python", "python3"}

app = FastAPI(title="Another Me Sandbox Runner", version="0.1.0")


class RunRequest(BaseModel):
    code: str = Field(..., description="Source code to execute.")
    language: str = Field("python", description="Only 'python' is supported in v1.")
    timeout_seconds: float | None = Field(
        None, description="Wall-clock timeout; capped at the service maximum."
    )
    stdin: str | None = Field(None, description="Optional data piped to the process stdin.")


class RunResult(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    timed_out: bool
    language: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "sandbox-runner"}


@app.post("/run", response_model=RunResult)
def run(req: RunRequest) -> RunResult:
    language = (req.language or "python").lower()
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"unsupported language: {req.language!r}")

    timeout = req.timeout_seconds or DEFAULT_TIMEOUT_SECONDS
    timeout = max(1.0, min(float(timeout), MAX_TIMEOUT_SECONDS))

    with tempfile.TemporaryDirectory(prefix="ambox_") as workdir:
        script_path = os.path.join(workdir, "main.py")
        with open(script_path, "w", encoding="utf-8") as fh:
            fh.write(req.code)

        # Minimal, scrubbed environment — no inherited secrets.
        env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": workdir,
            "TMPDIR": workdir,
            "LANG": "C.UTF-8",
            "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }

        started = time.perf_counter()
        timed_out = False
        try:
            # -I: isolated mode (ignore env vars and user site-packages).
            proc = subprocess.run(
                [sys.executable, "-I", "-B", script_path],
                input=req.stdin or "",
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=workdir,
                env=env,
            )
            stdout, stderr, exit_code = proc.stdout, proc.stderr, proc.returncode
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            stdout = _as_text(exc.stdout)
            stderr = _as_text(exc.stderr) + f"\n[sandbox] execution timed out after {timeout:g}s"
            exit_code = 124

        duration_ms = int((time.perf_counter() - started) * 1000)

    return RunResult(
        stdout=stdout[:MAX_OUTPUT_CHARS],
        stderr=stderr[:MAX_OUTPUT_CHARS],
        exit_code=exit_code,
        duration_ms=duration_ms,
        timed_out=timed_out,
        language="python",
    )


def _as_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return str(value)
