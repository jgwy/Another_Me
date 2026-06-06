"""Post-conversation report generation, dialect chosen by ``scenario.kind``.

* ``business`` (exchange) → feasibility / risks / valuation_lean / recommendation
* ``empathy``  (cafe)     → common_ground / emotional_insights / takeaways
* ``generic``             → summary_points / topics
"""

from __future__ import annotations

from app import llm
from app.models import Agent, Conversation, Message, Report, Scenario
from app.services.jsonparse import as_str_list, extract_json

_SYSTEM = {
    "business": (
        "你是一位资深投资分析师。基于下面这场『创业者 × 投资人』的对话，输出一份商业评估。"
        "只输出 JSON：{\"summary\": string, \"content\": {\"feasibility\": string, \"risks\": [string], "
        "\"valuation_lean\": string, \"recommendation\": string, \"highlights\": [string]}}"
    ),
    "empathy": (
        "你是一位善于洞察人心的观察者。基于下面这场跨行业/跨地域的闲聊，输出一份见闻共情总结。"
        "只输出 JSON：{\"summary\": string, \"content\": {\"common_ground\": [string], "
        "\"emotional_insights\": [string], \"takeaways\": [string]}}"
    ),
    "generic": (
        "请基于下面的对话输出一份简要总结。只输出 JSON："
        "{\"summary\": string, \"content\": {\"summary_points\": [string], \"topics\": [string]}}"
    ),
}


def _transcript(messages: list[Message], names: dict) -> str:
    lines: list[str] = []
    for m in messages:
        if m.sender == "agent":
            who = names.get(m.agent_id, "某位")
            lines.append(f"[对话{m.turn_index}] {who}：{m.content}")
        elif m.sender == "sandbox":
            lines.append(f"[沙盒运行结果] {m.content}")
    return "\n".join(lines)


def _normalize_content(kind: str, content: dict) -> dict:
    if not isinstance(content, dict):
        content = {}
    if kind == "business":
        return {
            "feasibility": str(content.get("feasibility") or "对话信息有限，可行性有待进一步验证。"),
            "risks": as_str_list(content.get("risks")) or ["关键数据仍需更多验证"],
            "valuation_lean": str(content.get("valuation_lean") or "中性"),
            "recommendation": str(content.get("recommendation") or "建议进一步沟通后再做决定。"),
            "highlights": as_str_list(content.get("highlights")),
        }
    if kind == "empathy":
        return {
            "common_ground": as_str_list(content.get("common_ground")) or ["都在认真生活"],
            "emotional_insights": as_str_list(content.get("emotional_insights")),
            "takeaways": as_str_list(content.get("takeaways")),
        }
    return {
        "summary_points": as_str_list(content.get("summary_points")),
        "topics": as_str_list(content.get("topics")),
    }


async def generate_report(
    session,
    conversation: Conversation,
    scenario: Scenario,
    agents: list[Agent],
    messages: list[Message],
) -> Report:
    kind = scenario.kind if scenario.kind in ("business", "empathy") else "generic"
    names = {a.id: a.name for a in agents}
    a1 = agents[0].name if agents else "Agent1"
    a2 = agents[1].name if len(agents) > 1 else "Agent2"
    had_sandbox = any(m.sender == "sandbox" for m in messages)

    user = (
        f"场景：{scenario.name}（话题：{'、'.join(scenario.topics or [])}）\n\n"
        f"对话记录：\n{_transcript(messages, names)}"
    )
    raw = await llm.complete(
        [{"role": "system", "content": _SYSTEM[kind]}, {"role": "user", "content": user}],
        meta={
            "mode": "report",
            "kind": kind,
            "scenario_name": scenario.name,
            "agent1_name": a1,
            "agent2_name": a2,
            "had_sandbox": had_sandbox,
            "topics": list(scenario.topics or []),
        },
        temperature=0.5,
        max_tokens=1000,
    )
    parsed = extract_json(raw) or {}
    summary = str(parsed.get("summary") or f"{a1} 与 {a2} 在{scenario.name}完成了一场对话。")
    content = _normalize_content(kind, parsed.get("content") or {})

    report = Report(conversation_id=conversation.id, kind=kind, summary=summary, content=content)
    session.add(report)
    await session.flush()
    return report
