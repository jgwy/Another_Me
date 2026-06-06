/**
 * In-memory mock backend + a mock SSE driver.
 *
 * `mockStore` is a mutable, seeded mirror of the API so that create / fork /
 * dispatch flows stay internally consistent while the real endpoints return
 * `501`. `mockConversationStream` mirrors {@link openConversationStream} from
 * `sse.ts` exactly (same handler shape, same locked event names) and replays a
 * transcript with realistic streaming — so the spectate view is fully
 * demonstrable and swaps to the real stream with a one-line change.
 */
import type {
  Agent,
  AgentCreate,
  Conversation,
  Dispatch,
  DispatchCreate,
  Evolution,
  InboxListParams,
  MarketplaceCreate,
  MarketplaceForkResult,
  MarketplaceItem,
  MarketplaceLikeResult,
  MarketplacePublishBody,
  MarketplaceVersion,
  Message,
  Notification,
  Page,
  PointsBalance,
  PromptConfig,
  Relationship,
  RelationshipGraph,
  RelationshipListParams,
  RelationshipNode,
  Report,
  SandboxRunRequest,
  SandboxRunResult,
  Scenario,
  Skill,
  SkillCreate,
  SkillListParams,
  SkillPatch,
} from "./api";
import { emptyPromptConfig } from "./api";
import type { ConversationStream, ConversationStreamHandlers } from "./sse";
import {
  CONVERSATION_REPORT,
  genId,
  MOCK_AGENTS,
  MOCK_CONVERSATIONS,
  MOCK_DISPATCHES,
  MOCK_EVOLUTIONS,
  MOCK_MARKETPLACE,
  MOCK_MESSAGES,
  MOCK_NOTIFICATIONS,
  MOCK_RELATIONSHIPS,
  MOCK_REPORTS,
  MOCK_SCENARIOS,
  MOCK_SKILLS,
  MOCK_USER,
  nowISO,
} from "./mockData";

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function paginate<T>(items: T[], limit = 20, offset = 0): Page<T> {
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const AVATAR_POOL = ["🦊", "🐼", "🦉", "🐙", "🦄", "🐝", "🦋", "🐢", "🦒", "🐬", "🦝", "🐳"];
export function pickAvatar(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_POOL[h % AVATAR_POOL.length]!;
}

/* -------------------------------------------------------------------------- */
/* Agent synthesis (questionnaire → Agent), used by the create fallback        */
/* -------------------------------------------------------------------------- */

/** Synthesize a full Agent from an AgentCreate payload — mirrors what the
 *  backend's create-from-questionnaire endpoint will eventually return. */
export function fabricateAgent(input: AgentCreate): Agent {
  const now = nowISO();
  const id = genId();
  const q = input.questionnaire ?? {};

  const domain = asString(q.domain);
  const personality = asStringArray(q.personality);
  const interests = asStringArray(q.interests);
  const tags = [domain, ...personality, ...interests].filter(Boolean).slice(0, 6);

  const goals = asString(q.goals);
  const persona =
    asString(q.persona) ||
    [
      domain ? `A ${domain} specialist` : "A curious digital twin",
      personality.length ? `who is ${personality.join(", ")}.` : "ready to explore the island.",
      goals ? `Driven by: ${goals}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

  const uploaded: Skill[] = (input.uploaded_skills ?? []).map((s) => ({
    id: genId(),
    agent_id: id,
    owner_id: MOCK_USER.id,
    name: s.name,
    description: s.content,
    prompt_body: s.prompt_body ?? s.content,
    content: s.content,
    params: [],
    tags: [],
    executable: { kind: "none" as const },
    source: "upload" as const,
    is_public: false,
    created_at: now,
    updated_at: now,
  }));

  // Selected library skills (捏脸 selection step) are injected into the twin.
  const selected: Skill[] = (input.skill_ids ?? [])
    .map((sid) => MOCK_SKILLS.find((s) => s.id === sid))
    .filter((s): s is Skill => !!s)
    .map((s) => ({ ...clone(s), id: genId(), agent_id: id, source: "selected" as const }));

  const rules = {
    tone: asString(q.tone) || personality.join(", ") || "thoughtful",
    dos: asStringArray(q.dos),
    donts: asStringArray(q.donts),
  };

  const prompt_config: PromptConfig =
    input.prompt_config ??
    (() => {
      const cfg = emptyPromptConfig(input.name);
      cfg.identity.one_liner = domain ? `A ${domain} twin` : "A digital twin";
      cfg.identity.background = persona;
      cfg.voice.tone = rules.tone;
      cfg.values.dos = rules.dos;
      cfg.values.donts = rules.donts;
      cfg.values.core_values = personality;
      cfg.interests.passions = interests;
      cfg.interests.expertise = domain ? [domain] : [];
      if (goals) cfg.memory_hooks.goals = [goals];
      return cfg;
    })();

  return {
    id,
    owner_id: MOCK_USER.id,
    name: input.name,
    persona,
    rules,
    prompt_config,
    profile_tags: tags.length ? tags : ["generalist"],
    questionnaire: q,
    avatar: input.avatar ?? pickAvatar(input.name + id),
    max_rounds: input.max_rounds ?? 8,
    is_public: input.is_public ?? false,
    forked_from: null,
    source_version: null,
    skills: [...uploaded, ...selected],
    created_at: now,
    updated_at: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Transcript + report generators (for freshly-dispatched mock conversations)  */
/* -------------------------------------------------------------------------- */

function mkMessage(
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
    created_at: nowISO(),
  };
}

function businessLines(self: Agent, other: Agent, task: string): string[] {
  return [
    `Thanks for taking the meeting, ${other.name}. Here's the short version: ${task || "I'm building something I believe in and I want your honest read."}`,
    `I appreciate the energy, ${self.name}. But energy isn't a metric. Walk me through the numbers — growth and unit economics, today, not in the deck.`,
    `Fair. Let me not hand-wave — I'll run our live figures right now instead of quoting a slide.`,
    `~23% average MoM and 5.2x LTV/CAC is genuinely strong if it holds. Where's the fragility — what breaks this?`,
    `The honest risk is concentration and retention. I'd rather name it than have you find it. Here's how we de-risk it next quarter.`,
    `Good instinct to lead with the risk. To wrap: I'm a soft yes pending diligence. Strong operator, real numbers, fixable problem.`,
  ];
}

function empathyLines(self: Agent, other: Agent, task: string): string[] {
  return [
    `I'll be honest about why I came, ${other.name}: ${task || "I wanted to understand a life that looks nothing like mine."}`,
    `That's a brave place to start, ${self.name}. My world probably looks shinier than it feels from the inside. What do you actually want to know?`,
    `What you carry that nobody sees. The parts that don't fit the postcard version of your life.`,
    `The quiet, mostly. And the question of whether the work matters. Can I ask you the same?`,
    `Same question, different shape. I think we're both looking for proof that what we do leaves a mark.`,
    `Maybe that's the common ground. One thing I understand now that I didn't an hour ago: we're more alike than the distance suggested.`,
  ];
}

const GEN_SANDBOX_CODE = `# live check requested by the investor
mrr = [42, 51, 63, 78, 95, 119]
mom = [round((mrr[i]/mrr[i-1]-1)*100,1) for i in range(1,len(mrr))]
print("MoM %:", mom)
print("avg:", round(sum(mom)/len(mom),1), "%")`;
const GEN_SANDBOX_STDOUT = `MoM %: [21.4, 23.5, 23.8, 21.8, 25.3]
avg: 23.2 %`;

/** Build a short, scenario-appropriate transcript for a freshly-created
 *  conversation. Business scenes include a sandbox-output evidence row. */
function generateTranscript(
  conv: Conversation,
  scenario: Scenario,
  task: string,
): Message[] {
  const a = mockStore.getAgent(conv.participants[0]!.agent_id)!;
  const b = mockStore.getAgent(conv.participants[1]!.agent_id)!;
  const business = scenario.kind === "business";
  const lines = business ? businessLines(a, b, task) : empathyLines(a, b, task);
  const turns = Math.min(conv.n_rounds * 2, lines.length);

  const out: Message[] = [];
  let seq = 0;
  out.push(
    mkMessage(conv.id, seq++, {
      sender: "system",
      content: `Scene: ${scenario.name}. ${scenario.scene_prompt}`,
    }),
  );

  for (let t = 0; t < turns; t++) {
    const isA = t % 2 === 0;
    const speaker = isA ? a : b;
    out.push(
      mkMessage(conv.id, seq++, {
        sender: "agent",
        agent_id: speaker.id,
        turn_index: t + 1,
        content: lines[t]!,
      }),
    );
    // After the founder offers to "run figures" (turn 3 in the business script),
    // inject a sandbox-output evidence row.
    if (business && t === 2) {
      out.push(
        mkMessage(conv.id, seq++, {
          sender: "sandbox",
          agent_id: a.id,
          content: GEN_SANDBOX_STDOUT,
          meta: {
            sandbox_run_id: genId(),
            language: "python",
            code: GEN_SANDBOX_CODE,
            stdout: GEN_SANDBOX_STDOUT,
            stderr: "",
            exit_code: 0,
            duration_ms: 128,
          },
        }),
      );
    }
  }
  return out;
}

function generateReport(conv: Conversation, scenario: Scenario): Report {
  const business = scenario.kind === "business";
  if (business) {
    return {
      id: genId(),
      conversation_id: conv.id,
      kind: "business",
      summary:
        "Credible operator with live metrics; primary risk is concentration. Soft-yes pending retention diligence.",
      content: {
        feasibility: "High — live product and growth backed by run-time analysis.",
        risks: ["Revenue concentration in a few accounts.", "Retention unproven.", "Crowded market."],
        valuation_lean: "Supports a priced seed; defer markup until retention data lands.",
        recommendation: "Soft yes — proceed to diligence.",
        highlights: ["Ran a live sandbox analysis.", "Named the risk before being asked."],
      },
      created_at: nowISO(),
    };
  }
  return {
    id: genId(),
    conversation_id: conv.id,
    kind: scenario.kind === "empathy" ? "empathy" : "generic",
    summary: "Two different lives found unexpected common ground and traded honest perspective.",
    content: {
      common_ground: ["Both measure meaning by impact.", "Both quietly question their path."],
      emotional_insights: ["Distance exaggerated the differences.", "Each romanticized the other's life."],
      takeaways: ["More alike than expected.", "Naming the hard parts built trust."],
    },
    created_at: nowISO(),
  };
}

/* -------------------------------------------------------------------------- */
/* Mock store                                                                  */
/* -------------------------------------------------------------------------- */

function createStore() {
  const agents: Agent[] = clone(MOCK_AGENTS);
  const scenarios: Scenario[] = clone(MOCK_SCENARIOS);
  const conversations: Conversation[] = clone(MOCK_CONVERSATIONS);
  const dispatches: Dispatch[] = clone(MOCK_DISPATCHES);
  const evolutions: Evolution[] = clone(MOCK_EVOLUTIONS);
  const marketplace: MarketplaceItem[] = clone(MOCK_MARKETPLACE);
  const marketplaceVersions: Record<string, MarketplaceVersion[]> = {};
  const reports: Report[] = clone(MOCK_REPORTS);
  const messages: Record<string, Message[]> = clone(MOCK_MESSAGES);
  const skills: Skill[] = clone(MOCK_SKILLS);
  const notifications: Notification[] = clone(MOCK_NOTIFICATIONS);
  const relationships: Relationship[] = clone(MOCK_RELATIONSHIPS);
  let points = MOCK_USER.points;

  function matchOpponent(agent: Agent, byProfile: boolean): Agent {
    const pool = agents.filter((a) => a.id !== agent.id && (a.is_public || a.owner_id === MOCK_USER.id));
    if (!byProfile) return pool[Math.floor(Math.random() * pool.length)] ?? agent;
    const score = (other: Agent) =>
      other.profile_tags.filter((t) => agent.profile_tags.includes(t)).length;
    return [...pool].sort((x, y) => score(y) - score(x))[0] ?? agent;
  }

  const store = {
    /* agents */
    listAgents(params?: {
      q?: string;
      tags?: string;
      owner?: string;
      is_public?: boolean;
      limit?: number;
      offset?: number;
    }): Page<Agent> {
      let items = agents;
      if (params?.q) {
        const q = params.q.toLowerCase();
        items = items.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.persona.toLowerCase().includes(q) ||
            a.profile_tags.some((t) => t.toLowerCase().includes(q)),
        );
      }
      if (params?.tags) {
        const want = params.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        items = items.filter((a) => want.every((w) => a.profile_tags.some((t) => t.toLowerCase() === w)));
      }
      if (params?.owner) {
        const owner = params.owner === "me" ? MOCK_USER.id : params.owner;
        items = items.filter((a) => a.owner_id === owner);
      }
      if (params?.is_public !== undefined) items = items.filter((a) => a.is_public === params.is_public);
      return paginate(items, params?.limit, params?.offset);
    },
    getAgent(id: string): Agent | undefined {
      return agents.find((a) => a.id === id);
    },
    addAgent(agent: Agent): Agent {
      agents.unshift(agent);
      return agent;
    },
    updateAgent(id: string, patch: Partial<Agent>): Agent | undefined {
      const a = agents.find((x) => x.id === id);
      if (!a) return undefined;
      Object.assign(a, patch, { updated_at: nowISO() });
      return a;
    },

    /* scenarios */
    listScenarios(): Scenario[] {
      return scenarios;
    },
    getScenario(idOrKey: string): Scenario | undefined {
      return scenarios.find((s) => s.id === idOrKey || s.key === idOrKey);
    },

    /* conversations + messages */
    listConversations(params?: {
      scenario_id?: string;
      agent_id?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }): Page<Conversation> {
      let items = conversations;
      if (params?.scenario_id) items = items.filter((c) => c.scenario_id === params.scenario_id);
      if (params?.status) items = items.filter((c) => c.status === params.status);
      if (params?.agent_id)
        items = items.filter((c) => c.participants.some((p) => p.agent_id === params.agent_id));
      return paginate(items, params?.limit, params?.offset);
    },
    getConversation(id: string): Conversation | undefined {
      return conversations.find((c) => c.id === id);
    },
    getMessages(conversationId: string, afterSeq?: number): Message[] {
      const all = messages[conversationId] ?? [];
      return afterSeq != null ? all.filter((m) => m.seq > afterSeq) : all;
    },

    /* dispatches */
    listDispatches(params?: {
      status?: string;
      agent_id?: string;
      limit?: number;
      offset?: number;
    }): Page<Dispatch> {
      let items = dispatches;
      if (params?.status) items = items.filter((d) => d.status === params.status);
      if (params?.agent_id) items = items.filter((d) => d.agent_id === params.agent_id);
      return paginate(items, params?.limit, params?.offset);
    },
    getDispatch(id: string): Dispatch | undefined {
      return dispatches.find((d) => d.id === id);
    },
    /** Create a dispatch and spin up a matching conversation + transcript + report. */
    createDispatch(input: DispatchCreate): Dispatch {
      const now = nowISO();
      const agent = store.getAgent(input.agent_id);
      const scenario = scenarios.find((s) => s.id === input.scenario_id || s.key === input.scenario_id);
      const opponent = input.opponent_agent_id
        ? store.getAgent(input.opponent_agent_id) ?? (agent ? matchOpponent(agent, false) : undefined)
        : agent
          ? matchOpponent(agent, input.match_by_profile ?? false)
          : undefined;

      const dispatch: Dispatch = {
        id: genId(),
        agent_id: input.agent_id,
        scenario_id: scenario?.id ?? input.scenario_id,
        task_prompt: input.task_prompt,
        opponent_agent_id: input.opponent_agent_id ?? opponent?.id ?? null,
        match_by_profile: input.match_by_profile ?? false,
        status: "running",
        created_by: MOCK_USER.id,
        conversation_id: null,
        created_at: now,
        updated_at: now,
      };

      if (agent && opponent && scenario) {
        const n = Math.min(agent.max_rounds, opponent.max_rounds, 3);
        const conv: Conversation = {
          id: genId(),
          scenario_id: scenario.id,
          status: "running",
          n_rounds: n,
          title: `${agent.name} · ${scenario.name}`,
          participants: [
            {
              id: genId(),
              conversation_id: "",
              agent_id: agent.id,
              seat: 1,
              role: null,
              agent: { id: agent.id, name: agent.name, avatar: agent.avatar, profile_tags: agent.profile_tags },
            },
            {
              id: genId(),
              conversation_id: "",
              agent_id: opponent.id,
              seat: 2,
              role: null,
              agent: {
                id: opponent.id,
                name: opponent.name,
                avatar: opponent.avatar,
                profile_tags: opponent.profile_tags,
              },
            },
          ],
          created_at: now,
          started_at: now,
          ended_at: null,
        };
        conv.participants.forEach((p) => (p.conversation_id = conv.id));
        conversations.unshift(conv);
        messages[conv.id] = generateTranscript(conv, scenario, input.task_prompt);
        const report = generateReport(conv, scenario);
        reports.unshift(report);
        CONVERSATION_REPORT[conv.id] = report.id;
        dispatch.conversation_id = conv.id;
      }

      dispatches.unshift(dispatch);
      return dispatch;
    },

    /* evolutions */
    listEvolutions(agentId: string): Evolution[] {
      return evolutions
        .filter((e) => e.agent_id === agentId)
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    },
    applyEvolution(id: string, applied: boolean): Evolution | undefined {
      const e = evolutions.find((x) => x.id === id);
      if (!e) return undefined;
      e.applied = applied;
      e.applied_at = applied ? nowISO() : null;
      return e;
    },

    /* reports */
    getReportByConversation(conversationId: string): Report | undefined {
      return reports.find((r) => r.conversation_id === conversationId);
    },
    getReport(reportId: string): Report | undefined {
      return reports.find((r) => r.id === reportId);
    },

    /* marketplace */
    listMarketplace(params?: {
      kind?: string;
      q?: string;
      sort?: "downloads" | "recent" | "likes";
      limit?: number;
      offset?: number;
    }): Page<MarketplaceItem> {
      let items = marketplace;
      if (params?.kind) items = items.filter((m) => m.kind === params.kind);
      if (params?.q) {
        const q = params.q.toLowerCase();
        items = items.filter(
          (m) => m.title.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q),
        );
      }
      const sorted = [...items].sort((a, b) => {
        if (params?.sort === "downloads") return b.downloads - a.downloads;
        if (params?.sort === "likes") return (b.likes ?? 0) - (a.likes ?? 0);
        return a.created_at < b.created_at ? 1 : -1;
      });
      return paginate(sorted, params?.limit, params?.offset);
    },
    addMarketplaceItem(input: MarketplaceCreate): MarketplaceItem {
      const item: MarketplaceItem = {
        id: genId(),
        kind: input.kind,
        ref_id: input.ref_id,
        owner_id: MOCK_USER.id,
        title: input.title,
        description: input.description ?? null,
        price_points: input.price_points ?? 0,
        downloads: 0,
        created_at: nowISO(),
      };
      marketplace.unshift(item);
      return item;
    },
    forkMarketplaceItem(id: string): MarketplaceForkResult {
      const item = marketplace.find((m) => m.id === id);
      if (!item) throw new Error("not found");
      if (points < item.price_points) throw new Error("not enough points");
      item.downloads += 1;
      item.forks = item.downloads; // `downloads` is the v1 alias of `forks`
      points = Math.max(0, points - item.price_points);
      const sourceVersion = item.version ?? 1;
      let agent: Agent | null = null;
      let skill: Skill | null = null;
      if (item.kind === "agent") {
        const src = store.getAgent(item.ref_id);
        if (src) {
          agent = {
            ...clone(src),
            id: genId(),
            owner_id: MOCK_USER.id,
            forked_from: src.id,
            source_version: sourceVersion,
            is_public: false,
            created_at: nowISO(),
            updated_at: nowISO(),
          };
          agents.unshift(agent);
        }
      } else {
        const src = skills.find((s) => s.id === item.ref_id);
        skill = {
          id: genId(),
          agent_id: null,
          owner_id: MOCK_USER.id,
          name: src?.name ?? item.title,
          description: src?.description ?? item.description ?? "",
          prompt_body: src?.prompt_body ?? src?.content ?? item.description ?? "",
          content: src?.content ?? item.description ?? "",
          params: src?.params ?? [],
          tags: src?.tags ?? [],
          executable: src?.executable ?? { kind: "none" },
          source: "selected",
          is_public: false,
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        skills.unshift(skill);
      }
      return { item: clone(item), agent, skill, source_version: sourceVersion };
    },

    likeMarketplaceItem(id: string): MarketplaceLikeResult {
      const item = marketplace.find((m) => m.id === id);
      if (!item) throw new Error("not found");
      const liked = !item.liked;
      item.liked = liked;
      item.likes = Math.max(0, (item.likes ?? 0) + (liked ? 1 : -1));
      return { item_id: id, likes: item.likes, liked };
    },
    listMarketplaceVersions(id: string): MarketplaceVersion[] {
      const item = marketplace.find((m) => m.id === id);
      if (!item) return [];
      if (!marketplaceVersions[id]) {
        const latest = item.version ?? 1;
        marketplaceVersions[id] = Array.from({ length: latest }, (_, i) => ({
          id: genId(),
          item_id: id,
          version: latest - i,
          snapshot: item.snapshot ?? {},
          changelog: latest - i === 1 ? "首次发布" : `v${latest - i} 更新`,
          created_at: nowISO(),
        }));
      }
      return marketplaceVersions[id]!;
    },
    publishMarketplaceItem(id: string, body?: MarketplacePublishBody): MarketplaceItem {
      const item = marketplace.find((m) => m.id === id);
      if (!item) throw new Error("not found");
      const next = (item.version ?? 1) + 1;
      item.version = next;
      item.updated_at = nowISO();
      const versions = store.listMarketplaceVersions(id);
      versions.unshift({
        id: genId(),
        item_id: id,
        version: next,
        snapshot: item.snapshot ?? {},
        changelog: body?.changelog ?? null,
        created_at: nowISO(),
      });
      return clone(item);
    },

    /* skills (standalone v2) */
    listSkills(params?: SkillListParams): Page<Skill> {
      let items = skills;
      if (params?.q) {
        const q = params.q.toLowerCase();
        items = items.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description ?? "").toLowerCase().includes(q) ||
            (s.tags ?? []).some((t) => t.toLowerCase().includes(q)),
        );
      }
      if (params?.tags) {
        const want = params.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        items = items.filter((s) => want.every((w) => (s.tags ?? []).some((t) => t.toLowerCase() === w)));
      }
      if (params?.owner) {
        const owner = params.owner === "me" ? MOCK_USER.id : params.owner;
        items = items.filter((s) => s.owner_id === owner);
      }
      if (params?.agent_id) items = items.filter((s) => s.agent_id === params.agent_id);
      if (params?.is_public !== undefined) items = items.filter((s) => !!s.is_public === params.is_public);
      return paginate(items, params?.limit, params?.offset);
    },
    getSkill(id: string): Skill | undefined {
      return skills.find((s) => s.id === id);
    },
    createSkill(body: SkillCreate): Skill {
      const now = nowISO();
      const skill: Skill = {
        id: genId(),
        agent_id: body.agent_id ?? null,
        owner_id: MOCK_USER.id,
        name: body.name,
        description: body.description ?? "",
        prompt_body: body.prompt_body,
        content: body.prompt_body,
        params: body.params ?? [],
        tags: body.tags ?? [],
        executable: body.executable ?? { kind: "none" },
        source: body.source ?? "upload",
        is_public: body.is_public ?? false,
        created_at: now,
        updated_at: now,
      };
      skills.unshift(skill);
      return skill;
    },
    patchSkill(id: string, body: SkillPatch): Skill | undefined {
      const s = skills.find((x) => x.id === id);
      if (!s) return undefined;
      if (body.prompt_body !== undefined) {
        s.prompt_body = body.prompt_body;
        s.content = body.prompt_body;
      }
      if (body.name !== undefined) s.name = body.name;
      if (body.description !== undefined) s.description = body.description;
      if (body.params !== undefined) s.params = body.params;
      if (body.tags !== undefined) s.tags = body.tags;
      if (body.executable !== undefined) s.executable = body.executable;
      if (body.is_public !== undefined) s.is_public = body.is_public;
      s.updated_at = nowISO();
      return s;
    },
    deleteSkill(id: string): void {
      const i = skills.findIndex((s) => s.id === id);
      if (i >= 0) skills.splice(i, 1);
    },

    /* inbox / notifications */
    listInbox(params?: InboxListParams): Page<Notification> {
      let items = notifications;
      if (params?.unread) items = items.filter((n) => !n.read);
      return paginate(items, params?.limit, params?.offset);
    },
    getUnreadCount(): { count: number } {
      return { count: notifications.filter((n) => !n.read).length };
    },
    markNotificationRead(id: string): Notification | undefined {
      const n = notifications.find((x) => x.id === id);
      if (!n) return undefined;
      n.read = true;
      n.read_at = nowISO();
      return n;
    },
    markAllNotificationsRead(): { updated: number } {
      let updated = 0;
      for (const n of notifications) {
        if (!n.read) {
          n.read = true;
          n.read_at = nowISO();
          updated += 1;
        }
      }
      return { updated };
    },

    /* relationships / graph */
    listRelationships(params?: RelationshipListParams): Page<Relationship> {
      let items = relationships;
      if (params?.agent_id) {
        items = items.filter(
          (r) => r.from_agent_id === params.agent_id || r.to_agent_id === params.agent_id,
        );
      }
      if (params?.type) items = items.filter((r) => r.type === params.type);
      return paginate(items, params?.limit, params?.offset);
    },
    getRelationshipGraph(agentId?: string): RelationshipGraph {
      const edges = agentId
        ? relationships.filter((r) => r.from_agent_id === agentId || r.to_agent_id === agentId)
        : relationships;
      const byId = new Map<string, RelationshipNode>();
      for (const r of edges) {
        for (const a of [r.from_agent, r.to_agent]) {
          if (a && !byId.has(a.id)) {
            const owned = agents.some((ag) => ag.id === a.id && ag.owner_id === MOCK_USER.id);
            byId.set(a.id, { agent: a, owned });
          }
        }
      }
      return { nodes: [...byId.values()], edges: clone(edges) };
    },

    /* sandbox run (standalone workspace) */
    runSandbox(body: SandboxRunRequest): SandboxRunResult {
      const language = body.language ?? "python";
      const code = body.code ?? "";
      // Surface any print(...) string literals so simple demos show output.
      const prints = [...code.matchAll(/print\(\s*(['"])([\s\S]*?)\1\s*\)/g)].map((m) => m[2] ?? "");
      const stdout = prints.length
        ? prints.join("\n") + "\n"
        : code.trim()
          ? "(已在沙盒中执行 · 无 stdout 输出)\n"
          : "";
      return {
        stdout,
        stderr: "",
        exit_code: 0,
        duration_ms: 40 + Math.floor(Math.random() * 120),
        timed_out: false,
        language,
      };
    },

    getPoints(): PointsBalance {
      return { user_id: MOCK_USER.id, points };
    },
  };

  return store;
}

export const mockStore = createStore();

/* -------------------------------------------------------------------------- */
/* Mock SSE driver — mirrors openConversationStream() exactly                  */
/* -------------------------------------------------------------------------- */

/** Split text into token-ish chunks so deltas look like real streaming. */
function chunkText(text: string): string[] {
  const tokens = text.match(/\S+\s*/g);
  return tokens ?? [text];
}

/**
 * Drop-in mock for {@link openConversationStream}. Replays the stored
 * transcript for `conversationId`, emitting the exact locked events
 * (`message-start` / `message-delta` / `message-end` / `sandbox-output` /
 * `conversation-end`) with realistic timing.
 */
export function mockConversationStream(
  conversationId: string,
  handlers: ConversationStreamHandlers = {},
): ConversationStream {
  const messages = mockStore.getMessages(conversationId);
  const conv = mockStore.getConversation(conversationId);
  const reportId = CONVERSATION_REPORT[conversationId] ?? null;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let index = 0;

  const schedule = (fn: () => void, ms: number) => {
    timer = setTimeout(() => {
      if (!cancelled) fn();
    }, ms);
  };

  const finish = () => {
    handlers.onConversationEnd?.({
      conversation_id: conversationId,
      status: "completed",
      n_rounds: conv?.n_rounds ?? 0,
      report_id: reportId,
    });
  };

  const next = () => {
    if (cancelled) return;
    if (index >= messages.length) {
      finish();
      return;
    }
    const m = messages[index++]!;

    if (m.sender === "system") {
      schedule(next, 250);
      return;
    }

    if (m.sender === "sandbox") {
      const meta = m.meta as Record<string, unknown>;
      handlers.onSandboxOutput?.({
        conversation_id: conversationId,
        message_id: m.id,
        sandbox_run_id: String(meta.sandbox_run_id ?? genId()),
        agent_id: m.agent_id,
        language: String(meta.language ?? "python"),
        stdout: String(meta.stdout ?? m.content),
        stderr: String(meta.stderr ?? ""),
        exit_code: Number(meta.exit_code ?? 0),
        duration_ms: Number(meta.duration_ms ?? 0),
      });
      schedule(next, 1000);
      return;
    }

    // agent message: start → deltas → end
    handlers.onMessageStart?.({
      conversation_id: conversationId,
      message_id: m.id,
      seq: m.seq,
      turn_index: m.turn_index,
      agent_id: m.agent_id,
      sender: m.sender,
    });

    const chunks = chunkText(m.content);
    let ci = 0;
    const streamChunk = () => {
      if (cancelled) return;
      if (ci < chunks.length) {
        handlers.onMessageDelta?.({
          conversation_id: conversationId,
          message_id: m.id,
          seq: m.seq,
          delta: chunks[ci++]!,
        });
        schedule(streamChunk, 26 + Math.random() * 42);
      } else {
        handlers.onMessageEnd?.({
          conversation_id: conversationId,
          message_id: m.id,
          seq: m.seq,
          turn_index: m.turn_index,
          agent_id: m.agent_id,
          sender: m.sender,
          content: m.content,
          meta: m.meta,
        });
        schedule(next, 600);
      }
    };
    schedule(streamChunk, 320);
  };

  schedule(next, 400);

  return {
    close: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}
