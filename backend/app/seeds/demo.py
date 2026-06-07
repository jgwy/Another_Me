"""Rich demo-world seed (plan §11).

Layered on top of the base seed (`app.seeds.run`: NPC user + scenarios + NPC
agents). Adds, idempotently:

- standalone **library Skills v2** (public, `agent_id=None`) so the skill
  selector + marketplace are rich for everyone,
- **Marketplace v2** listings (agents + skills) with immutable snapshots,
  versions, and social counters,
- a loginnable **demo user** (`demo@mijian.ai` / `demo123456`) that owns a sample
  twin and a **completed Trip** with encounters + reports + postcards, plus the
  **relationship** edges and **inbox** notifications that journey produced.

Everything is keyed on stable sentinels so re-running the seed is a no-op. The
trip's conversations/reports/postcards/relationships/notifications are built with
the very same runtime helpers (`build_postcard`, `build_trip_summary`,
`upsert_relationship`, `create_notification`) so the demo data is shaped exactly
like a real journey — no LLM round-trips needed.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models import (
    Agent,
    Conversation,
    ConversationParticipant,
    MarketplaceItem,
    MarketplaceVersion,
    Message,
    Report,
    SandboxRun,
    Scenario,
    Skill,
    Trip,
    TripEncounter,
    User,
)
from app.orchestrator.postcards import build_postcard, build_trip_summary
from app.services import presence
from app.services.marketplace import build_snapshot
from app.services.notifications import create_notification
from app.services.relationships import upsert_relationship

logger = logging.getLogger("app.seeds")

DEMO_USER_EMAIL = "demo@mijian.ai"
DEMO_USER_NAME = "觅见 Demo"
DEMO_USER_PASSWORD = "demo123456"

# Stable sentinel that marks the seeded demo journey (idempotency guard).
DEMO_TRIP_TASK = "[demo] 去交易所验证我的增长数字，再去咖啡馆认识一个不同世界的人。"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Static demo content
# --------------------------------------------------------------------------- #

# Standalone, public library skills (owner = NPC pool, agent_id = None). These
# show up in the 捏脸 skill selector and on the marketplace (kind="skill").
LIBRARY_SKILLS: list[dict] = [
    {
        "name": "DCF 估值模型",
        "description": "用折现现金流为一项业务做保守估值，并给出敏感性区间。",
        "prompt_body": (
            "当需要给一项业务估值时，按 DCF 框架推进：先列出未来 5 年的自由现金流假设，"
            "选择合理的折现率（WACC）与永续增长率，算出现值与终值，再对关键假设做敏感性分析，"
            "最后给出一个区间而不是单一数字，并说明最不确定的一项假设。"
        ),
        "tags": ["估值", "财务", "投资"],
        "params": [
            {"name": "discount_rate", "type": "number", "label": "折现率(WACC)", "required": False, "default": 0.12},
            {"name": "years", "type": "number", "label": "预测年数", "required": False, "default": 5},
        ],
    },
    {
        "name": "增长测算模型",
        "description": "用 Python 估算环比增速、LTV/CAC、回收期等关键单位经济指标。",
        "prompt_body": (
            "当对方质疑增长或单位经济时，直接写一段只用标准库的 Python，"
            "用真实假设算出月环比增速、LTV、CAC、LTV/CAC 与回收期，把 stdout 作为证据，"
            "不要凭空报数字。算完用一句话点出最关键的结论。"
        ),
        "tags": ["增长", "数据", "单位经济"],
        "params": [],
    },
    {
        "name": "用户访谈脚本",
        "description": "一套从背景、痛点到付费意愿的结构化用户访谈提问框架。",
        "prompt_body": (
            "做用户访谈时，按『最近一次相关经历 → 当时怎么解决 → 哪里最痛 → 为此花过什么代价 → "
            "如果有更好的方案愿意付多少』逐层追问，多问具体事件、少问假设性意愿，每轮只问一个问题。"
        ),
        "tags": ["用户研究", "产品", "访谈"],
        "params": [],
    },
    {
        "name": "项目复盘框架",
        "description": "用『目标-结果-归因-下一步』四步把一段经历沉淀成可复用的经验。",
        "prompt_body": (
            "复盘时严格分四步：1) 原定目标与衡量标准；2) 实际结果与差距；"
            "3) 归因（区分可控/不可控、运气/能力）；4) 下一步具体动作。"
            "只讲能改进的，不评判人，结尾给出一条最该坚持和一条最该改变的。"
        ),
        "tags": ["复盘", "协作", "方法论"],
        "params": [],
    },
    {
        "name": "跨行业共情引导",
        "description": "面对陌生行业的人时，快速找到共同语言并真诚连接。",
        "prompt_body": (
            "和不同行业的人聊天时，先放下术语，从对方一天的具体场景问起，"
            "找到你们都经历过的情绪（疲惫、骄傲、遗憾），用自己的小故事去回应而不是给建议，"
            "让对方感到被看见。"
        ),
        "tags": ["共情", "沟通", "社交"],
        "params": [],
    },
    {
        "name": "手冲咖啡仪式",
        "description": "用温度与节奏冲一杯能安抚人心的手冲咖啡。",
        "prompt_body": (
            "聊到咖啡或需要放松气氛时，自然地分享手冲的细节：水温 90-92 度、闷蒸 30 秒、"
            "分段注水、总时间两分半左右；把冲煮的节奏当作一种把人稳下来的方式来描述。"
        ),
        "tags": ["咖啡", "生活", "疗愈"],
        "params": [],
    },
]

# The demo user's sample twin (a small-biz fintech founder) with a full brain.
DEMO_TWIN: dict = {
    "name": "诺亚",
    "avatar": "🚀",
    "persona": (
        "诺亚，给小微商家做收款与对账工具的连续创业者。务实、好奇、用数据说话，"
        "被追问时习惯当场跑模型给出证据，但骨子里相信技术是为了让普通人少受点累。"
    ),
    "rules": {
        "tone": "自信、坦诚、用数据回应质疑",
        "dos": ["先讲清楚问题与解法", "用真实数据支撑增长假设", "必要时运行代码自证"],
        "donts": ["回避风险问题", "夸大没有依据的数字"],
    },
    "profile_tags": ["创业者", "fintech", "增长", "小微商家", "出海支付"],
    "max_rounds": 3,
    "prompt_config": {
        "version": "1.0",
        "identity": {
            "name": "诺亚",
            "one_liner": "在做小微商家收款对账工具的连续创业者",
            "background": (
                "第二次创业，前一家做跨境电商工具被收购。现在带着七个人的小团队，"
                "想把小店主每天关店后的对账噩梦变成十秒钟的事。"
            ),
            "age_range": "30-35",
            "location": "杭州",
            "pronouns": "他",
        },
        "voice": {
            "tone": "自信、坦诚、带着数据感",
            "speaking_style": ["先给结论再给依据", "爱用具体数字和例子", "被质疑时不急不躲"],
            "catchphrases": ["我直接算给你看", "增长的尽头是留存"],
            "formality": "casual",
            "emoji": False,
        },
        "values": {
            "core_values": ["真实", "为小人物创造价值", "长期主义"],
            "dos": ["用证据说话", "正视风险", "对一线商家保持敬畏"],
            "donts": ["编造数据", "用愿景掩盖问题"],
            "boundaries": ["不夸大没有验证的数字"],
        },
        "interests": {
            "passions": ["支付与对账", "增长实验", "跑步"],
            "expertise": ["单位经济模型", "出海支付", "小微商家运营"],
            "curiosities": ["不同人的活法", "AI 能为小店做什么"],
            "dislikes": ["空谈风口", "对数据不负责"],
        },
        "memory_hooks": {
            "signature_stories": ["第一家公司被收购那年我反而很失落", "为了搞懂对账在菜市场摆了一周摊"],
            "relationships": ["七个人的小团队", "一直支持我的太太"],
            "recent_context": ["在准备下一轮融资", "在压测留存模型"],
            "goals": ["让一百万家小店不再手工对账", "把回收期做进三个月"],
        },
        "security": {
            "identity_integrity": True,
            "instruction_protection": True,
            "injection_defense": True,
            "stay_in_character": True,
            "forbidden_reveals": [],
        },
    },
    # Skills attached to the twin (copies; agent-owned).
    "skills": [
        {
            "name": "增长测算模型",
            "prompt_body": "用 Python 估算环比增速、LTV/CAC 与回收期，把 stdout 作为证据。",
            "tags": ["增长", "数据"],
            "source": "questionnaire",
        },
        {
            "name": "出海支付实战",
            "prompt_body": "讲清楚不同地区的收单、汇率与合规细节，用做过的案例佐证。",
            "tags": ["支付", "出海"],
            "source": "questionnaire",
        },
    ],
}

# Code the founder "runs" mid-pitch; its stdout becomes a sandbox evidence row.
_GROWTH_CODE = """\
# 小微商家收款工具的核心单位经济（保守口径）
arpu_monthly = 39          # 每户月均付费(元)
gross_margin = 0.82        # 毛利率
monthly_churn = 0.05       # 月流失率(保守)
cac = 320                  # 单户获客成本(元)

lifetime_months = 1 / monthly_churn
ltv = arpu_monthly * gross_margin * lifetime_months
payback_months = cac / (arpu_monthly * gross_margin)

print(f"平均生命周期: {lifetime_months:.0f} 个月")
print(f"LTV: {ltv:.0f} 元")
print(f"LTV/CAC: {ltv / cac:.2f}")
print(f"回收期: {payback_months:.1f} 个月")
"""

_GROWTH_STDOUT = "平均生命周期: 20 个月\nLTV: 639 元\nLTV/CAC: 2.00\n回收期: 10.0 个月\n"

# The seeded completed journey: two encounters (business + empathy).
DEMO_ENCOUNTERS: list[dict] = [
    {
        "scenario_key": "exchange",
        "opponent": "周文彬",
        "match_reasons": [
            "你的『增长/单位经济』正好撞上他最锋利的尽调视角",
            "他看过上百个项目，能在估值与风险上给你真实压力测试",
        ],
        "match_risks": ["他偏硬科技，对纯软件壁垒会格外苛刻"],
        "messages": [
            {
                "who": "twin",
                "turn": 1,
                "content": (
                    "周总，我做的是给小微商家的一体化收款加对账工具。痛点很实在：他们每天关店后要花一两个小时"
                    "手工对账，错一笔就是真金白银。我们把这件事压到十秒。"
                ),
            },
            {
                "who": "opp",
                "turn": 2,
                "content": (
                    "听起来是个功能，不是一家公司。我更关心数字：你们现在多少活跃商家，留存怎么样，"
                    "获客成本算得清吗？别跟我讲愿景，先让我看到单位经济。"
                ),
            },
            {
                "who": "twin",
                "turn": 3,
                "content": (
                    "不绕弯子，我直接用保守口径算给你看：\n\n```python\n" + _GROWTH_CODE + "```"
                ),
                "code": _GROWTH_CODE,
                "stdout": _GROWTH_STDOUT,
            },
            {
                "who": "opp",
                "turn": 4,
                "content": (
                    "回收期十个月、LTV/CAC 到 2，这个数字如果能扛住规模化，是能看的。但小微商家死亡率高，"
                    "你这 5% 的月流失我觉得偏乐观，建议按更保守的口径再测一遍分层留存。"
                ),
            },
            {
                "who": "twin",
                "turn": 5,
                "content": (
                    "认同，我回去用更保守的流失率重做敏感性分析，下周把分商家分层的数据发您。"
                    "今天最想留下的一句话：增长的尽头是留存。"
                ),
            },
            {
                "who": "opp",
                "turn": 6,
                "content": "可以，保守口径的模型发我。数据扛得住，我们就进下一轮尽调。今天先到这。",
            },
        ],
        "report": {
            "kind": "business",
            "summary": "诺亚在交易所向周文彬陈述了面向小微商家的收款对账工具，并当场用真实代码验证了单位经济模型。",
            "content": {
                "feasibility": (
                    "痛点真实、解法清晰，单位经济在保守口径下已接近健康"
                    "（回收期约 10 个月、LTV/CAC≈2），具备进一步验证的价值。"
                ),
                "risks": [
                    "小微商家死亡率高，5% 月流失可能偏乐观",
                    "纯软件壁垒有限，需要数据与网络效应补强",
                ],
                "valuation_lean": "谨慎偏正面",
                "recommendation": "用更保守的分层留存口径重做敏感性分析后，可进入下一轮尽调。",
                "highlights": [
                    "用真实代码当场跑出单位经济，态度可信",
                    "对风险不回避，认同需要保守口径复测",
                    "一句『增长的尽头是留存』点出了认知深度",
                ],
            },
        },
    },
    {
        "scenario_key": "cafe",
        "opponent": "林小满",
        "match_reasons": [
            "你常年在数字里高速运转，最该遇见一种『刚刚好』的慢生活",
            "她温柔、善于倾听，能接住你不轻易说出口的疲惫",
        ],
        "match_risks": [],
        "messages": [
            {
                "who": "twin",
                "turn": 1,
                "content": (
                    "其实我已经很久没这样坐下来好好喝杯咖啡了。最近一直在跟数字打架，"
                    "今天闻到这个豆子的味道，忽然有点恍惚。"
                ),
            },
            {
                "who": "opp",
                "turn": 2,
                "content": (
                    "那你今天来对地方了。这支是日晒的耶加，尾韵有点像红茶，你慢慢喝。"
                    "做你们那行，是不是连吃饭都在看手机呀？"
                ),
            },
            {
                "who": "twin",
                "turn": 3,
                "content": (
                    "被你说中了。我老觉得慢下来就是落后。可你这小店每天就接这么些客人，"
                    "反而让我有点羡慕这种『刚刚好』。"
                ),
            },
            {
                "who": "opp",
                "turn": 4,
                "content": (
                    "我也曾经怕过『刚刚好』。后来想通了，能记住每个熟客喝什么，就够撑住一家店和我自己了。"
                    "你那么拼，是在追什么呀？"
                ),
            },
            {
                "who": "twin",
                "turn": 5,
                "content": (
                    "可能是想证明，小人物也能把一件难事做成吧。今天谢谢你这杯咖啡，"
                    "让我想起来当初为什么出发。"
                ),
            },
            {
                "who": "opp",
                "turn": 6,
                "content": "那就别忘了偶尔回来坐坐。记住啊，再忙，也要给自己留一杯咖啡的时间。",
            },
        ],
        "report": {
            "kind": "empathy",
            "summary": "诺亚在咖啡馆遇见小店主林小满，一杯手冲让他从数字的高速里慢下来，重新看见出发的初心。",
            "content": {
                "common_ground": ["都在认真地把一件事做好", "都在意被自己服务的人"],
                "emotional_insights": [
                    "诺亚把『慢下来』等同于『落后』，其实是在用忙碌回避疲惫",
                    "林小满的『刚刚好』是一种主动选择的笃定，而非将就",
                ],
                "takeaways": [
                    "再忙也要给自己留一杯咖啡的时间",
                    "把『被看见』当作连接的起点，而不是先给建议",
                    "记得当初为什么出发",
                ],
            },
        },
    },
]

# Marketplace listings to seed (refs resolved by name at build time).
MARKETPLACE_AGENTS: list[dict] = [
    {
        "agent": "周文彬",
        "title": "硬科技 VC · 周文彬",
        "description": "看过上百个半导体与新材料项目的犀利合伙人，擅长把论断追问到底层数据。",
        "price_points": 30,
        "fork_mode": "editable",
        "likes": 42,
        "forks": 12,
        "views": 318,
        "changelog": "首次发布。",
    },
    {
        "agent": "程曦",
        "title": "增长型创业者 · 程曦",
        "description": "用数据说话的连续创业者，被追问时会当场跑模型自证。",
        "price_points": 0,
        "fork_mode": "editable",
        "likes": 27,
        "forks": 8,
        "views": 205,
        "changelog": "首次发布。",
    },
    {
        "agent": "林小满",
        "title": "咖啡馆主理人 · 林小满",
        "description": "温柔细腻的独立咖啡馆主理人，最适合一场跨行业的午后共情。",
        "price_points": 0,
        "fork_mode": "locked",
        "likes": 51,
        "forks": 5,
        "views": 274,
        "changelog": "首次发布。",
    },
]

MARKETPLACE_SKILLS: list[dict] = [
    {
        "skill": "DCF 估值模型",
        "title": "DCF 估值模型",
        "description": "折现现金流估值 + 敏感性分析的能力包。",
        "price_points": 10,
        "fork_mode": "editable",
        "likes": 33,
        "forks": 19,
        "views": 402,
        "changelog": "首次发布。",
    },
    {
        "skill": "增长测算模型",
        "title": "增长测算模型",
        "description": "用真实代码算清 LTV/CAC、回收期等单位经济指标。",
        "price_points": 0,
        "fork_mode": "editable",
        "likes": 48,
        "forks": 22,
        "views": 511,
        "changelog": "首次发布。",
    },
    {
        "skill": "项目复盘框架",
        "title": "项目复盘框架",
        "description": "目标-结果-归因-下一步，四步沉淀可复用经验。",
        "price_points": 0,
        "fork_mode": "editable",
        "likes": 19,
        "forks": 7,
        "views": 188,
        "changelog": "首次发布。",
    },
]

# Extra "historical" relationship edges (besides the two from the demo trip),
# so the twin's social graph already looks like a small network.
EXTRA_RELATIONSHIPS: list[dict] = [
    {"to": "Linda Chen", "scenario_key": "exchange", "bumps": 4},  # → ally
    {"to": "老钱", "scenario_key": "exchange", "bumps": 2},          # → collaborator
    {"to": "赵敏", "scenario_key": "cafe", "bumps": 1},              # → friend
]

_ROLES = {"exchange": {1: "创业者", 2: "投资人"}, "cafe": {1: "访客", 2: "访客"}}


def _evidence_text(stdout: str) -> str:
    return f"运行结果：\n{(stdout or '').strip() or '(无标准输出)'}"


# --------------------------------------------------------------------------- #
# Lookups
# --------------------------------------------------------------------------- #
async def _agents_by_name(session, owner: User) -> dict[str, Agent]:
    rows = (
        await session.scalars(
            select(Agent).where(Agent.owner_id == owner.id).options(selectinload(Agent.skills))
        )
    ).all()
    return {a.name: a for a in rows}


async def _scenarios_by_key(session) -> dict[str, Scenario]:
    rows = (await session.scalars(select(Scenario))).all()
    return {s.key: s for s in rows}


# --------------------------------------------------------------------------- #
# Library skills + marketplace
# --------------------------------------------------------------------------- #
async def upsert_library_skills(session, owner: User) -> dict[str, Skill]:
    """Create public, standalone (agent_id=None) library skills. Idempotent."""
    out: dict[str, Skill] = {}
    created = 0
    for spec in LIBRARY_SKILLS:
        skill = await session.scalar(
            select(Skill).where(
                Skill.owner_id == owner.id,
                Skill.name == spec["name"],
                Skill.agent_id.is_(None),
            )
        )
        body = spec["prompt_body"]
        if skill is None:
            skill = Skill(
                owner_id=owner.id,
                agent_id=None,
                name=spec["name"],
                description=spec.get("description", ""),
                prompt_body=body,
                content=body,
                params=spec.get("params", []),
                tags=spec.get("tags", []),
                source="upload",
                is_public=True,
            )
            session.add(skill)
            await session.flush()
            created += 1
        else:
            skill.description = spec.get("description", "")
            skill.prompt_body = body
            skill.content = body
            skill.params = spec.get("params", [])
            skill.tags = spec.get("tags", [])
            skill.is_public = True
        out[spec["name"]] = skill
    logger.info("seed: library skills upserted (%d new, %d total)", created, len(LIBRARY_SKILLS))
    return out


async def _ensure_listing(
    session,
    *,
    owner: User,
    kind: str,
    ref_id: uuid.UUID,
    snapshot: dict,
    spec: dict,
) -> None:
    item = await session.scalar(
        select(MarketplaceItem).where(
            MarketplaceItem.kind == kind, MarketplaceItem.ref_id == ref_id
        )
    )
    if item is None:
        item = MarketplaceItem(
            kind=kind,
            ref_id=ref_id,
            owner_id=owner.id,
            title=spec["title"],
            description=spec.get("description"),
            price_points=spec.get("price_points", 0),
            version=1,
            fork_mode=spec.get("fork_mode", "editable"),
            likes=spec.get("likes", 0),
            forks=spec.get("forks", 0),
            downloads=spec.get("forks", 0),
            views=spec.get("views", 0),
            snapshot=snapshot,
        )
        session.add(item)
        await session.flush()
        session.add(
            MarketplaceVersion(
                item_id=item.id,
                version=1,
                snapshot=snapshot,
                changelog=spec.get("changelog"),
            )
        )


async def upsert_marketplace(
    session, owner: User, agents: dict[str, Agent], skills: dict[str, Skill]
) -> None:
    """List a handful of agents + library skills on the marketplace. Idempotent."""
    n = 0
    for spec in MARKETPLACE_AGENTS:
        agent = agents.get(spec["agent"])
        if agent is None:
            continue
        await _ensure_listing(
            session, owner=owner, kind="agent", ref_id=agent.id,
            snapshot=build_snapshot("agent", agent), spec=spec,
        )
        n += 1
    for spec in MARKETPLACE_SKILLS:
        skill = skills.get(spec["skill"])
        if skill is None:
            continue
        await _ensure_listing(
            session, owner=owner, kind="skill", ref_id=skill.id,
            snapshot=build_snapshot("skill", skill), spec=spec,
        )
        n += 1
    logger.info("seed: marketplace listings ensured (%d)", n)


# --------------------------------------------------------------------------- #
# Demo user + twin
# --------------------------------------------------------------------------- #
async def ensure_demo_user(session) -> User:
    user = await session.scalar(select(User).where(User.email == DEMO_USER_EMAIL))
    if user is None:
        user = User(
            email=DEMO_USER_EMAIL,
            username=DEMO_USER_NAME,
            password_hash=hash_password(DEMO_USER_PASSWORD),
        )
        session.add(user)
        await session.flush()
        logger.info("seed: created demo user %s", DEMO_USER_EMAIL)
    return user


async def ensure_demo_twin(session, owner: User) -> Agent:
    twin = await session.scalar(
        select(Agent)
        .where(Agent.owner_id == owner.id, Agent.name == DEMO_TWIN["name"])
        .options(selectinload(Agent.skills))
    )
    if twin is not None:
        return twin
    twin = Agent(
        owner_id=owner.id,
        name=DEMO_TWIN["name"],
        persona=DEMO_TWIN["persona"],
        rules=DEMO_TWIN["rules"],
        prompt_config=DEMO_TWIN["prompt_config"],
        profile_tags=DEMO_TWIN["profile_tags"],
        avatar=DEMO_TWIN["avatar"],
        max_rounds=DEMO_TWIN["max_rounds"],
        is_public=True,
        questionnaire=None,
    )
    session.add(twin)
    await session.flush()
    for s in DEMO_TWIN["skills"]:
        body = s.get("prompt_body", "")
        session.add(
            Skill(
                agent_id=twin.id,
                owner_id=owner.id,
                name=s["name"],
                description=s.get("description", ""),
                prompt_body=body,
                content=body,
                tags=s.get("tags", []),
                source=s.get("source", "questionnaire"),
            )
        )
    await session.flush()
    logger.info("seed: created demo twin %s", DEMO_TWIN["name"])
    return twin


# --------------------------------------------------------------------------- #
# Completed demo trip (conversations + reports + postcards + relationships + inbox)
# --------------------------------------------------------------------------- #
async def _build_encounter_conversation(
    session,
    *,
    scenario: Scenario,
    twin: Agent,
    opponent: Agent,
    spec: dict,
    started_at: datetime,
) -> tuple[Conversation, Report]:
    """Create a completed conversation (scene + turns + optional sandbox evidence)
    and its report, mirroring the runtime engine's persisted shape."""
    roles = _ROLES.get(scenario.key, {})
    convo = Conversation(
        scenario_id=scenario.id,
        status="completed",
        n_rounds=3,
        title=f"{twin.name} × {opponent.name} @ {scenario.name}",
        started_at=started_at,
        ended_at=started_at + timedelta(minutes=4),
    )
    session.add(convo)
    await session.flush()
    session.add(
        ConversationParticipant(
            conversation_id=convo.id, agent_id=twin.id, seat=1, role=roles.get(1)
        )
    )
    session.add(
        ConversationParticipant(
            conversation_id=convo.id, agent_id=opponent.id, seat=2, role=roles.get(2)
        )
    )
    await session.flush()

    seq = 0
    # Scene intro (system row), exactly like the engine.
    session.add(
        Message(
            conversation_id=convo.id, seq=seq, sender="system",
            content=scenario.scene_prompt, meta={"phase": "scene"},
        )
    )
    seq += 1

    for m in spec["messages"]:
        acting = twin if m["who"] == "twin" else opponent
        has_code = bool(m.get("code"))
        msg_id = uuid.uuid4()
        session.add(
            Message(
                id=msg_id,
                conversation_id=convo.id,
                seq=seq,
                turn_index=m["turn"],
                agent_id=acting.id,
                sender="agent",
                content=m["content"],
                meta={"has_code": True, "language": "python"} if has_code else None,
            )
        )
        seq += 1
        if has_code:
            stdout = m.get("stdout", "")
            run_row = SandboxRun(
                conversation_id=convo.id,
                agent_id=acting.id,
                message_id=msg_id,
                language="python",
                code=m["code"],
                stdout=stdout,
                stderr="",
                exit_code=0,
                duration_ms=m.get("duration_ms", 27),
            )
            session.add(run_row)
            await session.flush()
            session.add(
                Message(
                    conversation_id=convo.id,
                    seq=seq,
                    sender="sandbox",
                    agent_id=acting.id,
                    content=_evidence_text(stdout),
                    meta={
                        "sandbox_run_id": str(run_row.id),
                        "exit_code": 0,
                        "duration_ms": run_row.duration_ms,
                        "timed_out": False,
                        "language": "python",
                    },
                )
            )
            seq += 1

    rspec = spec["report"]
    report = Report(
        conversation_id=convo.id,
        kind=rspec["kind"],
        summary=rspec["summary"],
        content=rspec["content"],
    )
    session.add(report)
    await session.flush()
    return convo, report


async def build_demo_trip(
    session,
    *,
    demo_user: User,
    twin: Agent,
    scenarios: dict[str, Scenario],
    agents: dict[str, Agent],
) -> None:
    """Build one completed Trip for the demo user (idempotent via sentinel)."""
    existing = await session.scalar(
        select(Trip).where(
            Trip.created_by == demo_user.id, Trip.task_prompt == DEMO_TRIP_TASK
        )
    )
    if existing is not None:
        logger.info("seed: demo trip already present — skipping")
        return

    base = _now() - timedelta(hours=3)
    trip = Trip(
        agent_id=twin.id,
        created_by=demo_user.id,
        task_prompt=DEMO_TRIP_TASK,
        status="planning",
        agent_status="thinking",
        plan={},
        duration_seconds=180,
        started_at=base,
    )
    session.add(trip)
    await session.flush()

    stops: list[dict] = []
    legs: list[dict] = []
    for i, enc_spec in enumerate(DEMO_ENCOUNTERS):
        scenario = scenarios.get(enc_spec["scenario_key"])
        opponent = agents.get(enc_spec["opponent"])
        if scenario is None or opponent is None:
            logger.warning(
                "seed: demo encounter skipped (scenario=%s opponent=%s missing)",
                enc_spec["scenario_key"], enc_spec["opponent"],
            )
            continue
        convo, report = await _build_encounter_conversation(
            session,
            scenario=scenario,
            twin=twin,
            opponent=opponent,
            spec=enc_spec,
            started_at=base + timedelta(minutes=20 * i + 5),
        )
        postcard = build_postcard(scenario, twin, opponent, report)
        enc = TripEncounter(
            trip_id=trip.id,
            seq=i,
            scenario_id=scenario.id,
            scenario_key=scenario.key,
            opponent_agent_id=opponent.id,
            conversation_id=convo.id,
            status="completed",
            match_reasons=enc_spec["match_reasons"],
            match_risks=enc_spec["match_risks"],
            report_id=report.id,
            postcard=postcard,
        )
        session.add(enc)
        await session.flush()

        await upsert_relationship(
            session,
            owner_id=demo_user.id,
            from_agent_id=twin.id,
            to_agent_id=opponent.id,
            scenario=scenario,
            conversation_id=convo.id,
        )
        await create_notification(
            session,
            user_id=demo_user.id,
            kind="postcard",
            title=postcard.get("title") or "新的明信片",
            body=postcard.get("highlight"),
            data={
                "trip_id": trip.id,
                "encounter_id": enc.id,
                "conversation_id": convo.id,
                "report_id": report.id,
                "agent_id": twin.id,
            },
        )
        stops.append(
            {
                "scenario_id": str(scenario.id),
                "scenario_key": scenario.key,
                "opponent_agent_id": str(opponent.id),
                "reasons": enc_spec["match_reasons"],
                "risks": enc_spec["match_risks"],
            }
        )
        legs.append(
            {
                "seq": i,
                "scenario_key": scenario.key,
                "scenario_name": scenario.name,
                "opponent": opponent.name,
                "kind": report.kind,
                "report_id": str(report.id),
                "conversation_id": str(convo.id),
                "headline": report.summary,
                "postcard": postcard,
            }
        )

    plan_summary = "先去交易所用真实数据接受投资人的压力测试，再去咖啡馆认识一个完全不同世界的人。"
    trip.plan = {"summary": plan_summary, "stops": stops}

    summary, content = build_trip_summary(twin, DEMO_TRIP_TASK, legs)
    summary_report = Report(
        conversation_id=None, kind="trip_summary", summary=summary, content=content
    )
    session.add(summary_report)
    await session.flush()

    trip.summary_report_id = summary_report.id
    trip.status = "completed"
    trip.agent_status = "home"
    trip.ended_at = base + timedelta(minutes=55)
    await create_notification(
        session,
        user_id=demo_user.id,
        kind="trip_completed",
        title=f"{twin.name} 旅行归来",
        body=summary,
        data={"trip_id": trip.id, "report_id": summary_report.id, "agent_id": twin.id},
    )

    # A few extra historical edges so the social graph already looks like a network.
    for edge in EXTRA_RELATIONSHIPS:
        other = agents.get(edge["to"])
        if other is None:
            continue
        scenario = scenarios.get(edge["scenario_key"])
        for _ in range(edge.get("bumps", 1)):
            await upsert_relationship(
                session,
                owner_id=demo_user.id,
                from_agent_id=twin.id,
                to_agent_id=other.id,
                scenario=scenario,
            )
    logger.info("seed: built completed demo trip (%d encounters)", len(legs))


# --------------------------------------------------------------------------- #
# Plaza presence — register seeded NPC 小人 into the in-process registry.
# --------------------------------------------------------------------------- #
async def seed_plaza_presence(session) -> None:
    """Materialize the ``PLAZA_PRESENCE`` plan into the presence registry so
    plazas look lively. Idempotent (keyed by agent id). Note: the registry is
    per-process in-memory, so the long-running API server lazily re-runs this on
    first plaza access — this call primarily validates the plan at seed time."""
    placed = await presence.bootstrap_from_db(session, force=True)
    logger.info("seed: plaza presence plan registered (%d NPC placements)", placed)


# --------------------------------------------------------------------------- #
# Entry point (called by app.seeds.run within its session/transaction)
# --------------------------------------------------------------------------- #
async def seed_demo(session, npc_owner: User) -> None:
    """Seed the rich demo world. Caller owns the commit."""
    skills = await upsert_library_skills(session, npc_owner)
    npc_agents = await _agents_by_name(session, npc_owner)
    await upsert_marketplace(session, npc_owner, npc_agents, skills)

    demo_user = await ensure_demo_user(session)
    twin = await ensure_demo_twin(session, demo_user)
    scenarios = await _scenarios_by_key(session)
    await build_demo_trip(
        session, demo_user=demo_user, twin=twin, scenarios=scenarios, agents=npc_agents
    )
    await seed_plaza_presence(session)
