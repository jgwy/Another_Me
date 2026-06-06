"""Prompt construction for a single agent turn.

Builds the system prompt (persona + rules + skills + scenario + optional ending /
run_code instructions) and the message list from the acting agent's point of
view (own lines = assistant, opponent + sandbox evidence = user).
"""

from __future__ import annotations

from typing import Any

from app.models import Agent, Message, Scenario

_RUN_CODE_INSTRUCTIONS = (
    "你可以使用一个真实的代码沙盒来支撑论点。当需要用数据或计算证明观点时，"
    "直接在回答里输出一个 ```python 代码块（仅标准库，无网络、无密钥），"
    "系统会真实运行它并把 stdout 作为证据回注到对话中。不要编造运行结果。"
)


def _skills_block(agent: Agent) -> str:
    if not agent.skills:
        return ""
    lines = [f"- {s.name}：{s.content}" if s.content else f"- {s.name}" for s in agent.skills]
    return "你的技能：\n" + "\n".join(lines)


def build_system_prompt(
    agent: Agent,
    scenario: Scenario,
    *,
    opponent_name: str,
    ending_active: bool,
    can_run_code: bool,
) -> str:
    rules = agent.rules or {}
    tone = rules.get("tone")
    dos = rules.get("dos") or []
    donts = rules.get("donts") or []
    topics = "、".join(scenario.topics or [])

    parts: list[str] = [
        f"你是「{agent.name}」。{agent.persona}",
        f"当前场景：{scenario.name} —— {scenario.description}",
        scenario.scene_prompt,
    ]
    if topics:
        parts.append(f"可聊的话题方向：{topics}。")
    if tone:
        parts.append(f"语气：{tone}。")
    if dos:
        parts.append("要做到：" + "；".join(map(str, dos)) + "。")
    if donts:
        parts.append("要避免：" + "；".join(map(str, donts)) + "。")
    skills = _skills_block(agent)
    if skills:
        parts.append(skills)
    parts.append(f"你的对话对象是「{opponent_name}」。")
    if can_run_code:
        parts.append(_RUN_CODE_INSTRUCTIONS)
    if ending_active:
        parts.append("【收尾阶段】" + scenario.ending_prompt + " 请自然地把对话引向结束，不要再开启全新话题。")
    parts.append("请只以你自己的身份发言，使用中文，自然口语，控制在 2-5 句；不要替对方说话，不要加旁白或括号说明。")
    return "\n\n".join(p for p in parts if p)


def build_turn_messages(
    agent: Agent,
    scenario: Scenario,
    *,
    opponent_name: str,
    task_prompt: str,
    ending_active: bool,
    can_run_code: bool,
    history: list[Message],
) -> list[dict[str, str]]:
    system = build_system_prompt(
        agent,
        scenario,
        opponent_name=opponent_name,
        ending_active=ending_active,
        can_run_code=can_run_code,
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]

    opener = scenario.scene_prompt
    if task_prompt:
        opener += f"\n\n本次出动的任务：{task_prompt}"
    opener += f"\n\n请以「{agent.name}」的身份开始或继续这场对话。"
    messages.append({"role": "user", "content": opener})

    for m in history:
        if m.sender == "system":
            continue
        if m.sender == "sandbox":
            messages.append({"role": "user", "content": f"[沙盒运行结果]\n{m.content}"})
        else:
            role = "assistant" if m.agent_id == agent.id else "user"
            messages.append({"role": role, "content": m.content})
    return messages


def turn_meta(
    agent: Agent,
    scenario: Scenario,
    *,
    opponent_name: str,
    seat: int,
    turn_index: int,
    n_rounds: int,
    ending_active: bool,
    can_run_code: bool,
    encourage_code: bool,
    has_evidence: bool,
    task_prompt: str,
) -> dict[str, Any]:
    """Structured hints the deterministic mock provider uses (ignored by real ones)."""
    return {
        "mode": "chat",
        "agent_name": agent.name,
        "opponent_name": opponent_name,
        "scenario_key": scenario.key,
        "scenario_kind": scenario.kind,
        "topics": list(scenario.topics or []),
        "seat": seat,
        "turn_index": turn_index,
        "n_rounds": n_rounds,
        "ending_active": ending_active,
        "can_run_code": can_run_code,
        "encourage_code": encourage_code,
        "has_evidence": has_evidence,
        "task_prompt": task_prompt,
    }
