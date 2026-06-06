"""Postcards + trip-summary content (§7).

A **postcard** is a lightweight souvenir / reusable takeaway from a single
encounter; a **trip summary** aggregates the per-encounter reports into the
whole-journey report. Both are derived deterministically from the reports the
conversation engine already produced (no extra LLM round-trips), so they never
add a failure surface to the journey.
"""

from __future__ import annotations

from typing import Any

from app.models import Agent, Report, Scenario

_SCENARIO_EMOJI = {"exchange": "💹", "cafe": "☕", "lab": "🧪", "coding_club": "💻"}


def _emoji(scenario_key: str | None) -> str:
    return _SCENARIO_EMOJI.get(scenario_key or "", "📍")


def _trim(items: Any, n: int) -> list[str]:
    out: list[str] = []
    for it in items or []:
        s = str(it).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= n:
            break
    return out


def _reusable_prompt(kind: str, content: dict[str, Any], scenario_name: str) -> str:
    """A small, reusable tip the user can carry forward (codex reusablePrompt idea)."""
    if kind == "business":
        lean = str(content.get("valuation_lean") or "").strip()
        tail = f"（这次的倾向：{lean}）" if lean else ""
        return f"下次在{scenario_name}路演时，先用真实数据讲清单位经济模型，再谈愿景{tail}。"
    if kind == "empathy":
        return f"和{scenario_name}里遇到的人聊天时，多问一句近况、用具体的小故事去回应，连接会更真。"
    return f"在{scenario_name}里，先找到共同关心的话题，再顺着对方的话深入。"


def build_postcard(
    scenario: Scenario | None,
    agent: Agent,
    opponent: Agent | None,
    report: Report | None,
) -> dict[str, Any]:
    """Build a lightweight, reusable souvenir from an encounter's report."""
    kind = getattr(report, "kind", None) or (getattr(scenario, "kind", "generic"))
    content = dict(getattr(report, "content", None) or {})
    scenario_key = getattr(scenario, "key", None)
    scenario_name = getattr(scenario, "name", None) or "旅途"
    opponent_name = getattr(opponent, "name", None) or "一位新朋友"

    if kind == "business":
        highlight = (
            str(content.get("recommendation") or "").strip()
            or (_trim(content.get("highlights"), 1) or [""])[0]
            or "完成了一次有数据支撑的商业对话。"
        )
        takeaways = _trim(content.get("highlights"), 2) + _trim(content.get("risks"), 1)
    elif kind == "empathy":
        takeaways = _trim(content.get("takeaways"), 2) + _trim(content.get("common_ground"), 1)
        highlight = (
            (_trim(content.get("takeaways"), 1) or [""])[0]
            or (_trim(content.get("emotional_insights"), 1) or [""])[0]
            or "在一杯咖啡的时间里，看见了另一个世界。"
        )
    else:
        takeaways = _trim(content.get("summary_points"), 3)
        highlight = (takeaways[0] if takeaways else "完成了一场对话。")

    return {
        "title": f"{_emoji(scenario_key)} 在{scenario_name}遇见{opponent_name}",
        "scenario_key": scenario_key,
        "scenario_name": scenario_name,
        "with": opponent_name,
        "kind": kind,
        "highlight": highlight,
        "takeaways": _trim(takeaways, 3),
        "reusable_prompt": _reusable_prompt(kind, content, scenario_name),
        "emoji": _emoji(scenario_key),
    }


def build_trip_summary(
    agent: Agent,
    task_prompt: str,
    legs: list[dict[str, Any]],
) -> tuple[str, dict[str, Any]]:
    """Aggregate per-encounter legs into a (summary, content) for the trip report.

    ``legs`` is a list of dicts like
    ``{scenario_name, scenario_key, opponent, kind, report_id, headline, postcard}``.
    """
    names = [leg.get("scenario_name") for leg in legs if leg.get("scenario_name")]
    opponents = _trim([leg.get("opponent") for leg in legs], 8)
    highlights = _trim([leg.get("headline") for leg in legs], 6)

    scene_phrase = "、".join(_trim(names, 6)) if names else "几个场景"
    summary = (
        f"{agent.name} 完成了一趟包含 {len(legs)} 段邂逅的旅行，"
        f"走过{scene_phrase}，遇见了{('、'.join(opponents) if opponents else '一些新朋友')}。"
    )
    content = {
        "kind": "trip_summary",
        "task_prompt": task_prompt,
        "encounters": [
            {
                "seq": leg.get("seq"),
                "scenario_key": leg.get("scenario_key"),
                "scenario_name": leg.get("scenario_name"),
                "opponent": leg.get("opponent"),
                "kind": leg.get("kind"),
                "report_id": leg.get("report_id"),
                "conversation_id": leg.get("conversation_id"),
                "headline": leg.get("headline"),
            }
            for leg in legs
        ],
        "highlights": highlights,
        "relationships_touched": opponents,
    }
    return summary, content
