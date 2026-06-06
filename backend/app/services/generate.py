"""Draft a social-twin brain from natural language or a personal corpus (§3.3).

Powers ``POST /api/agents/generate``: turn a free-form description ("nl" mode) or
pasted chats/writing ("corpus" mode) into a non-persisted
:class:`app.schemas.prompt_config.PromptConfig` draft plus back-compat
``persona / rules / profile_tags``, attachable ``skills``, and skill-creator-style
clarifying ``questions``.

This intentionally reuses the questionnaire-synthesis pipeline
(:mod:`app.services.synthesis`): we build a derived questionnaire from the input,
let the model emit one JSON object, and coerce it with the same tolerant helpers.
The deterministic ``mock`` provider renders ``meta["mode"] == "generate"`` via its
persona renderer, so the endpoint produces a coherent draft even without API keys.
Nothing here persists; the client reviews/tweaks the draft and POSTs to
``/api/agents``.
"""

from __future__ import annotations

import json
from typing import Any

from app import llm
from app.schemas.prompt_config import PromptConfig
from app.services.jsonparse import as_str_list, extract_json
from app.services.synthesis import (
    _SYSTEM,
    _coerce_config,
    _derive_legacy,
    _fallback,
    _normalize_skills,
)

# Default clarifying follow-ups for "nl" mode when the model returns none.
_DEFAULT_NL_QUESTIONS: list[str] = [
    "你最想让这个分身在对话里达成什么？",
    "它说话的语气更偏理性还是感性？",
    "有没有它一定不能碰的话题或底线？",
]

# Tell the model to add a top-level ``questions`` array to the same JSON object.
_QUESTIONS_INSTRUCTION = (
    "另外，在同一个 JSON 对象里再加一个字段 "
    '"questions": [string]，'
    "列出还需要用户澄清的简短追问（中文、每条一句话）；不需要追问时给空数组 []。"
)

# Mode-specific guidance appended after the shared synthesis system prompt.
_GUIDANCE_NL = (
    "本次是【自然语言】模式：用户用一段自由描述来定义这个分身。"
    "请据此合理推断人格配置；当关键信息明显不足时，像技能创建向导那样，"
    "在 questions 里提出 1–3 个最关键的澄清问题，问到点子上即可，不要追问过多。"
)
_GUIDANCE_CORPUS = (
    "本次是【语料】模式：用户粘贴了自己的聊天记录或文字作品。"
    "请从这些真实表达里【提炼建模】出 ta 的语气、口头禅、价值观与关注点，尽量贴近原文风格，"
    "不要凭空发挥。信息通常已足够，questions 留空，仅在确有必要时给极少量问题。"
)


def _build_questionnaire(name: str | None, input_text: str, mode: str, ctx: dict[str, Any]) -> dict[str, Any]:
    """Derive a synthesis-style questionnaire from the request + context hints.

    The keys mirror what :func:`app.services.synthesis` and the mock persona
    renderer read (``domain / goals / personality / interests``), so the same
    pipeline can drive draft generation.
    """
    questionnaire: dict[str, Any] = {
        "domain": str(name or ctx.get("domain") or "综合"),
        "goals": input_text[:80] or str(ctx.get("goals") or "探索更多可能"),
        "raw_input": input_text,
        "mode": mode,
    }
    # Fold in caller-provided hints (prior guided answers, partial profile, etc).
    for key in ("personality", "interests", "answers"):
        if ctx.get(key):
            questionnaire[key] = ctx[key]
    return questionnaire


def _system_prompt(mode: str) -> str:
    guidance = _GUIDANCE_NL if mode == "nl" else _GUIDANCE_CORPUS
    return "\n".join([_SYSTEM, _QUESTIONS_INSTRUCTION, guidance])


def _user_prompt(input_text: str, existing_config: dict[str, Any] | None, ctx: dict[str, Any]) -> str:
    user = input_text.strip() or "（用户暂未提供文字描述，请结合名称与已知线索合理生成。）"
    if existing_config:
        user += (
            "\n\n[需要优化的现有人格配置，请在其基础上改进而非推倒重来]\n"
            + json.dumps(existing_config, ensure_ascii=False)
        )
    prior = ctx.get("answers")
    if prior:
        user += "\n\n[用户已补充的澄清回答]\n" + json.dumps(prior, ensure_ascii=False)
    return user


def _default_questions(mode: str) -> list[str]:
    return list(_DEFAULT_NL_QUESTIONS) if mode == "nl" else []


def _assemble(name: str, base: dict[str, Any], questions: list[str]) -> dict[str, Any]:
    """Shape a synthesis-style ``base`` dict into the generate response draft.

    Guarantees ``prompt_config["identity"]["name"]`` matches the final name.
    """
    prompt_config = base.get("prompt_config") or {}
    identity = prompt_config.setdefault("identity", {})
    identity["name"] = name
    return {
        "name": name,
        "prompt_config": prompt_config,
        "persona": base.get("persona", ""),
        "rules": base.get("rules", {}),
        "profile_tags": base.get("profile_tags", []),
        "skills": base.get("skills", []),
        "questions": questions,
    }


async def generate_agent_draft(
    *,
    mode: str,
    input_text: str,
    name: str | None,
    context: dict,
) -> dict[str, Any]:
    """Draft a (non-persisted) social-twin brain from NL / corpus input.

    Returns ``{name, prompt_config, persona, rules, profile_tags, skills,
    questions}``. Robust by construction: any LLM/parse failure or an unusably
    empty draft falls back to a questionnaire-derived brain, so normal input
    never raises.
    """
    mode = (mode or "nl").strip().lower()
    if mode not in {"nl", "corpus"}:
        mode = "nl"
    input_text = input_text or ""
    ctx = context if isinstance(context, dict) else {}

    effective_name = name or "我的分身"
    derived_q = _build_questionnaire(name, input_text, mode, ctx)
    existing_config = ctx.get("prompt_config") if isinstance(ctx.get("prompt_config"), dict) else None

    parsed: dict[str, Any] | None = None
    try:
        raw = await llm.complete(
            [
                {"role": "system", "content": _system_prompt(mode)},
                {"role": "user", "content": _user_prompt(input_text, existing_config, ctx)},
            ],
            meta={"mode": "generate", "name": effective_name, "questionnaire": derived_q},
            temperature=0.6,
            max_tokens=1200,
        )
        parsed = extract_json(raw)
    except Exception:  # noqa: BLE001 - provider/parse failure → questionnaire fallback
        parsed = None

    if not parsed:
        return _assemble(effective_name, _fallback(effective_name, derived_q), _default_questions(mode))

    # Honor an explicit caller name; otherwise accept a model-proposed identity name.
    final_name = effective_name
    if not name:
        identity = parsed.get("identity")
        proposed = str(identity.get("name") or "").strip() if isinstance(identity, dict) else ""
        if proposed:
            final_name = proposed

    cfg: PromptConfig = _coerce_config(parsed, final_name, derived_q)
    if not (cfg.identity.background or cfg.identity.one_liner or cfg.values.dos or cfg.interests.expertise):
        return _assemble(final_name, _fallback(final_name, derived_q), _default_questions(mode))

    base = {
        **_derive_legacy(cfg),
        "skills": _normalize_skills(parsed.get("skills")),
        "prompt_config": cfg.model_dump(),
    }
    questions = as_str_list(parsed.get("questions"))
    if mode == "nl" and not questions:
        questions = list(_DEFAULT_NL_QUESTIONS)
    return _assemble(final_name, base, questions)
