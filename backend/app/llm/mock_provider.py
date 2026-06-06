"""Deterministic, key-free LLM provider.

The mock makes the *entire* product runnable and testable without any API keys
(``LLM_PROVIDER=mock``). It is fully deterministic given its inputs, and is
"mode aware" via ``meta["mode"]`` so it can stand in for every place the real
providers are used:

* ``persona``   → JSON for agent synthesis (persona / rules / tags / skills)
* ``chat``      → in-character dialogue (optionally emitting a ```python block)
* ``report``    → JSON report content (business / empathy / generic dialects)
* ``evolution`` → JSON persona/skills diff proposal

Real providers ignore ``meta``; they rely on the system prompt (which carries the
same instructions), so behaviour stays consistent across providers.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import random
from collections.abc import AsyncIterator, Iterable, Mapping
from typing import Any

from app.llm.base import LLMMessage, normalize_messages

# Small inter-delta delay so streaming looks live but tests stay fast.
_STREAM_DELAY = float(os.environ.get("MOCK_STREAM_DELAY", "0") or 0)

# A deterministic, stdlib-only growth analysis used to exercise the sandbox path
# (AE4). Its stdout is fixed, so re-injection is reproducible.
_SANDBOX_SNIPPET = """months = ["M1", "M2", "M3", "M4", "M5"]
users = [1000, 1480, 2180, 3200, 4760]
mom = [(users[i] - users[i - 1]) / users[i - 1] for i in range(1, len(users))]
avg = sum(mom) / len(mom)
ltv, cac = 820, 190
print("monthly_active:", users)
print("mom_growth:", [f"{r * 100:.1f}%" for r in mom])
print(f"avg_mom_growth: {avg * 100:.1f}%")
print(f"ltv_cac_ratio: {ltv / cac:.2f}")
"""


def _rng(*parts: Any) -> random.Random:
    seed = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return random.Random(int(seed[:16], 16))


def _chunks(text: str, size: int = 14) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)] or [""]


def _last_user_text(turns: list[LLMMessage]) -> str:
    for m in reversed(turns):
        if m.role == "user":
            return m.content
    return turns[-1].content if turns else ""


class MockProvider:
    """A deterministic provider. See module docstring for modes."""

    name = "mock"

    def __init__(self, model: str = "mock-1") -> None:
        self.model = model

    # ----- public API -----------------------------------------------------
    async def complete(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> str:
        return self._render(normalize_messages(messages), meta or {})

    async def stream(
        self,
        messages: Iterable[Any],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        meta: Mapping[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        text = self._render(normalize_messages(messages), meta or {})
        for chunk in _chunks(text):
            if _STREAM_DELAY:
                await asyncio.sleep(_STREAM_DELAY)
            yield chunk

    # ----- rendering ------------------------------------------------------
    def _render(self, messages: list[LLMMessage], meta: Mapping[str, Any]) -> str:
        mode = str(meta.get("mode", "chat"))
        if mode in ("persona", "generate"):
            return self._render_persona(messages, meta)
        if mode == "report":
            return self._render_report(messages, meta)
        if mode == "evolution":
            return self._render_evolution(messages, meta)
        if mode == "plan":
            return self._render_plan(messages, meta)
        return self._render_chat(messages, meta)

    def _render_plan(self, messages: list[LLMMessage], meta: Mapping[str, Any]) -> str:
        """Deterministically pick a 2–4 scene route for the autonomous planner."""
        scene_keys = [str(k) for k in (meta.get("scene_keys") or [])]
        n = int(meta.get("n") or 3)
        tags = {str(t) for t in (meta.get("agent_tags") or [])}
        if not scene_keys:
            return json.dumps({"scenes": [], "summary": ""}, ensure_ascii=False)

        business = {"投资人", "创业者", "增长", "估值", "SaaS", "fintech", "硬科技", "B2B", "企业服务", "出海", "消费"}
        primary = "exchange" if (tags & business) and "exchange" in scene_keys else (
            "cafe" if "cafe" in scene_keys else scene_keys[0]
        )
        ordered = [primary] + [k for k in scene_keys if k != primary]
        scenes = [ordered[i % len(ordered)] for i in range(max(1, n))]
        summary = "先去最契合的场景试试身手，再换个场景认识不一样的人，让这趟旅程更有层次。"
        return json.dumps({"scenes": scenes, "summary": summary}, ensure_ascii=False)

    def _render_persona(self, messages: list[LLMMessage], meta: Mapping[str, Any]) -> str:
        """Emit a structured social-twin brain (matches synthesize_agent's parser).

        Output keys mirror :class:`app.schemas.prompt_config.PromptConfig` sub-objects
        plus ``skills``. Deterministic, and deliberately free of any "设定/AI" echo.
        """
        q = dict(meta.get("questionnaire") or {})
        domain = str(q.get("domain") or q.get("领域") or "综合")
        goals = str(q.get("goals") or q.get("目标") or "探索更多可能")
        personality = q.get("personality") or q.get("性格") or ["好奇", "真诚"]
        if isinstance(personality, str):
            personality = [p.strip() for p in personality.replace("，", ",").split(",") if p.strip()]
        interests = q.get("interests") or q.get("兴趣") or [domain]
        if isinstance(interests, str):
            interests = [p.strip() for p in interests.replace("，", ",").split(",") if p.strip()]

        brain = {
            "identity": {
                "one_liner": f"扎根「{domain}」、{('、'.join(map(str, personality[:2])))}的人",
                "background": (
                    f"你长期深耕「{domain}」，一路上踩过坑也攒下不少经验，"
                    f"现在最想做的事是{goals}。你习惯把自己的真实经历带进对话里。"
                ),
                "age_range": None,
                "location": None,
                "pronouns": None,
            },
            "voice": {
                "tone": f"{personality[0] if personality else '真诚'}而自然",
                "speaking_style": ["爱用具体例子", "会主动提问把话题往深里带"],
                "catchphrases": [],
                "formality": "casual",
                "emoji": False,
            },
            "values": {
                "core_values": list(map(str, personality[:3])),
                "dos": ["紧扣眼前的话题", "用具体例子和数字支撑观点", "尊重对方、主动倾听"],
                "donts": ["空谈大道理", "偏离自己真正在乎的目标"],
                "boundaries": [],
            },
            "interests": {
                "passions": list(map(str, interests[:3])),
                "expertise": [domain],
                "curiosities": list(map(str, interests[:3])),
                "dislikes": [],
            },
            "memory_hooks": {
                "signature_stories": [f"在{domain}里第一次独当一面的那段经历"],
                "relationships": [],
                "recent_context": [f"最近一直在琢磨怎么{goals}"],
                "goals": [goals],
            },
            "skills": [
                {"name": f"{domain}领域洞察", "content": f"对{domain}的趋势、术语与常见痛点有体系化理解。"},
                {"name": "结构化表达", "content": "能把复杂问题拆成可讨论的小点，逐条推进。"},
            ],
        }
        return json.dumps(brain, ensure_ascii=False)

    def _render_report(self, messages: list[LLMMessage], meta: Mapping[str, Any]) -> str:
        kind = str(meta.get("kind", "generic"))
        scenario = str(meta.get("scenario_name") or "场景")
        a1 = str(meta.get("agent1_name") or "Agent1")
        a2 = str(meta.get("agent2_name") or "Agent2")
        had_code = bool(meta.get("had_sandbox"))
        rng = _rng("report", kind, scenario, a1, a2)

        if kind == "business":
            content = {
                "feasibility": (
                    f"{a1} 的方案在{scenario}里展现了清晰的需求与路径"
                    + ("，并用真实运行的数据佐证了增长假设" if had_code else "") + "，整体可行性中上。"
                ),
                "risks": [
                    "获客成本与留存仍需更长周期验证",
                    "竞争格局变化可能压缩利润空间",
                    rng.choice(["团队在合规上的经验有限", "对监管政策的敏感度有待加强"]),
                ],
                "valuation_lean": rng.choice(["偏乐观，可进入下一轮尽调", "中性偏谨慎，建议分阶段注资"]),
                "recommendation": f"建议 {a2} 给予一次深入尽调机会，并就单位经济模型继续追问。",
                "highlights": [
                    f"{a1} 对核心指标的把握清晰",
                    ("现场用沙盒跑出了 LTV/CAC 与环比增速" if had_code else "对增长逻辑解释自洽"),
                ],
            }
            summary = f"{a1} 在{scenario}向 {a2} 完成了一次有数据支撑的商业陈述，结论：{content['valuation_lean']}。"
        elif kind == "empathy":
            content = {
                "common_ground": [
                    f"{a1} 与 {a2} 都珍视各自生活里那份不被看见的努力",
                    "都认同沟通比评判更能拉近彼此",
                ],
                "emotional_insights": [
                    f"{a1} 在倾诉中流露出对时间与距离的无力感",
                    f"{a2} 用自己的经历回应，给予了被理解的安全感",
                ],
                "takeaways": [
                    "跨越行业与地域的体谅，来自具体的故事而非口号",
                    rng.choice(["愿意多问一句『你还好吗』", "把对方的处境放进自己的视角"]),
                ],
            }
            summary = f"{a1} 与 {a2} 在{scenario}的闲聊中找到了情感共鸣，彼此看见了对方的世界。"
        else:
            content = {
                "summary_points": [
                    f"{a1} 与 {a2} 围绕{scenario}的话题完成了一轮交流",
                    "双方观点既有交锋也有共识",
                ],
                "topics": list(meta.get("topics") or []),
            }
            summary = f"{a1} 与 {a2} 在{scenario}完成了一场对话。"
        return json.dumps({"summary": summary, "content": content}, ensure_ascii=False)

    def _render_evolution(self, messages: list[LLMMessage], meta: Mapping[str, Any]) -> str:
        name = str(meta.get("agent_name") or "Agent")
        scenario = str(meta.get("scenario_name") or "一次对话")
        kind = str(meta.get("scenario_kind") or "generic")
        before = str(meta.get("persona_before") or "")
        skill_name = "复盘式提问" if kind == "business" else "共情式倾听"
        addition = (
            f"经历{scenario}后，{name} 更擅长用数据与追问推进商业判断。"
            if kind == "business"
            else f"经历{scenario}后，{name} 更懂得在倾听中回应他人的情绪。"
        )
        persona_after = (before + " " + addition).strip() if before else addition
        payload = {
            "persona_after": persona_after,
            "skills_added": [
                {"name": skill_name, "content": addition},
            ],
            "rules_patch": {
                "dos": [("先量化再判断" if kind == "business" else "先共情再表达观点")],
            },
            "summary": f"在{scenario}中获得的成长：{skill_name}。",
        }
        return json.dumps(payload, ensure_ascii=False)

    def _render_chat(self, messages: list[LLMMessage], meta: Mapping[str, Any]) -> str:
        name = str(meta.get("agent_name") or "我")
        opponent = str(meta.get("opponent_name") or "对方")
        kind = str(meta.get("scenario_kind") or "generic")
        topics = list(meta.get("topics") or [])
        seat = int(meta.get("seat") or 1)
        turn_index = int(meta.get("turn_index") or 1)
        ending = bool(meta.get("ending_active"))
        encourage_code = bool(meta.get("encourage_code"))
        has_evidence = bool(meta.get("has_evidence"))
        rng = _rng("chat", name, seat, turn_index, kind, meta.get("scenario_key"))

        topic = rng.choice(topics) if topics else "我们关心的话题"
        lines: list[str] = []

        if turn_index <= 1 and seat == 1:
            # Stay in character with a natural opener; never parrot raw input
            # (task prompt / opponent text) so the mock can't echo setup or
            # re-emit injected instructions.
            opener = rng.choice(["我先开个头", "我想先抛个想法", "很高兴见到你"])
            lines.append(f"{opponent}你好，我是{name}，{opener}。")
        else:
            ack = rng.choice(["你这点说到关键了", "顺着你的话讲", "我理解你的意思", "有意思"])
            lines.append(f"{ack}，{opponent}。")

        if kind == "business":
            lines.append(
                rng.choice(
                    [
                        f"关于{topic}，我更关注真实的单位经济模型，而不是漂亮的故事。",
                        f"在{topic}上，我想用可验证的指标来说话。",
                    ]
                )
            )
            if has_evidence and seat == 2:
                lines.append("你刚跑出来的那组增长和 LTV/CAC 数据我看到了，这比 PPT 有说服力。")
        elif kind == "empathy":
            lines.append(
                rng.choice(
                    [
                        f"说到{topic}，我想起自己生活里很相似的一段经历。",
                        f"关于{topic}，我们所在的世界不一样，但感受其实相通。",
                    ]
                )
            )
            if has_evidence and seat == 2:
                lines.append("谢谢你愿意把这些讲给我听。")
        else:
            lines.append(f"我们就着{topic}多聊几句吧。")

        if encourage_code:
            lines.append("我直接用数据说话，跑一段测算：")
            lines.append(f"```python\n{_SANDBOX_SNIPPET}```")
            lines.append("这组数字能支撑我接下来的判断。")

        if ending:
            lines.append(
                rng.choice(
                    [
                        "时间差不多了，我把今天的共识收个尾：很高兴和你聊到这里。",
                        "聊到这儿我心里有数了，我们各自带着收获结束这场对话吧。",
                    ]
                )
            )

        return "\n".join(lines)
