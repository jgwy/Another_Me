"""Focused backend verification (run with ``LLM_PROVIDER=mock``).

Exercises, against a real Postgres + the sandbox-runner, the whole backend path
without any API keys:

1. AE1 pure turn-protocol check (max_rounds 8 vs 5 → n=5 → [对话1..10], ending
   prompt injected at 对话7).
2. Register → create two agents → dispatch → run a conversation over HTTP.
3. Consume the SSE stream and assert the LOCKED event names appear.
4. Assert the conversation terminated correctly (2n=10 agent turns, alternation).
5. Assert the sandbox ran and its output was re-injected as evidence (AE4).
6. Assert the report (business dialect) and an evolution were generated.

Usage:
    LLM_PROVIDER=mock PYTHONPATH=. uv run python scripts/verify_pipeline.py
"""

from __future__ import annotations

import asyncio
import json
import sys

import httpx

from app.main import app
from app.orchestrator.protocol import ending_start_turn, plan_turns

BASE = "http://test"


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}{(' — ' + detail) if detail else ''}")
    if not ok:
        raise SystemExit(f"verification failed: {label}")


def ae1_protocol_check() -> None:
    print("\n=== AE1: pure turn-protocol planner ===")
    n = min(8, 5)
    check("n = min(8,5) == 5", n == 5)
    steps = plan_turns(n)
    turns = [(s.turn_index, s.seat, s.ending_active) for s in steps]
    print("  plan:", turns)
    check("produces [对话1..10]", [t[0] for t in turns] == list(range(1, 11)))
    check(
        "strict alternation agent1 on odd / agent2 on even",
        all(s.seat == (1 if s.turn_index % 2 == 1 else 2) for s in steps),
    )
    check("ending prompt starts at 对话7 (2n-3)", ending_start_turn(n) == 7)
    check(
        "对话7 is agent1 with ending active (merge ending+对话6 → agent1)",
        steps[6].turn_index == 7 and steps[6].seat == 1 and steps[6].ending_active,
    )
    check(
        "ending stays active through 对话10",
        all(s.ending_active for s in steps if s.turn_index >= 7)
        and all(not s.ending_active for s in steps if s.turn_index < 7),
    )


async def _register(client: httpx.AsyncClient, suffix: str) -> str:
    r = await client.post(
        "/api/auth/register",
        json={"email": f"verify_{suffix}@am.local", "username": f"verify_{suffix}", "password": "secret123"},
    )
    if r.status_code == 409:
        r = await client.post(
            "/api/auth/login", json={"email": f"verify_{suffix}@am.local", "password": "secret123"}
        )
    r.raise_for_status()
    return r.json()["access_token"]


async def _create_agent(client, headers, name, max_rounds, questionnaire) -> dict:
    r = await client.post(
        "/api/agents",
        headers=headers,
        json={"name": name, "questionnaire": questionnaire, "max_rounds": max_rounds, "is_public": False},
    )
    r.raise_for_status()
    return r.json()


async def _consume_sse(client, conversation_id: str, timeout: float = 60.0) -> list[dict]:
    events: list[dict] = []
    url = f"/api/conversations/{conversation_id}/stream"

    async def run() -> None:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            cur: dict = {}
            async for line in resp.aiter_lines():
                if line == "":
                    if cur.get("event"):
                        events.append(cur)
                        if cur["event"] == "conversation-end":
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


async def pipeline_check() -> None:
    print("\n=== Full pipeline over HTTP (LLM_PROVIDER=mock) ===")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE) as client:
        token = await _register(client, "user")
        headers = {"Authorization": f"Bearer {token}"}

        # exchange scenario (business → report dialect + sandbox-capable)
        r = await client.get("/api/scenarios/exchange")
        r.raise_for_status()
        scenario = r.json()
        check("exchange scenario seeded", scenario["kind"] == "business")

        founder = await _create_agent(
            client, headers, "验证创始人", 8,
            {"domain": "fintech", "personality": ["果断"], "goals": "拿到融资", "tags": ["创业者"]},
        )
        investor = await _create_agent(
            client, headers, "验证投资人", 5,
            {"domain": "投资", "personality": ["犀利"], "goals": "找到好项目", "tags": ["投资人"]},
        )
        check("agent synthesis produced persona", bool(founder["persona"]))
        check("agent has synthesized skills", isinstance(founder["skills"], list))

        # Dispatch founder vs investor (direct opponent) → starts a conversation.
        r = await client.post(
            "/api/dispatches",
            headers=headers,
            json={
                "agent_id": founder["id"],
                "scenario_id": scenario["id"],
                "task_prompt": "用真实数据证明你的增长，拿下这轮融资。",
                "opponent_agent_id": investor["id"],
            },
        )
        r.raise_for_status()
        dispatch = r.json()
        check("dispatch matched + conversation created", dispatch["conversation_id"] is not None,
              f"status={dispatch['status']}")
        conversation_id = dispatch["conversation_id"]

        # Consume the live SSE stream.
        events = await _consume_sse(client, conversation_id)
        event_names = {e["event"] for e in events}
        print("  SSE event types seen:", sorted(event_names))
        for needed in ("message-start", "message-delta", "message-end", "sandbox-output", "conversation-end"):
            check(f"SSE emitted '{needed}'", needed in event_names)

        end_event = next(e for e in events if e["event"] == "conversation-end")
        end_data = json.loads(end_event["data"])
        check("conversation-end status completed", end_data["status"] == "completed")
        check("conversation-end n_rounds == 5", end_data["n_rounds"] == 5, f"n_rounds={end_data['n_rounds']}")
        check("conversation-end carries report_id", bool(end_data.get("report_id")))

        # Inspect persisted transcript.
        r = await client.get(f"/api/conversations/{conversation_id}/messages?limit=1000")
        r.raise_for_status()
        messages = r.json()
        agent_turns = [m for m in messages if m["sender"] == "agent"]
        sandbox_msgs = [m for m in messages if m["sender"] == "sandbox"]
        turn_indices = [m["turn_index"] for m in agent_turns]
        check("2n = 10 agent dialogue turns", len(agent_turns) == 10, f"got {len(agent_turns)}")
        check("turn_index is exactly 1..10", turn_indices == list(range(1, 11)))

        # Alternation: odd turns = founder, even = investor.
        seat_ok = all(
            (m["agent_id"] == founder["id"]) == (m["turn_index"] % 2 == 1) for m in agent_turns
        )
        check("strict alternation founder(odd)/investor(even)", seat_ok)

        # Sandbox re-injection (AE4).
        check("sandbox produced >= 1 evidence message", len(sandbox_msgs) >= 1, f"got {len(sandbox_msgs)}")
        evidence = sandbox_msgs[0]
        check("evidence has sandbox_run_id meta", bool((evidence.get("meta") or {}).get("sandbox_run_id")))
        has_stdout = "运行结果" in evidence["content"] and "(无标准输出)" not in evidence["content"]
        check("evidence stdout present (real execution)", has_stdout)
        sandbox_out = next(e for e in events if e["event"] == "sandbox-output")
        sb_data = json.loads(sandbox_out["data"])
        check("sandbox-output exit_code == 0", sb_data["exit_code"] == 0, f"exit={sb_data['exit_code']}")
        check("sandbox-output stdout non-empty", len(sb_data["stdout"]) > 0)
        check("evidence injected before final turns (re-injection)", evidence["seq"] < agent_turns[-1]["seq"])

        # Report (business dialect).
        r = await client.get(f"/api/conversations/{conversation_id}/report")
        r.raise_for_status()
        report = r.json()
        check("report kind == business", report["kind"] == "business")
        for key in ("feasibility", "risks", "valuation_lean", "recommendation"):
            check(f"business report.content has '{key}'", key in report["content"])

        # Evolution generated for the dispatched (founder) agent + apply/rollback.
        r = await client.get(f"/api/evolutions?agent_id={founder['id']}", headers=headers)
        r.raise_for_status()
        evolutions = r.json()
        check("evolution generated for dispatched agent", len(evolutions) >= 1)
        evo = evolutions[0]
        check("evolution diff has persona before/after", "before" in evo["diff"]["persona"])

        r = await client.post(f"/api/evolutions/{evo['id']}/apply", headers=headers, json={"applied": True})
        r.raise_for_status()
        check("evolution apply -> applied true", r.json()["applied"] is True)
        r = await client.post(f"/api/evolutions/{evo['id']}/apply", headers=headers, json={"applied": False})
        r.raise_for_status()
        check("evolution rollback -> applied false", r.json()["applied"] is False)

        # Marketplace round-trip + points economy.
        r = await client.post(
            "/api/marketplace",
            headers=headers,
            json={"kind": "agent", "ref_id": founder["id"], "title": "验证创始人分身", "price_points": 10},
        )
        r.raise_for_status()
        listing = r.json()
        buyer_token = await _register(client, "buyer")
        bh = {"Authorization": f"Bearer {buyer_token}"}
        r = await client.get("/api/marketplace/points", headers=bh)
        before = r.json()["points"]
        r = await client.post(f"/api/marketplace/{listing['id']}/fork", headers=bh)
        r.raise_for_status()
        fork = r.json()
        check("marketplace fork returns cloned agent", fork["agent"] is not None)
        check("forked agent has forked_from set", fork["agent"]["forked_from"] == founder["id"])
        r = await client.get("/api/marketplace/points", headers=bh)
        after = r.json()["points"]
        check("fork debited points", after == before - 10, f"{before} -> {after}")


async def cafe_matching_check() -> None:
    print("\n=== Café / empathy + profile matching (AE3) ===")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE) as client:
        token = await _register(client, "user")
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.get("/api/scenarios/cafe")
        r.raise_for_status()
        scenario = r.json()
        check("cafe scenario seeded (empathy)", scenario["kind"] == "empathy")

        teacher = await _create_agent(
            client, headers, "验证县城老师", 6,
            {"domain": "教育", "personality": ["温润"], "goals": "理解更大的世界", "tags": ["教师", "县城"]},
        )

        # No explicit opponent → match_by_profile picks a public NPC.
        r = await client.post(
            "/api/dispatches",
            headers=headers,
            json={"agent_id": teacher["id"], "scenario_id": scenario["id"],
                  "task_prompt": "和一个完全不同世界的人聊聊。", "match_by_profile": True},
        )
        r.raise_for_status()
        dispatch = r.json()
        check("profile matching found an opponent", dispatch["opponent_agent_id"] is not None,
              f"status={dispatch['status']}")
        check("matched opponent is not self", dispatch["opponent_agent_id"] != teacher["id"])
        conversation_id = dispatch["conversation_id"]

        events = await _consume_sse(client, conversation_id)
        end = json.loads(next(e for e in events if e["event"] == "conversation-end")["data"])
        check("cafe conversation completed", end["status"] == "completed")

        r = await client.get(f"/api/conversations/{conversation_id}/report")
        r.raise_for_status()
        report = r.json()
        check("report kind == empathy (dialect switched)", report["kind"] == "empathy")
        for key in ("common_ground", "emotional_insights", "takeaways"):
            check(f"empathy report.content has '{key}'", key in report["content"])


async def main() -> None:
    ae1_protocol_check()
    await pipeline_check()
    await cafe_matching_check()
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except SystemExit as exc:
        print(exc)
        sys.exit(1)
