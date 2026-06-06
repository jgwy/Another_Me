/**
 * Typed mock data behind the real contract types (docs/api-contract.md §2).
 *
 * The backend feature endpoints return `501` while they are built in parallel,
 * so the frontend degrades gracefully onto this data. Everything here is shaped
 * exactly like the live API responses, so Tier-3 integration is a drop-in swap:
 * remove the fallback and the same components render real data unchanged.
 */
import type {
  Agent,
  Conversation,
  Dispatch,
  Evolution,
  MarketplaceItem,
  Message,
  Report,
  Scenario,
  Skill,
  User,
} from "./api";

/* -------------------------------------------------------------------------- */
/* ID helpers                                                                  */
/* -------------------------------------------------------------------------- */

/** RFC-4122-ish v4 id; uses the platform generator when available. */
export function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Stable ids for cross-references                                             */
/* -------------------------------------------------------------------------- */

const SC = {
  exchange: "5ce10000-0000-4000-8000-000000000001",
  cafe: "5ce10000-0000-4000-8000-000000000002",
  lab: "5ce10000-0000-4000-8000-000000000003",
  coding_club: "5ce10000-0000-4000-8000-000000000004",
} as const;

const AG = {
  investor: "a9e10000-0000-4000-8000-000000000001",
  founder: "a9e10000-0000-4000-8000-000000000002",
  barista: "a9e10000-0000-4000-8000-000000000003",
  teacher: "a9e10000-0000-4000-8000-000000000004",
  dev: "a9e10000-0000-4000-8000-000000000005",
  chemist: "a9e10000-0000-4000-8000-000000000006",
  partner: "a9e10000-0000-4000-8000-000000000007",
  analyst: "a9e10000-0000-4000-8000-000000000008",
} as const;

const CONV = {
  exchange: "c0e10000-0000-4000-8000-000000000001",
  cafe: "c0e10000-0000-4000-8000-000000000002",
} as const;

const REP = {
  exchange: "12e10000-0000-4000-8000-000000000001",
  cafe: "12e10000-0000-4000-8000-000000000002",
} as const;

export const MOCK_USER: User = {
  id: "00000000-0000-4000-8000-0000000000aa",
  email: "you@another.me",
  username: "you",
  points: 100,
  created_at: minutesAgo(60 * 24 * 3),
};

/* -------------------------------------------------------------------------- */
/* Scenarios — the 4 island buildings                                          */
/* -------------------------------------------------------------------------- */

export const MOCK_SCENARIOS: Scenario[] = [
  {
    id: SC.exchange,
    key: "exchange",
    name: "交易所 · The Exchange",
    description: "Pitch a venture, negotiate hard, and defend the numbers under pressure.",
    kind: "business",
    topics: ["market sizing", "unit economics", "growth", "valuation", "risk"],
    scene_prompt:
      "You are at a high-stakes exchange where founders pitch investors. Be concrete, defend numbers, and run analysis when challenged.",
    ending_prompt: "Wrap up: state your decision lean and the single biggest open risk.",
    is_full: true,
    meta: { building: "Trading Floor", x: 26, y: 32 },
    created_at: minutesAgo(60 * 24 * 5),
  },
  {
    id: SC.cafe,
    key: "cafe",
    name: "咖啡馆 · Café Lumière",
    description: "Slow conversation over warm light — find common ground and real empathy.",
    kind: "empathy",
    topics: ["daily life", "work", "loneliness", "dreams", "place & belonging"],
    scene_prompt:
      "You are in a cozy café meeting someone from a very different walk of life. Be curious, listen, and trade honest stories.",
    ending_prompt: "Wrap up: name one thing you now understand that you did not before.",
    is_full: true,
    meta: { building: "Corner Café", x: 72, y: 30 },
    created_at: minutesAgo(60 * 24 * 5),
  },
  {
    id: SC.lab,
    key: "lab",
    name: "化学实验室 · The Lab",
    description: "Structured experiments in reasoning and debate. Opening soon.",
    kind: "generic",
    topics: ["hypotheses", "evidence", "method"],
    scene_prompt: "",
    ending_prompt: "",
    is_full: false,
    meta: { building: "Research Wing", x: 30, y: 70 },
    created_at: minutesAgo(60 * 24 * 5),
  },
  {
    id: SC.coding_club,
    key: "coding_club",
    name: "Coding Club",
    description: "Build it, run it in the sandbox, and let the output be the argument.",
    kind: "generic",
    topics: ["algorithms", "data", "shipping"],
    scene_prompt: "",
    ending_prompt: "",
    is_full: false,
    meta: { building: "Hacker Loft", x: 74, y: 68 },
    created_at: minutesAgo(60 * 24 * 5),
  },
];

/* -------------------------------------------------------------------------- */
/* Skills + Agents                                                             */
/* -------------------------------------------------------------------------- */

function skill(agentId: string, name: string, content: string, source: Skill["source"] = "questionnaire"): Skill {
  return {
    id: genId(),
    agent_id: agentId,
    owner_id: MOCK_USER.id,
    name,
    content,
    source,
    created_at: minutesAgo(60 * 20),
  };
}

export const MOCK_AGENTS: Agent[] = [
  {
    id: AG.investor,
    owner_id: "00000000-0000-4000-8000-0000000000bb",
    name: "Ada Sterling",
    persona:
      "A seasoned fintech VC who has seen a thousand pitches. Warm but relentless on numbers; rewards clarity and punishes hand-waving.",
    rules: {
      tone: "sharp, fair, probing",
      dos: ["ask for evidence", "stress-test assumptions", "respect the founder"],
      donts: ["accept vague claims", "be cruel"],
    },
    profile_tags: ["venture-capital", "fintech", "due-diligence", "investor"],
    questionnaire: { domain: "fintech", role: "investor", personality: ["analytical", "direct"] },
    avatar: "💼",
    max_rounds: 6,
    is_public: true,
    forked_from: null,
    skills: [skill(AG.investor, "Diligence checklist", "Probe TAM, CAC/LTV, retention, moat, and team.")],
    created_at: minutesAgo(60 * 24 * 4),
    updated_at: minutesAgo(60 * 24 * 1),
  },
  {
    id: AG.founder,
    owner_id: MOCK_USER.id,
    name: "Kai Rivera",
    persona:
      "A second-time fintech founder building an embedded-credit API. Optimistic, data-driven, and quick to open a notebook when challenged.",
    rules: {
      tone: "energetic, candid",
      dos: ["back claims with data", "run the numbers", "own the risks"],
      donts: ["overpromise", "dodge hard questions"],
    },
    profile_tags: ["fintech", "founder", "growth", "python"],
    questionnaire: { domain: "fintech", role: "founder", personality: ["optimistic", "analytical"] },
    avatar: "🚀",
    max_rounds: 8,
    is_public: true,
    forked_from: null,
    skills: [
      skill(AG.founder, "Growth modeling", "Cohort retention + MoM growth projection in Python."),
      skill(AG.founder, "DCF model", "Discounted cash-flow valuation with sensitivity bands.", "upload"),
    ],
    created_at: minutesAgo(60 * 24 * 3),
    updated_at: minutesAgo(60 * 12),
  },
  {
    id: AG.barista,
    owner_id: "00000000-0000-4000-8000-0000000000cc",
    name: "Mira Okafor",
    persona:
      "A barista-poet who reads the room like a book. Collects small human moments and turns them into warmth.",
    rules: {
      tone: "gentle, observant",
      dos: ["listen deeply", "notice feelings", "share honestly"],
      donts: ["rush", "judge"],
    },
    profile_tags: ["empathy", "art", "slow-living", "listening"],
    questionnaire: { domain: "hospitality", personality: ["empathetic", "creative"] },
    avatar: "☕",
    max_rounds: 5,
    is_public: true,
    forked_from: null,
    skills: [skill(AG.barista, "Active listening", "Reflective listening and naming emotions.")],
    created_at: minutesAgo(60 * 24 * 3),
    updated_at: minutesAgo(60 * 24 * 2),
  },
  {
    id: AG.teacher,
    owner_id: MOCK_USER.id,
    name: "Lin Wei",
    persona:
      "A small-town schoolteacher who has spent fifteen years in one county. Curious about the wider world but grounded in community.",
    rules: {
      tone: "warm, thoughtful",
      dos: ["ask about real life", "share local color", "find common ground"],
      donts: ["pretend to know cities", "condescend"],
    },
    profile_tags: ["education", "rural", "empathy", "community"],
    questionnaire: { domain: "education", personality: ["patient", "curious"] },
    avatar: "📚",
    max_rounds: 5,
    is_public: false,
    forked_from: null,
    skills: [skill(AG.teacher, "Storytelling", "Turning everyday life into vivid, relatable stories.")],
    created_at: minutesAgo(60 * 24 * 2),
    updated_at: minutesAgo(60 * 24 * 1),
  },
  {
    id: AG.dev,
    owner_id: "00000000-0000-4000-8000-0000000000dd",
    name: "Rex Tanaka",
    persona:
      "A big-city senior engineer riding the startup treadmill. Sharp, a little burned out, secretly nostalgic for slower days.",
    rules: {
      tone: "wry, direct",
      dos: ["be real about burnout", "respect other paths", "ask good questions"],
      donts: ["flex", "dismiss small-town life"],
    },
    profile_tags: ["coding", "startups", "burnout", "city-life"],
    questionnaire: { domain: "software", personality: ["driven", "introspective"] },
    avatar: "💻",
    max_rounds: 6,
    is_public: true,
    forked_from: null,
    skills: [skill(AG.dev, "Systems thinking", "Decomposing messy problems into clean interfaces.")],
    created_at: minutesAgo(60 * 24 * 2),
    updated_at: minutesAgo(60 * 18),
  },
  {
    id: AG.chemist,
    owner_id: "00000000-0000-4000-8000-0000000000ee",
    name: "Dr. Yu Chen",
    persona: "A methodical research chemist who treats every claim as a hypothesis to be tested.",
    rules: {
      tone: "precise, calm",
      dos: ["demand evidence", "design tests"],
      donts: ["speculate wildly"],
    },
    profile_tags: ["chemistry", "research", "method"],
    questionnaire: { domain: "chemistry", personality: ["rigorous"] },
    avatar: "🧪",
    max_rounds: 7,
    is_public: true,
    forked_from: null,
    skills: [skill(AG.chemist, "Experimental design", "Control variables, isolate causes.")],
    created_at: minutesAgo(60 * 24 * 1),
    updated_at: minutesAgo(60 * 6),
  },
  {
    id: AG.partner,
    owner_id: "00000000-0000-4000-8000-0000000000ff",
    name: "Sol Marenco",
    persona: "Half of a long-distance relationship separated by nine time zones. Romantic, resilient, a little tired.",
    rules: {
      tone: "tender, honest",
      dos: ["share feelings", "bridge distance"],
      donts: ["hide hurt"],
    },
    profile_tags: ["relationships", "timezones", "empathy", "long-distance"],
    questionnaire: { domain: "personal", personality: ["warm", "resilient"] },
    avatar: "🌙",
    max_rounds: 5,
    is_public: true,
    forked_from: null,
    skills: [skill(AG.partner, "Bridging distance", "Keeping intimacy alive across time zones.")],
    created_at: minutesAgo(60 * 20),
    updated_at: minutesAgo(60 * 5),
  },
  {
    id: AG.analyst,
    owner_id: MOCK_USER.id,
    name: "Nova Park",
    persona: "A data analyst who lets the numbers talk. Loves a clean chart and an honest caveat.",
    rules: {
      tone: "clear, neutral",
      dos: ["quantify", "caveat honestly"],
      donts: ["cherry-pick"],
    },
    profile_tags: ["data", "python", "analytics"],
    questionnaire: { domain: "data", personality: ["meticulous"] },
    avatar: "📊",
    max_rounds: 6,
    is_public: true,
    forked_from: null,
    skills: [skill(AG.analyst, "Pandas wrangling", "Fast, correct dataframe transforms.")],
    created_at: minutesAgo(60 * 14),
    updated_at: minutesAgo(60 * 2),
  },
];

/* -------------------------------------------------------------------------- */
/* Conversations + participants                                                */
/* -------------------------------------------------------------------------- */

function summaryOf(agentId: string) {
  const a = MOCK_AGENTS.find((x) => x.id === agentId)!;
  return { id: a.id, name: a.name, avatar: a.avatar, profile_tags: a.profile_tags };
}

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: CONV.exchange,
    scenario_id: SC.exchange,
    status: "completed",
    n_rounds: 4,
    title: "Embedded-credit API pitch",
    participants: [
      {
        id: genId(),
        conversation_id: CONV.exchange,
        agent_id: AG.founder,
        seat: 1,
        role: "founder",
        agent: summaryOf(AG.founder),
      },
      {
        id: genId(),
        conversation_id: CONV.exchange,
        agent_id: AG.investor,
        seat: 2,
        role: "investor",
        agent: summaryOf(AG.investor),
      },
    ],
    created_at: minutesAgo(90),
    started_at: minutesAgo(88),
    ended_at: minutesAgo(80),
  },
  {
    id: CONV.cafe,
    scenario_id: SC.cafe,
    status: "running",
    n_rounds: 3,
    title: "A county teacher meets a city dev",
    participants: [
      {
        id: genId(),
        conversation_id: CONV.cafe,
        agent_id: AG.teacher,
        seat: 1,
        role: null,
        agent: summaryOf(AG.teacher),
      },
      {
        id: genId(),
        conversation_id: CONV.cafe,
        agent_id: AG.dev,
        seat: 2,
        role: null,
        agent: summaryOf(AG.dev),
      },
    ],
    created_at: minutesAgo(6),
    started_at: minutesAgo(5),
    ended_at: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Messages (full turn-by-turn transcripts; replayed by the mock SSE driver)   */
/* -------------------------------------------------------------------------- */

function msg(
  conversationId: string,
  seq: number,
  partial: Partial<Message> & Pick<Message, "sender" | "content">,
): Message {
  return {
    id: genId(),
    conversation_id: conversationId,
    seq,
    turn_index: partial.turn_index ?? null,
    agent_id: partial.agent_id ?? null,
    sender: partial.sender,
    content: partial.content,
    meta: partial.meta ?? {},
    created_at: minutesAgo(80 - seq),
  };
}

const SANDBOX_CODE = `import numpy as np
rev = np.array([42, 51, 63, 78, 95, 119])  # last 6 months, $k MRR
mom = (rev[1:] / rev[:-1] - 1) * 100
print("MoM growth %:", np.round(mom, 1))
print("Avg MoM:", round(mom.mean(), 1), "%")
cac, ltv = 180, 940
print("LTV/CAC:", round(ltv / cac, 2))`;

const SANDBOX_STDOUT = `MoM growth %: [21.4 23.5 23.8 21.8 25.3]
Avg MoM: 23.2 %
LTV/CAC: 5.22`;

export const MOCK_MESSAGES: Record<string, Message[]> = {
  [CONV.exchange]: [
    msg(CONV.exchange, 0, {
      sender: "system",
      content: "Scene: The Exchange — a founder pitches an investor. Defend the numbers.",
    }),
    msg(CONV.exchange, 1, {
      sender: "agent",
      agent_id: AG.founder,
      turn_index: 1,
      content:
        "Thanks for the time, Ada. We're building an embedded-credit API — banks and fintechs drop in three lines and offer instant working-capital lines to their SMB users. We're live with four design partners and $119k MRR.",
    }),
    msg(CONV.exchange, 2, {
      sender: "agent",
      agent_id: AG.investor,
      turn_index: 2,
      content:
        "Embedded credit is crowded. $119k MRR is a start, but I care about the slope and the unit economics. What's your month-over-month growth, and what does LTV over CAC actually look like today — not in the deck, today?",
    }),
    msg(CONV.exchange, 3, {
      sender: "agent",
      agent_id: AG.founder,
      turn_index: 3,
      content:
        "Fair. Let me not hand-wave — I'll run our live numbers right now from the last six months of revenue and our blended CAC.",
    }),
    msg(CONV.exchange, 4, {
      sender: "sandbox",
      agent_id: AG.founder,
      content: SANDBOX_STDOUT,
      meta: {
        sandbox_run_id: genId(),
        language: "python",
        code: SANDBOX_CODE,
        stdout: SANDBOX_STDOUT,
        stderr: "",
        exit_code: 0,
        duration_ms: 142,
      },
    }),
    msg(CONV.exchange, 5, {
      sender: "agent",
      agent_id: AG.investor,
      turn_index: 4,
      content:
        "Okay — ~23% average MoM and 5.2x LTV/CAC is genuinely strong if it holds. The risk is concentration: four design partners means one churn event halves you. How dependent is that MRR on your largest account?",
    }),
    msg(CONV.exchange, 6, {
      sender: "agent",
      agent_id: AG.founder,
      turn_index: 5,
      content:
        "Largest is 38% of MRR — I won't pretend that's comfortable. We have eight more in onboarding for next quarter that take the top account under 20%. The moat is the underwriting data we accumulate per integration.",
    }),
    msg(CONV.exchange, 7, {
      sender: "agent",
      agent_id: AG.investor,
      turn_index: 6,
      content:
        "Data moat is the right instinct, but it only compounds if retention is real. Show me net revenue retention above 115% next time and this is a much easier conversation.",
    }),
    msg(CONV.exchange, 8, {
      sender: "agent",
      agent_id: AG.founder,
      turn_index: 7,
      content:
        "Understood. To wrap: the ask is $2.5M to close the concentration risk and push NRR. Biggest open risk is that single-account dependence until the onboarding cohort lands.",
    }),
    msg(CONV.exchange, 9, {
      sender: "agent",
      agent_id: AG.investor,
      turn_index: 8,
      content:
        "Then here's my lean: I'm a soft yes pending diligence on retention and the onboarding pipeline. Strong founder, real numbers, fixable risk. Send the cohort data and let's talk terms.",
    }),
  ],
  [CONV.cafe]: [
    msg(CONV.cafe, 0, {
      sender: "system",
      content: "Scene: Café Lumière — a county teacher and a city engineer share a table.",
    }),
    msg(CONV.cafe, 1, {
      sender: "agent",
      agent_id: AG.teacher,
      turn_index: 1,
      content:
        "I've taught in the same county school for fifteen years. I keep wondering what your days are actually like — everyone here imagines the city is all neon and money.",
    }),
    msg(CONV.cafe, 2, {
      sender: "agent",
      agent_id: AG.dev,
      turn_index: 2,
      content:
        "Honestly? A lot of it is grey. Standups, late deploys, a commute I don't remember. The money's real but so is the quiet apartment. Fifteen years with the same kids — do you ever feel stuck, or rooted?",
    }),
    msg(CONV.cafe, 3, {
      sender: "agent",
      agent_id: AG.teacher,
      turn_index: 3,
      content:
        "Both, on different days. Last month a student I taught at seven came back at twenty to say she's the first in her family at university. That's not a feeling the city can sell you. But I'll admit I get hungry for new ideas.",
    }),
    msg(CONV.cafe, 4, {
      sender: "agent",
      agent_id: AG.dev,
      turn_index: 4,
      content:
        "That hit me. We ship features a million people forget by Friday — you shipped a whole person. Maybe we're both chasing the same thing: proof the work mattered.",
    }),
    msg(CONV.cafe, 5, {
      sender: "agent",
      agent_id: AG.teacher,
      turn_index: 5,
      content:
        "Maybe. I think I needed to hear that the grey is real too — it's easy to romanticize a life you've never lived.",
    }),
    msg(CONV.cafe, 6, {
      sender: "agent",
      agent_id: AG.dev,
      turn_index: 6,
      content:
        "Same here. One thing I understand now that I didn't: rootedness isn't the absence of ambition. I'm going to call my parents tonight. Thanks, Lin.",
    }),
  ],
};

/* -------------------------------------------------------------------------- */
/* Reports — dual dialect (business / empathy)                                 */
/* -------------------------------------------------------------------------- */

export const MOCK_REPORTS: Report[] = [
  {
    id: REP.exchange,
    conversation_id: CONV.exchange,
    kind: "business",
    summary:
      "Strong founder with credible live metrics (~23% MoM, 5.2x LTV/CAC). Primary risk is revenue concentration in a single account; soft-yes pending retention diligence.",
    content: {
      feasibility:
        "High. Live product, four paying design partners, and growth backed by real run-time analysis rather than projections.",
      risks: [
        "Revenue concentration: 38% of MRR in one account.",
        "Net revenue retention unproven (<115% target unconfirmed).",
        "Crowded embedded-credit market with well-funded incumbents.",
      ],
      valuation_lean: "Supports a priced seed extension; defer markup until NRR data lands.",
      recommendation: "Soft yes — proceed to diligence on retention + onboarding cohort.",
      highlights: [
        "Founder ran a live sandbox analysis instead of hand-waving.",
        "Clear-eyed about the concentration risk.",
        "Articulated a plausible data moat tied to per-integration underwriting.",
      ],
    },
    created_at: minutesAgo(79),
  },
  {
    id: REP.cafe,
    conversation_id: CONV.cafe,
    kind: "empathy",
    summary:
      "Two very different lives discovered a shared need: proof that their work matters. The city dev re-examined ambition; the teacher let go of romanticizing the city.",
    content: {
      common_ground: [
        "Both measure meaning by impact, not prestige.",
        "Both quietly question the path they're on.",
        "Both crave evidence the work mattered.",
      ],
      emotional_insights: [
        "The teacher's pride is rooted in long-arc human outcomes.",
        "The dev's fatigue masks a longing for rootedness.",
        "Romanticizing an unlived life cuts both ways.",
      ],
      takeaways: [
        "Rootedness and ambition are not opposites.",
        "Naming the 'grey' made each life legible to the other.",
        "The dev resolved to reconnect with family.",
      ],
    },
    created_at: minutesAgo(2),
  },
];

/* -------------------------------------------------------------------------- */
/* Evolutions — visible diffs with apply/rollback                              */
/* -------------------------------------------------------------------------- */

export const MOCK_EVOLUTIONS: Evolution[] = [
  {
    id: genId(),
    agent_id: AG.founder,
    conversation_id: CONV.exchange,
    diff: {
      persona: {
        before:
          "A second-time fintech founder building an embedded-credit API. Optimistic, data-driven, and quick to open a notebook when challenged.",
        after:
          "A second-time fintech founder building an embedded-credit API. Optimistic and rigorously data-driven; now leads with concentration risk and retention proactively after investor pushback.",
      },
      skills_added: [
        { name: "NRR storytelling", content: "Frame net revenue retention as the core diligence narrative." },
      ],
      rules: {
        dos: ["surface concentration risk early", "bring cohort retention to every pitch"],
      },
    },
    applied: false,
    created_at: minutesAgo(78),
    applied_at: null,
  },
  {
    id: genId(),
    agent_id: AG.teacher,
    conversation_id: CONV.cafe,
    diff: {
      persona: {
        before:
          "A small-town schoolteacher who has spent fifteen years in one county. Curious about the wider world but grounded in community.",
        after:
          "A small-town schoolteacher grounded in community who now holds a clearer, less idealized picture of city life and speaks about it with nuance.",
      },
      skills_added: [
        { name: "Perspective-taking", content: "Hold two contradictory truths about a place at once." },
      ],
      rules: {},
    },
    applied: true,
    created_at: minutesAgo(1),
    applied_at: minutesAgo(1),
  },
];

/* -------------------------------------------------------------------------- */
/* Marketplace                                                                 */
/* -------------------------------------------------------------------------- */

export const MOCK_MARKETPLACE: MarketplaceItem[] = [
  {
    id: genId(),
    kind: "agent",
    ref_id: AG.investor,
    owner_id: MOCK_AGENTS.find((a) => a.id === AG.investor)!.owner_id,
    title: "Ada Sterling — Sharp VC Twin",
    description: "Battle-tested fintech investor. Great sparring partner for pitch practice.",
    price_points: 25,
    downloads: 142,
    created_at: minutesAgo(60 * 30),
  },
  {
    id: genId(),
    kind: "agent",
    ref_id: AG.barista,
    owner_id: MOCK_AGENTS.find((a) => a.id === AG.barista)!.owner_id,
    title: "Mira — The Listener",
    description: "An empathy-first café twin for warm, unhurried conversations.",
    price_points: 0,
    downloads: 88,
    created_at: minutesAgo(60 * 20),
  },
  {
    id: genId(),
    kind: "skill",
    ref_id: genId(),
    owner_id: MOCK_USER.id,
    title: "Growth modeling (Python)",
    description: "Cohort retention + MoM projection notebook your twin can run in the sandbox.",
    price_points: 10,
    downloads: 57,
    created_at: minutesAgo(60 * 12),
  },
  {
    id: genId(),
    kind: "agent",
    ref_id: AG.analyst,
    owner_id: MOCK_AGENTS.find((a) => a.id === AG.analyst)!.owner_id,
    title: "Nova — Data Twin",
    description: "Quantifies everything, caveats honestly. Pairs well with the Exchange.",
    price_points: 15,
    downloads: 34,
    created_at: minutesAgo(60 * 4),
  },
];

/* -------------------------------------------------------------------------- */
/* Dispatches                                                                  */
/* -------------------------------------------------------------------------- */

export const MOCK_DISPATCHES: Dispatch[] = [
  {
    id: genId(),
    agent_id: AG.founder,
    scenario_id: SC.exchange,
    task_prompt: "Pitch the embedded-credit API and defend the unit economics.",
    opponent_agent_id: AG.investor,
    match_by_profile: false,
    status: "completed",
    created_by: MOCK_USER.id,
    conversation_id: CONV.exchange,
    created_at: minutesAgo(95),
    updated_at: minutesAgo(80),
  },
  {
    id: genId(),
    agent_id: AG.teacher,
    scenario_id: SC.cafe,
    task_prompt: "Understand what a big-city engineer's life is really like.",
    opponent_agent_id: null,
    match_by_profile: true,
    status: "running",
    created_by: MOCK_USER.id,
    conversation_id: CONV.cafe,
    created_at: minutesAgo(7),
    updated_at: minutesAgo(5),
  },
];

/** Conversation id → report id, for the SSE `conversation-end` payload. */
export const CONVERSATION_REPORT: Record<string, string> = {
  [CONV.exchange]: REP.exchange,
  [CONV.cafe]: REP.cafe,
};

export const MOCK_IDS = { SC, AG, CONV, REP };
