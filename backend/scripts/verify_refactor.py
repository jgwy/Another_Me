"""End-to-end verification for the 觅见.AI refactor (run with LLM_PROVIDER=mock).

Exercises, over HTTP (ASGITransport) against a real Postgres, the new backend
surfaces added by the refactor:

* Autonomous **Trip**: dispatch (Task+prompt) → planned route (scenes + matched
  opponents w/ reasons/risks) → 2–4 encounters reusing the turn protocol →
  per-encounter report + postcard → inbox notification + relationship updates →
  trip summary report. Spectated over the trip journey SSE.
* **Inbox** (notifications + unread count + read_all).
* **Relationships** graph (densifying edges).
* **Agent generate** (NL + corpus → prompt_config draft + questions).
* **Skills v2** CRUD and **Marketplace v2** (snapshot/versions/likes/publish/fork).

Usage:
    LLM_PROVIDER=mock MOCK_STREAM_DELAY=0 \
    DATABASE_URL=postgresql+asyncpg://another_me:another_me@localhost:5432/another_me_test \
    PYTHONPATH=. uv run python scripts/verify_refactor.py
"""

from __future__ import annotations

import asyncio
import json
import sys

import httpx

from app.main import app

BASE = "http://test"

_FAILS: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        _FAILS.append(label)
    return ok


async def _register(client: httpx.AsyncClient, suffix: str) -> str:
    r = await client.post(
        "/api/auth/register",
        json={"email": f"vr_{suffix}@am.local", "username": f"vr_{suffix}", "password": "secret123"},
    )
    if r.status_code == 409:
        r = await client.post(
            "/api/auth/login", json={"email": f"vr_{suffix}@am.local", "password": "secret123"}
        )
    r.raise_for_status()
    return r.json()["access_token"]


async def _create_agent(client, headers, name, questionnaire, is_public=False) -> dict:
    r = await client.post(
        "/api/agents",
        headers=headers,
        json={"name": name, "questionnaire": questionnaire, "is_public": is_public},
    )
    r.raise_for_status()
    return r.json()


async def _consume_trip_sse(client, trip_id: str, timeout: float = 120.0) -> list[dict]:
    events: list[dict] = []
    url = f"/api/trips/{trip_id}/stream"

    async def run() -> None:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            cur: dict = {}
            async for line in resp.aiter_lines():
                if line == "":
                    if cur.get("event"):
                        events.append(cur)
                        if cur["event"] == "trip-end":
                            return
                    cur = {}
                    continue
                if line.startswith("event:"):
                    cur["event"] = line[len("event:"):].strip()
                elif line.startswith("data:"):
                    cur["data"] = line[len("data:"):].strip()
                elif line.startswith("id:"):
                    cur["id"] = line[len("id:"):].strip()

    await asyncio.wait_for(run(), timeout=timeout)
    return events


async def trip_pipeline(client) -> dict:
    print("\n=== Autonomous Trip pipeline (§6/§7/§8) ===")
    token = await _register(client, "trip")
    headers = {"Authorization": f"Bearer {token}"}

    founder = await _create_agent(
        client, headers, "验证·出行创始人",
        {"domain": "fintech", "personality": ["果断", "好奇"], "goals": "拿到下一轮融资并认识不同的人",
         "interests": ["增长", "支付"]},
    )
    check("agent created with prompt_config brain", bool(founder.get("prompt_config")))

    # Create a short trip (small duration so travel slices are tiny).
    r = await client.post(
        "/api/trips",
        headers=headers,
        json={"agent_id": founder["id"], "task_prompt": "去交易所路演，也去咖啡馆认识不同世界的人。",
              "max_encounters": 3, "duration_seconds": 1},
    )
    check("POST /api/trips -> 201", r.status_code == 201, f"status={r.status_code} body={r.text[:200]}")
    trip = r.json()
    trip_id = trip["id"]
    check("trip starts in planning", trip["status"] == "planning", f"status={trip['status']}")
    check("plan has a summary + stops", bool(trip["plan"].get("summary")) and len(trip["plan"].get("stops", [])) >= 2,
          f"stops={len(trip['plan'].get('stops', []))}")
    check("encounters planned (>=2, pending)", len(trip["encounters"]) >= 2,
          f"n={len(trip['encounters'])}")
    # explainable matching produced reasons on at least one stop
    any_reasons = any(s.get("reasons") for s in trip["plan"]["stops"])
    check("planner emitted explainable reasons", any_reasons)

    # Spectate the journey SSE to completion.
    events = await _consume_trip_sse(client, trip_id)
    names = [e["event"] for e in events]
    name_set = set(names)
    print("  trip SSE events:", names)
    for needed in ("trip-status", "agent-status", "encounter-start", "encounter-end", "trip-end"):
        check(f"trip SSE emitted '{needed}'", needed in name_set)
    # agent-status state machine visited talking + home
    statuses = [json.loads(e["data"]).get("agent_status") for e in events if e["event"] == "agent-status"]
    check("agent_status reached 'talking'", "talking" in statuses, f"seen={statuses}")
    check("agent_status reached 'home'", "home" in statuses, f"seen={statuses}")
    enc_starts = [e for e in events if e["event"] == "encounter-start"]
    check("at least 2 encounters started", len(enc_starts) >= 2, f"n={len(enc_starts)}")
    end = json.loads(next(e for e in events if e["event"] == "trip-end")["data"])
    check("trip-end status completed", end["status"] == "completed", f"status={end['status']}")
    check("trip-end carries summary_report_id", bool(end.get("summary_report_id")))

    # Re-fetch the trip and inspect persisted artifacts.
    r = await client.get(f"/api/trips/{trip_id}", headers=headers)
    r.raise_for_status()
    trip = r.json()
    check("trip completed", trip["status"] == "completed", f"status={trip['status']}")
    check("trip agent_status home", trip["agent_status"] == "home")
    done = [e for e in trip["encounters"] if e["status"] == "completed"]
    check(">=2 encounters completed", len(done) >= 2, f"completed={len(done)}")
    check("each completed encounter has a conversation_id", all(e["conversation_id"] for e in done))
    check("each completed encounter has a report_id", all(e["report_id"] for e in done))
    check("each completed encounter has a postcard", all(e.get("postcard") for e in done))
    # postcard carries a reusable takeaway
    if done:
        pc = done[0]["postcard"]
        check("postcard has highlight + reusable_prompt", bool(pc.get("highlight")) and bool(pc.get("reusable_prompt")))
    check("trip has summary_report_id", bool(trip.get("summary_report_id")))

    # Per-encounter report + trip summary report.
    if done:
        r = await client.get(f"/api/conversations/{done[0]['conversation_id']}/report")
        check("per-encounter report retrievable", r.status_code == 200, f"status={r.status_code}")
    r = await client.get(f"/api/reports/{trip['summary_report_id']}")
    check("trip summary report retrievable", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        summ = r.json()
        check("summary report kind == trip_summary", summ["kind"] == "trip_summary", f"kind={summ['kind']}")
        check("summary report aggregates encounters", len(summ["content"].get("encounters", [])) >= 2)

    return {"headers": headers, "agent": founder, "trip": trip}


async def inbox_checks(client, ctx) -> None:
    print("\n=== Inbox / notifications (§7) ===")
    headers = ctx["headers"]
    r = await client.get("/api/inbox/unread_count", headers=headers)
    if not check("GET /api/inbox/unread_count -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}"):
        return
    count = r.json()["count"]
    check("unread notifications produced by the trip", count >= 1, f"count={count}")
    r = await client.get("/api/inbox", headers=headers)
    check("GET /api/inbox -> 200", r.status_code == 200)
    items = r.json()["items"]
    kinds = {n["kind"] for n in items}
    check("inbox has a postcard notification", "postcard" in kinds, f"kinds={kinds}")
    check("inbox has a trip_completed notification", "trip_completed" in kinds, f"kinds={kinds}")
    r = await client.post("/api/inbox/read_all", headers=headers)
    check("POST /api/inbox/read_all -> 200", r.status_code == 200)
    if r.status_code == 200:
        check("read_all updated >=1", r.json()["updated"] >= 1)
    r = await client.get("/api/inbox/unread_count", headers=headers)
    check("unread count is 0 after read_all", r.status_code == 200 and r.json()["count"] == 0)


async def relationship_checks(client, ctx) -> None:
    print("\n=== Relationship graph (§8) ===")
    headers = ctx["headers"]
    agent_id = ctx["agent"]["id"]
    r = await client.get(f"/api/relationships?agent_id={agent_id}", headers=headers)
    if not check("GET /api/relationships -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:120]}"):
        return
    items = r.json()["items"]
    check("relationship edges created by the trip", len(items) >= 1, f"n={len(items)}")
    if items:
        e = items[0]
        check("edge from the dispatched agent", e["from_agent_id"] == agent_id)
        check("edge strength accumulated (>0)", e["strength"] > 0, f"strength={e['strength']}")
        check("edge has type + label", bool(e["type"]) and bool(e.get("label")))
        check("edge embeds from/to AgentSummary", bool(e.get("from_agent")) and bool(e.get("to_agent")))
    r = await client.get("/api/relationships/graph", headers=headers)
    check("GET /api/relationships/graph -> 200", r.status_code == 200)
    if r.status_code == 200:
        g = r.json()
        check("graph has nodes + edges", len(g["nodes"]) >= 2 and len(g["edges"]) >= 1,
              f"nodes={len(g['nodes'])} edges={len(g['edges'])}")
        owned = [n for n in g["nodes"] if n.get("owned")]
        check("graph marks the owned agent", len(owned) >= 1)


async def generate_checks(client, ctx) -> None:
    print("\n=== Agent generate (§3) ===")
    headers = ctx["headers"]
    r = await client.post(
        "/api/agents/generate",
        headers=headers,
        json={"mode": "nl", "input": "我是一个做出海支付的连续创业者，说话直接、爱用数据，喜欢跑步。"},
    )
    gen_ok = check("POST /api/agents/generate (nl) -> 200", r.status_code == 200, r.text[:160])
    if not gen_ok:
        return
    draft = r.json()
    check("draft has a prompt_config brain", bool(draft["prompt_config"].get("identity")))
    check("draft has persona + profile_tags", bool(draft["persona"]) and isinstance(draft["profile_tags"], list))
    has_qs = isinstance(draft["questions"], list) and len(draft["questions"]) >= 1
    check("nl mode returns clarifying questions", has_qs, f"questions={draft.get('questions')}")
    # corpus mode
    r = await client.post(
        "/api/agents/generate",
        headers=headers,
        json={"mode": "corpus", "input": "（聊天记录）今天又改了三版方案……我总觉得数据不会骗人。晚上去跑了5公里。"},
    )
    check("POST /api/agents/generate (corpus) -> 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        d2 = r.json()
        check("corpus draft has a prompt_config", bool(d2["prompt_config"].get("identity")))
    # round-trip: create an agent from the draft
    r = await client.post(
        "/api/agents", headers=headers,
        json={"name": "由NL生成的分身", "prompt_config": draft["prompt_config"]},
    )
    check("agent created from generated prompt_config", r.status_code == 201, f"status={r.status_code}")


async def skills_marketplace_checks(client, ctx) -> None:
    print("\n=== Skills v2 + Marketplace v2 (§4) ===")
    headers = ctx["headers"]
    agent_id = ctx["agent"]["id"]

    # --- Skills CRUD ---
    r = await client.post(
        "/api/skills", headers=headers,
        json={"name": "DCF 估值模型", "description": "折现现金流估值", "prompt_body": "用 DCF 为业务做保守估值。",
              "params": [{"name": "wacc", "type": "number", "required": True}], "tags": ["估值", "金融"],
              "is_public": True, "source": "upload"},
    )
    if not check("POST /api/skills -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:160]}"):
        return
    skill = r.json()
    check("skill mirrors prompt_body<->content", skill["content"] == skill["prompt_body"])
    check("skill stores params + tags", len(skill["params"]) == 1 and "估值" in skill["tags"])
    skill_id = skill["id"]
    r = await client.get("/api/skills?tags=估值", headers=headers)
    check("GET /api/skills filter by tag", r.status_code == 200 and any(s["id"] == skill_id for s in r.json()["items"]))
    r = await client.get(f"/api/skills/{skill_id}")
    check("GET /api/skills/{id} (public)", r.status_code == 200)
    r = await client.patch(f"/api/skills/{skill_id}", headers=headers, json={"description": "更新后的描述"})
    check("PATCH /api/skills/{id}", r.status_code == 200 and r.json()["description"] == "更新后的描述")
    # attach a skill to the agent
    r = await client.post("/api/skills", headers=headers,
                          json={"name": "增长测算", "prompt_body": "估算环比与 LTV/CAC。", "agent_id": agent_id})
    check("create skill attached to an agent", r.status_code == 201 and r.json()["agent_id"] == agent_id)
    r = await client.delete(f"/api/skills/{skill_id}", headers=headers)
    check("DELETE /api/skills/{id} -> 204", r.status_code == 204)

    # --- Marketplace v2 (list the agent) ---
    r = await client.post(
        "/api/marketplace", headers=headers,
        json={"kind": "agent", "ref_id": agent_id, "title": "出行创始人分身", "price_points": 5,
              "fork_mode": "editable"},
    )
    if not check("POST /api/marketplace -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:160]}"):
        return
    item = r.json()
    item_id = item["id"]
    check("listing version == 1", item["version"] == 1)
    check("listing has a snapshot (credentials stripped)", bool(item.get("snapshot")))
    check("listing fork_mode editable", item["fork_mode"] == "editable")
    r = await client.get(f"/api/marketplace/{item_id}/versions")
    check("GET /marketplace/{id}/versions has v1", r.status_code == 200 and len(r.json()) >= 1)
    r = await client.post(f"/api/marketplace/{item_id}/publish", headers=headers, json={"changelog": "v2"})
    check("POST /marketplace/{id}/publish -> 201", r.status_code == 201, f"status={r.status_code}")
    if r.status_code == 201:
        check("publish bumped version to 2", r.json()["version"] == 2, f"version={r.json()['version']}")
    r = await client.post(f"/api/marketplace/{item_id}/like", headers=headers)
    liked_ok = r.status_code == 200 and r.json()["liked"] is True and r.json()["likes"] == 1
    check("POST /marketplace/{id}/like -> liked", liked_ok, f"status={r.status_code} {r.text[:120]}")
    r = await client.post(f"/api/marketplace/{item_id}/like", headers=headers)
    unliked_ok = r.status_code == 200 and r.json()["liked"] is False and r.json()["likes"] == 0
    check("like toggles off", unliked_ok)
    # fork by another user
    buyer = await _register(client, "buyer")
    bh = {"Authorization": f"Bearer {buyer}"}
    r = await client.post(f"/api/marketplace/{item_id}/fork", headers=bh)
    check("POST /marketplace/{id}/fork -> 201", r.status_code == 201, f"status={r.status_code} {r.text[:160]}")
    if r.status_code == 201:
        body = r.json()
        fork_ok = body.get("agent") is not None and body.get("source_version") == 2
        check("fork returns cloned agent + source_version", fork_ok, f"source_version={body.get('source_version')}")


async def main() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE, timeout=60.0) as client:
        ctx = await trip_pipeline(client)
        await inbox_checks(client, ctx)
        await relationship_checks(client, ctx)
        await generate_checks(client, ctx)
        await skills_marketplace_checks(client, ctx)

    print("\n" + ("ALL CHECKS PASSED" if not _FAILS else f"{len(_FAILS)} CHECK(S) FAILED: {_FAILS}"))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except SystemExit as exc:
        print(exc)
        sys.exit(1)
    if _FAILS:
        sys.exit(1)
