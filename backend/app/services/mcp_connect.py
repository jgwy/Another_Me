"""Connect/probe an MCP server **inside the sandbox** (refactor-2 §5).

Ported from Xyzen's ``core/mcp.py`` (``async_check_mcp_server_status`): connect to
an MCP server, list its tools, and cache ``status`` / ``tools``. Xyzen connected
*directly from the API process* with ``fastmcp.Client``. Here the connection is
driven **through the sandbox-runner boundary** (``SANDBOX_URL/run``, contract §5)
instead: the backend never opens an outbound socket to a user-registered server,
and the probe runs in the same internet-isolated jail used for skill code.

How it works:

* :data:`_PROBE_CODE` is a self-contained, **stdlib-only** script (the runner has
  no ``fastmcp`` and runs ``python -I``). It reads the server config from *stdin*
  as JSON, performs the MCP JSON-RPC handshake (``initialize`` →
  ``notifications/initialized`` → ``tools/list``) over the Streamable-HTTP / SSE
  transport (``sse`` / ``http``) or over stdio (``stdio``), and prints a single
  ``__MCP_RESULT__{json}`` line.
* :func:`connect_in_sandbox` ships the config to the runner via
  :func:`app.orchestrator.sandbox.run_code`, then parses that sentinel line.

Secrets stay server-side: the ``token`` and any secret ``config`` keys are passed
to the (trusted, internal) sandbox over stdin, never returned to the client.
:func:`serialize_mcp_server` strips credential-like keys from ``config`` before a
row is serialized into the API response.
"""

from __future__ import annotations

import json
from typing import Any

from app.models import McpServer
from app.orchestrator.sandbox import run_code
from app.schemas import McpServer as McpServerSchema
from app.services.marketplace import strip_credentials

_RESULT_PREFIX = "__MCP_RESULT__"

# Wall-clock budget for the in-sandbox probe. Kept under the runner's 30s hard cap
# so multiple JSON-RPC round-trips can complete; the runner clamps anyway.
_PROBE_TIMEOUT_SECONDS = 25

# Self-contained probe executed inside the sandbox. Stdlib only (urllib / json /
# subprocess); reads the server config as JSON on stdin; emits one result line.
_PROBE_CODE = r'''
import sys, json

def _emit(obj):
    sys.stdout.write("__MCP_RESULT__" + json.dumps(obj) + "\n")
    sys.stdout.flush()

def _parse_messages(raw, ctype):
    raw = (raw or "").strip()
    if not raw:
        return []
    low = (ctype or "").lower()
    if "event-stream" in low or raw.startswith("data:") or raw.startswith("event:"):
        out = []
        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                payload = line[5:].strip()
                if payload and payload != "[DONE]":
                    try:
                        out.append(json.loads(payload))
                    except Exception:
                        pass
        return out
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, list) else [obj]
    except Exception:
        return []

def _tools_from(messages):
    for m in messages:
        if isinstance(m, dict) and isinstance(m.get("result"), dict):
            tools = m["result"].get("tools")
            if isinstance(tools, list):
                return tools
    return None

INIT = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "another-me", "version": "0.1.0"},
}}
INITIALIZED = {"jsonrpc": "2.0", "method": "notifications/initialized"}
LIST = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}

def http_probe(cfg):
    import urllib.request
    url = (cfg.get("url") or "").strip()
    if not url:
        return {"status": "error", "tools": [], "error": "no url for sse/http transport"}
    token = cfg.get("token") or ""
    conf = cfg.get("config") or {}
    headers = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
    if token:
        headers["Authorization"] = "Bearer " + str(token)
    if isinstance(conf, dict) and isinstance(conf.get("headers"), dict):
        for k, v in conf["headers"].items():
            headers[str(k)] = str(v)
    state = {"sid": None}

    def post(body):
        h = dict(headers)
        if state["sid"]:
            h["Mcp-Session-Id"] = state["sid"]
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=h, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            sid = resp.headers.get("Mcp-Session-Id")
            if sid:
                state["sid"] = sid
            ctype = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8", "replace")
        return _parse_messages(raw, ctype)

    init_msgs = post(INIT)
    try:
        post(INITIALIZED)
    except Exception:
        pass
    list_msgs = post(LIST)
    tools = _tools_from(list_msgs)
    if tools is None:
        tools = _tools_from(init_msgs) or []
    return {"status": "online", "tools": tools, "error": None}

def stdio_probe(cfg):
    import subprocess, shlex, os
    command = (cfg.get("command") or "").strip()
    if not command:
        return {"status": "error", "tools": [], "error": "no command for stdio transport"}
    args = shlex.split(command)
    env = dict(os.environ)
    conf = cfg.get("config") or {}
    if isinstance(conf, dict) and isinstance(conf.get("env"), dict):
        for k, v in conf["env"].items():
            env[str(k)] = str(v)
    try:
        proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, env=env)
    except FileNotFoundError:
        return {"status": "error", "tools": [], "error": "command not found: " + args[0]}

    def send(obj):
        proc.stdin.write(json.dumps(obj) + "\n")
        proc.stdin.flush()

    def read_until(want_id, limit=500):
        for _ in range(limit):
            line = proc.stdout.readline()
            if not line:
                return None
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                continue
            if isinstance(msg, dict) and msg.get("id") == want_id:
                return msg
        return None

    try:
        send(INIT)
        read_until(1)
        send(INITIALIZED)
        send(LIST)
        msg = read_until(2)
        tools = []
        if msg and isinstance(msg.get("result"), dict):
            tools = msg["result"].get("tools") or []
        return {"status": "online", "tools": tools, "error": None}
    finally:
        try:
            proc.terminate()
        except Exception:
            pass

def main():
    try:
        cfg = json.loads(sys.stdin.read() or "{}")
    except Exception as exc:
        _emit({"status": "error", "tools": [], "error": "bad config: %s" % exc})
        return
    transport = (cfg.get("transport") or "sse").lower()
    try:
        res = stdio_probe(cfg) if transport == "stdio" else http_probe(cfg)
    except Exception as exc:
        res = {"status": "offline", "tools": [], "error": "%s: %s" % (type(exc).__name__, exc)}
    _emit(res)

main()
'''


def _extract_result(stdout: str) -> dict[str, Any] | None:
    """Return the parsed ``__MCP_RESULT__`` payload from sandbox stdout, if any."""
    for line in reversed((stdout or "").splitlines()):
        line = line.strip()
        if line.startswith(_RESULT_PREFIX):
            try:
                return json.loads(line[len(_RESULT_PREFIX) :])
            except json.JSONDecodeError:
                return None
    return None


async def connect_in_sandbox(server: McpServer) -> dict[str, Any]:
    """Probe ``server`` from inside the sandbox and return ``{status, tools, error}``.

    Never raises: a transport failure or crashing probe degrades to a
    ``status="error"`` result with an explanatory ``error`` so the caller can still
    persist the outcome.
    """
    cfg = {
        "transport": server.transport or "sse",
        "url": server.url or "",
        "command": server.command or "",
        "token": server.token or "",
        "config": server.config or {},
    }
    result = await run_code(
        _PROBE_CODE,
        language="python",
        timeout_seconds=_PROBE_TIMEOUT_SECONDS,
        stdin=json.dumps(cfg),
    )
    parsed = _extract_result(result.get("stdout", ""))
    if parsed is None:
        stderr = (result.get("stderr") or "").strip()
        detail = stderr or "sandbox produced no MCP result"
        return {"status": "error", "tools": [], "error": detail[:500]}

    status = parsed.get("status") or "error"
    tools = parsed.get("tools")
    if not isinstance(tools, list):
        tools = []
    error = parsed.get("error")
    return {"status": status, "tools": tools, "error": error}


def serialize_mcp_server(server: McpServer) -> McpServerSchema:
    """Validate a row into the response schema with credential-stripped ``config``.

    ``token`` is absent from the schema (so it never serializes); ``config`` may
    carry secrets (headers/env), so credential-like keys are dropped recursively.
    """
    schema = McpServerSchema.model_validate(server)
    if schema.config is not None:
        schema.config = strip_credentials(schema.config)
    return schema
