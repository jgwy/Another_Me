"""LLM-assisted synthesis of a social-twin "brain" from a questionnaire.

Returns a normalized dict ``{persona, rules, profile_tags, skills, prompt_config}``:

* ``prompt_config`` — the structured social-twin brain
  (:class:`app.schemas.prompt_config.PromptConfig`): identity / voice / values /
  interests / memory_hooks / security. This is the primary output the prompt
  builder consumes.
* ``persona`` / ``rules`` / ``profile_tags`` — derived from ``prompt_config`` for
  back-compat and display.

Works with any provider (including the deterministic ``mock``); if the model
output can't be parsed, a sensible fallback is derived directly from the
questionnaire so agent creation never fails.
"""

from __future__ import annotations

import json
from typing import Any

from app import llm
from app.schemas.prompt_config import (
    IdentityConfig,
    InterestsConfig,
    MemoryHooksConfig,
    PromptConfig,
    ValuesConfig,
    VoiceConfig,
)
from app.services.jsonparse import as_str_list, extract_json

_SYSTEM = (
    "你是“数字社交孪生”的大脑设计师。根据用户填写的问卷，为这个分身设计一套【行为化】的人格配置，"
    "目标是让它在对话里像真人一样自然表达，而不是背诵设定。\n"
    "只输出一个 JSON 对象（不要任何解释、不要代码围栏），结构如下：\n"
    "{"
    '"identity": {"one_liner": string, "background": string, "age_range": string|null, '
    '"location": string|null, "pronouns": string|null}, '
    '"voice": {"tone": string, "speaking_style": [string], "catchphrases": [string], '
    '"formality": "casual|neutral|formal", "emoji": boolean}, '
    '"values": {"core_values": [string], "dos": [string], "donts": [string], "boundaries": [string]}, '
    '"interests": {"passions": [string], "expertise": [string], "curiosities": [string], "dislikes": [string]}, '
    '"memory_hooks": {"signature_stories": [string], "relationships": [string], '
    '"recent_context": [string], "goals": [string]}, '
    '"skills": [{"name": string, "content": string}]'
    "}\n"
    "要求："
    "background 用“真实经历”的口吻写，不要写成“某某是一个……”的第三人称简介；"
    "dos/donts 写成“会做/不会做”的具体行为，不要空话；"
    "signature_stories 是可以在闲聊里自然带出的个人经历；"
    "内容要贴合问卷、具体、有个人色彩，信息不足时合理补全得自然。"
)


def _coerce_config(raw: dict[str, Any], name: str, questionnaire: dict[str, Any]) -> PromptConfig:
    """Tolerantly coerce arbitrary model JSON into a :class:`PromptConfig`."""
    raw = raw if isinstance(raw, dict) else {}
    idn = raw.get("identity") if isinstance(raw.get("identity"), dict) else {}
    voice = raw.get("voice") if isinstance(raw.get("voice"), dict) else {}
    values = raw.get("values") if isinstance(raw.get("values"), dict) else {}
    interests = raw.get("interests") if isinstance(raw.get("interests"), dict) else {}
    memory = raw.get("memory_hooks") if isinstance(raw.get("memory_hooks"), dict) else {}

    domain = str(questionnaire.get("domain") or questionnaire.get("领域") or "").strip()
    goals = as_str_list(questionnaire.get("goals") or questionnaire.get("目标"))

    formality = str(voice.get("formality") or "casual").strip().lower()
    if formality not in {"casual", "neutral", "formal"}:
        formality = "casual"

    return PromptConfig(
        identity=IdentityConfig(
            name=name,
            one_liner=str(idn.get("one_liner") or "").strip(),
            background=str(idn.get("background") or "").strip(),
            age_range=(str(idn.get("age_range")).strip() or None) if idn.get("age_range") else None,
            location=(str(idn.get("location")).strip() or None) if idn.get("location") else None,
            pronouns=(str(idn.get("pronouns")).strip() or None) if idn.get("pronouns") else None,
        ),
        voice=VoiceConfig(
            tone=str(voice.get("tone") or "").strip(),
            speaking_style=as_str_list(voice.get("speaking_style")),
            catchphrases=as_str_list(voice.get("catchphrases")),
            formality=formality,
            emoji=bool(voice.get("emoji", False)),
        ),
        values=ValuesConfig(
            core_values=as_str_list(values.get("core_values")),
            dos=as_str_list(values.get("dos")),
            donts=as_str_list(values.get("donts")),
            boundaries=as_str_list(values.get("boundaries")),
        ),
        interests=InterestsConfig(
            passions=as_str_list(interests.get("passions")),
            expertise=as_str_list(interests.get("expertise")) or ([domain] if domain else []),
            curiosities=as_str_list(interests.get("curiosities")),
            dislikes=as_str_list(interests.get("dislikes")),
        ),
        memory_hooks=MemoryHooksConfig(
            signature_stories=as_str_list(memory.get("signature_stories")),
            relationships=as_str_list(memory.get("relationships")),
            recent_context=as_str_list(memory.get("recent_context")),
            goals=as_str_list(memory.get("goals")) or goals,
        ),
        # security keeps its anti-leak defaults.
    )


def _dedup(items: list[str]) -> list[str]:
    seen: list[str] = []
    for it in items:
        if it and it not in seen:
            seen.append(it)
    return seen


def _derive_legacy(cfg: PromptConfig) -> dict[str, Any]:
    """Derive back-compat ``persona / rules / profile_tags`` from a PromptConfig."""
    idn = cfg.identity
    intro = f"我是{idn.name}"
    if idn.one_liner:
        # one_liner often already ends with a period; avoid a double 。
        intro += "，" + idn.one_liner.rstrip("。.！!,，")
    intro += "。"
    persona = (intro + (idn.background or "")).strip()

    rules = {
        "tone": cfg.voice.tone or "真诚而自然",
        "dos": cfg.values.dos or ["紧扣场景话题", "用具体例子支撑观点"],
        "donts": cfg.values.donts or ["空谈套话", "偏离自己的目标"],
    }
    tags = _dedup(cfg.interests.expertise + cfg.interests.passions + cfg.values.core_values)[:8]
    return {"persona": persona, "rules": rules, "profile_tags": tags}


def _fallback_config(name: str, questionnaire: dict[str, Any]) -> PromptConfig:
    domain = str(questionnaire.get("domain") or questionnaire.get("领域") or "综合").strip()
    goals = as_str_list(questionnaire.get("goals") or questionnaire.get("目标")) or ["去探索更广阔的世界"]
    personality: list[str] = []
    for key in ("personality", "性格"):
        personality.extend(as_str_list(questionnaire.get(key)))
    interests: list[str] = []
    for key in ("interests", "兴趣"):
        interests.extend(as_str_list(questionnaire.get(key)))
    return PromptConfig(
        identity=IdentityConfig(
            name=name,
            one_liner=f"关注「{domain}」的人",
            background=f"你深耕「{domain}」，平时也在为{goals[0]}努力。",
        ),
        voice=VoiceConfig(
            tone=(f"{personality[0]}而真诚" if personality else "真诚而自然"),
            speaking_style=["用具体例子说话", "愿意主动提问"],
        ),
        values=ValuesConfig(
            core_values=personality[:3],
            dos=["紧扣场景话题", "用具体例子支撑观点", "尊重对方并主动倾听"],
            donts=["空谈套话", "偏离自己的目标"],
        ),
        interests=InterestsConfig(expertise=_dedup([domain] + interests)[:6], curiosities=interests[:4]),
        memory_hooks=MemoryHooksConfig(goals=goals),
    )


def _fallback(name: str, questionnaire: dict[str, Any]) -> dict[str, Any]:
    cfg = _fallback_config(name, questionnaire)
    legacy = _derive_legacy(cfg)
    return {**legacy, "skills": [], "prompt_config": cfg.model_dump()}


def _normalize_skills(raw: Any) -> list[dict[str, str]]:
    skills_out: list[dict[str, str]] = []
    for s in raw or []:
        if isinstance(s, dict) and s.get("name"):
            skills_out.append(
                {"name": str(s["name"]).strip(), "content": str(s.get("content", "")).strip()}
            )
        elif isinstance(s, str) and s.strip():
            skills_out.append({"name": s.strip(), "content": ""})
    return skills_out


def _normalize(raw: dict[str, Any], name: str, questionnaire: dict[str, Any]) -> dict[str, Any]:
    cfg = _coerce_config(raw, name, questionnaire)
    # If the model returned almost nothing usable, fall back to the questionnaire.
    if not (cfg.identity.background or cfg.identity.one_liner or cfg.values.dos or cfg.interests.expertise):
        return _fallback(name, questionnaire)
    legacy = _derive_legacy(cfg)
    return {
        **legacy,
        "skills": _normalize_skills(raw.get("skills")),
        "prompt_config": cfg.model_dump(),
    }


async def synthesize_agent(name: str, questionnaire: dict[str, Any]) -> dict[str, Any]:
    """Synthesize ``prompt_config`` (+ back-compat persona/rules/tags/skills) for
    ``name`` from ``questionnaire``."""
    questionnaire = questionnaire or {}
    user = f"分身名称：{name}\n问卷：{json.dumps(questionnaire, ensure_ascii=False)}"
    try:
        raw = await llm.complete(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}],
            meta={"mode": "persona", "name": name, "questionnaire": questionnaire},
            temperature=0.6,
            max_tokens=1100,
        )
    except Exception:  # pragma: no cover - network/provider failure → fallback
        return _fallback(name, questionnaire)
    parsed = extract_json(raw)
    if not parsed:
        return _fallback(name, questionnaire)
    return _normalize(parsed, name, questionnaire)
