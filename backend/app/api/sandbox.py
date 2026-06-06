"""Authed sandbox pass-through (`POST /api/sandbox/run`).

The standalone **沙盒工作台** (plan §10) lets a logged-in user run code from the
browser. The hardened ``sandbox-runner`` is internal-only (no ports published,
`SANDBOX_URL`, contract §5), so this thin authed endpoint forwards the request to
it and returns the locked result shape (`stdout / stderr / exit_code /
duration_ms / timed_out / language`).

Like the orchestrator's use of the runner, this never raises on a transport
failure: it degrades to a non-zero ``exit_code`` result with an explanatory
``stderr`` so the workspace can still render an evidence card.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.orchestrator.sandbox import run_code
from app.schemas import SandboxRunRequest, SandboxRunResult

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


@router.post("/run", response_model=SandboxRunResult)
async def run_sandbox(body: SandboxRunRequest, current_user: CurrentUser) -> SandboxRunResult:
    """Forward code to the internal sandbox-runner and return its result.

    Requires auth. The requested ``timeout_seconds`` is clamped to the server's
    ``SANDBOX_TIMEOUT_SECONDS`` hard cap.
    """
    settings = get_settings()
    cap = settings.sandbox_timeout_seconds
    requested = body.timeout_seconds or cap
    timeout = max(1, min(int(requested), cap))

    result = await run_code(
        body.code,
        language=body.language or "python",
        timeout_seconds=timeout,
        stdin=body.stdin or "",
    )
    return SandboxRunResult(
        stdout=result.get("stdout", ""),
        stderr=result.get("stderr", ""),
        exit_code=int(result.get("exit_code", 0)),
        duration_ms=int(result.get("duration_ms", 0)),
        timed_out=bool(result.get("timed_out", False)),
        language=result.get("language", body.language or "python"),
    )
