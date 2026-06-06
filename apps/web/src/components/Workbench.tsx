import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Brain,
  Clock3,
  Compass,
  History,
  Map,
  MessagesSquare,
  Play,
  RefreshCw,
  Route,
  Sparkles,
} from 'lucide-react';
import {
  api,
  type Agent,
  type ConversationDetail,
  type ConversationResult,
  type HistoryRun,
  type MatchResult,
  type Scenario,
} from '../api/client';

type Status = {
  text: string;
  tone: 'neutral' | 'good' | 'bad';
};

type Metric = {
  label: string;
  value: number;
  Icon: typeof Bot;
};

const demoTopics = [
  '评估 Another Me 作为黑客松 Agent 社交 Demo 是否能打动投资人。',
  '判断两个真人是否会因为 AI Coding 和音乐产生共同话题。',
  '让小县城用户通过 Agent 理解上海打工人的真实生活压力。',
  '让异地恋双方在时差中通过 Agent 延续陪伴和记忆。',
];

const toneClass = {
  neutral: 'text-stone-600',
  good: 'text-emerald-700',
  bad: 'text-rose-700',
};

const scoreTone = (score: number) => {
  if (score >= 75) return 'bg-emerald-600';
  if (score >= 55) return 'bg-amber-500';
  return 'bg-rose-500';
};

const getRawReport = (conversation: ConversationResult | ConversationDetail | null) => {
  const raw = (conversation?.report as unknown as { raw?: Record<string, unknown> })?.raw;
  return raw || {};
};

const listFromRaw = (raw: Record<string, unknown>, key: string) => {
  const value = raw[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

export const Workbench = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [provider, setProvider] = useState('mock');
  const [agentAId, setAgentAId] = useState('');
  const [agentBId, setAgentBId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [topic, setTopic] = useState(demoTopics[0]);
  const [maxRounds, setMaxRounds] = useState(6);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [conversation, setConversation] = useState<ConversationResult | ConversationDetail | null>(null);
  const [status, setStatus] = useState<Status>({ text: '正在加载 Agent Island 社交系统...', tone: 'neutral' });
  const [busy, setBusy] = useState(false);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId),
    [scenarioId, scenarios],
  );
  const agentA = agents.find((agent) => agent.id === agentAId);
  const agentB = agents.find((agent) => agent.id === agentBId);
  const rawReport = getRawReport(conversation);
  const evolutionNotes = listFromRaw(rawReport, 'evolutionNotes');
  const socialMap = Array.isArray(rawReport.socialMap)
    ? rawReport.socialMap.filter((item): item is { label: string; strength: number; kind: string } => {
      return typeof item === 'object' && item !== null && 'label' in item && 'strength' in item && 'kind' in item;
    })
    : [];
  const metrics: Metric[] = [
    { label: 'Agent 数量', value: agents.length, Icon: Bot },
    { label: 'Scenario 数量', value: scenarios.length, Icon: Compass },
    { label: '历史对话', value: history.length, Icon: History },
    { label: '最大轮次', value: maxRounds, Icon: Clock3 },
  ];

  const load = async () => {
    setStatus({ text: '正在加载 Agent Island 社交系统...', tone: 'neutral' });
    const [health, nextAgents, nextScenarios, nextHistory] = await Promise.all([
      api.health(),
      api.agents(),
      api.scenarios(),
      api.history(),
    ]);
    setProvider(health.provider);
    setAgents(nextAgents);
    setScenarios(nextScenarios);
    setHistory(nextHistory);
    setAgentAId((current) => current || nextAgents[0]?.id || '');
    setAgentBId((current) => current || nextAgents[1]?.id || '');
    setScenarioId((current) => current || nextScenarios[0]?.id || '');
    setStatus({ text: '准备好了。选择场景桌、派出两个 Agent，然后读取社交报告。', tone: 'good' });
  };

  useEffect(() => {
    load().catch((error) => setStatus({ text: error instanceof Error ? error.message : '加载失败。', tone: 'bad' }));
  }, []);

  const requestBody = { agentAId, agentBId, scenarioId, topic, maxRounds };

  const generateMatch = async () => {
    setBusy(true);
    setStatus({ text: '正在根据 Scenario、Skills、Persona 和轮次限制计算匹配度...', tone: 'neutral' });
    try {
      const result = await api.match(requestBody);
      setMatch(result);
      setStatus({ text: '匹配完成。先看匹配理由，再运行对话。', tone: 'good' });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : '匹配失败。', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setStatus({ text: '正在运行 Agent-to-Agent 对话并生成报告...', tone: 'neutral' });
    try {
      const result = await api.converse(requestBody);
      setConversation(result);
      setMatch({
        score: result.run.matchScore,
        reasons: result.run.matchReasons,
        risks: result.run.matchRisks,
        recommendedMaxRounds: result.run.effectiveMaxRounds,
      });
      setHistory(await api.history());
      setStatus({ text: '对话完成。报告、对话记录和历史记录已保存。', tone: 'good' });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : '对话失败。', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f2ea] text-[#1d211f]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5">
        <header className="grid gap-4 border-b border-[#c9c8bd] pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#66796e]">Another Me / Module 03 / Agent Island</p>
            <h1 className="mt-2 max-w-4xl text-4xl font-semibold leading-tight tracking-normal md:text-6xl">
              把数字分身派上岛，让 Agent 替你社交并带回可行动的关系洞察。
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-stone-700">
              这个交付版聚焦「Agent 已存在之后」的社交流程：Agent 进入 Cafe、Exchange、Lab 或 Coding Club，系统完成匹配、运行有限轮对话、保存记录，并返回真人可以使用的社交报告。
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:w-72 lg:grid-cols-1">
            <div className="rounded border border-[#c9c8bd] bg-white p-3">
              <div className="text-xs uppercase text-stone-500">模型接口</div>
              <div className="font-semibold">{provider}</div>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded bg-[#26362d] px-3 py-3 text-white" onClick={() => load()}>
              <RefreshCw size={16} /> 刷新数据
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {metrics.map(({ label, value, Icon }) => (
            <div className="rounded border border-[#c9c8bd] bg-white p-4" key={label}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-600">{label}</span>
                <Icon size={18} />
              </div>
              <div className="mt-2 text-3xl font-semibold">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded border border-[#c9c8bd] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} /> 派遣桌</h2>
              <label className="block text-sm font-medium" htmlFor="scenario">Scenario</label>
              <select id="scenario" className="mt-1 w-full rounded border border-[#c9c8bd] p-2" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
              <p className="mt-2 text-sm leading-6 text-stone-600">{selectedScenario?.description}</p>
              {selectedScenario?.suggestedTopics?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedScenario.suggestedTopics.map((item) => (
                    <button className="rounded border border-[#d5d1c4] px-2 py-1 text-left text-xs text-stone-700" key={item} onClick={() => setTopic(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}

              <label className="mt-4 block text-sm font-medium" htmlFor="agentA">Agent A</label>
              <select id="agentA" className="mt-1 w-full rounded border border-[#c9c8bd] p-2" value={agentAId} onChange={(event) => setAgentAId(event.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>

              <label className="mt-4 block text-sm font-medium" htmlFor="agentB">Agent B</label>
              <select id="agentB" className="mt-1 w-full rounded border border-[#c9c8bd] p-2" value={agentBId} onChange={(event) => setAgentBId(event.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>

              <label className="mt-4 block text-sm font-medium" htmlFor="topic">人类意图 / 任务</label>
              <textarea id="topic" className="mt-1 min-h-32 w-full rounded border border-[#c9c8bd] p-2" value={topic} onChange={(event) => setTopic(event.target.value)} />
              <div className="mt-2 grid gap-2">
                {demoTopics.map((item) => (
                  <button className="rounded border border-[#d5d1c4] px-2 py-1 text-left text-xs text-stone-700" key={item} onClick={() => setTopic(item)}>
                    {item}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-sm font-medium" htmlFor="rounds">最大轮次</label>
              <input id="rounds" className="mt-1 w-full accent-[#8f493f]" min={2} max={10} type="range" value={maxRounds} onChange={(event) => setMaxRounds(Number(event.target.value))} />
              <div className="text-sm text-stone-600">{maxRounds} 轮 Agent 交替发言</div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="rounded bg-[#26362d] px-3 py-2 text-white disabled:opacity-60" disabled={busy || !agentAId || !agentBId || !scenarioId} onClick={generateMatch}>
                  匹配
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded bg-[#9a4d3f] px-3 py-2 text-white disabled:opacity-60" disabled={busy || !agentAId || !agentBId || !scenarioId} onClick={run}>
                  <Play size={16} /> 运行
                </button>
              </div>
              <p className={`mt-3 text-sm ${toneClass[status.tone]}`}>{status.text}</p>
            </div>

            <AgentCard title="Agent A" agent={agentA} />
            <AgentCard title="Agent B" agent={agentB} />
          </aside>

          <section className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded border border-[#c9c8bd] bg-white p-4">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Compass size={18} /> Scenario 房间</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {scenarios.map((scenario) => (
                    <button
                      className={`rounded border p-3 text-left ${scenario.id === scenarioId ? 'border-[#26362d] bg-[#e8f0ea]' : 'border-[#d5d1c4] bg-[#fbfaf6]'}`}
                      key={scenario.id}
                      onClick={() => setScenarioId(scenario.id)}
                    >
                      <div className="font-semibold">{scenario.name}</div>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{scenario.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded border border-[#c9c8bd] bg-white p-4">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity size={18} /> 匹配信号</h2>
                {match ? (
                  <div className="space-y-3">
                    <div className="flex items-end gap-3">
                      <div className={`rounded px-3 py-2 text-5xl font-semibold text-white ${scoreTone(match.score)}`}>{match.score}</div>
                      <div className="pb-1 text-sm text-stone-600">建议 {match.recommendedMaxRounds} 轮</div>
                    </div>
                    <List title="为什么匹配" items={match.reasons} />
                    <List title="需要注意的风险" items={match.risks} danger />
                  </div>
                ) : <p className="text-sm leading-6 text-stone-600">先点击「匹配」，查看适配理由、潜在风险和建议轮次，再派出两个 Agent 进入对话。</p>}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded border border-[#c9c8bd] bg-white p-4">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MessagesSquare size={18} /> Agent 对话记录</h2>
                <div className="space-y-3">
                  {conversation?.messages?.length ? conversation.messages.map((message) => (
                    <article className="rounded border border-[#ddd8ca] bg-[#fbfaf6] p-3" key={message.id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm font-semibold">
                        <span>{message.speakerAgent.name}</span>
                        <span className="text-stone-500">第 {message.turnIndex}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{message.content}</p>
                    </article>
                  )) : <p className="text-sm leading-6 text-stone-600">点击「运行」后会生成完整对话记录。最后两轮会自动收到当前 Scenario 的收尾提示，用来沉淀关系洞察。</p>}
                </div>
              </div>

              <ReportPanel conversation={conversation} rawReport={rawReport} evolutionNotes={evolutionNotes} socialMap={socialMap} />
            </div>

            <div className="rounded border border-[#c9c8bd] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Map size={18} /> 社交地图</h2>
              {socialMap.length ? (
                <div className="grid gap-3 md:grid-cols-4">
                  {socialMap.map((item) => (
                    <div className="rounded border border-[#ddd8ca] bg-[#fbfaf6] p-3" key={item.label}>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="mt-2 h-2 rounded bg-stone-200">
                        <div className="h-2 rounded bg-[#3d7661]" style={{ width: `${item.strength}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-stone-600">
                        <span>{item.kind}</span>
                        <span>{item.strength}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-4">
                  {['共同语境', '信任潜力', '行动准备度', '待解决张力'].map((item) => (
                    <div className="rounded border border-dashed border-[#ddd8ca] p-3 text-sm text-stone-500" key={item}>{item} 会在运行后出现。</div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded border border-[#c9c8bd] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><History size={18} /> 历史对话</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {history.length ? history.map((run) => (
                  <button className="block rounded border border-[#ddd8ca] p-3 text-left text-sm hover:bg-[#f4f2ea]" key={run.id} onClick={async () => setConversation(await api.conversation(run.id))}>
                    <div className="flex items-center justify-between gap-3">
                      <b>{run.scenario.name}</b>
                      <span className="rounded bg-[#26362d] px-2 py-1 text-xs text-white">{run.matchScore}</span>
                    </div>
                    <span className="mt-1 block text-stone-600">{run.agentA.name} x {run.agentB.name}</span>
                    <span className="mt-1 block truncate text-stone-500">{run.topic}</span>
                  </button>
                )) : <p className="text-sm text-stone-600">还没有保存的对话。</p>}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
};

const AgentCard = ({ title, agent }: { title: string; agent?: Agent }) => (
  <div className="rounded border border-[#c9c8bd] bg-white p-4">
    <h3 className="mb-2 flex items-center gap-2 font-semibold"><Bot size={16} /> {title}</h3>
    {agent ? (
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-lg font-semibold">{agent.name}</div>
          <div className="text-stone-500">{agent.ownerLabel} / {agent.category}</div>
        </div>
        <p className="leading-6 text-stone-700">{agent.persona}</p>
        <div className="flex flex-wrap gap-2">
          {agent.skills.map((skill) => <span className="rounded bg-[#e8f0ea] px-2 py-1 text-xs" key={skill}>{skill}</span>)}
        </div>
        <List title="规则" items={agent.rules} />
      </div>
    ) : <p className="text-sm text-stone-600">请选择一个 Agent。</p>}
  </div>
);

const List = ({ title, items, danger = false }: { title: string; items: string[]; danger?: boolean }) => (
  <div>
    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
    <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm leading-6 ${danger ? 'text-rose-700' : 'text-stone-700'}`}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  </div>
);

const ReportPanel = ({
  conversation,
  rawReport,
  evolutionNotes,
  socialMap,
}: {
  conversation: ConversationResult | ConversationDetail | null;
  rawReport: Record<string, unknown>;
  evolutionNotes: string[];
  socialMap: Array<{ label: string; strength: number; kind: string }>;
}) => (
  <div className="rounded border border-[#c9c8bd] bg-white p-4">
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Brain size={18} /> 社交报告</h2>
    {conversation?.report ? (
      <div className="space-y-3 text-sm">
        <div className="rounded bg-[#26362d] p-3 text-white">
          <div className="text-xs uppercase opacity-70">结果</div>
          <p className="mt-1 leading-6">{conversation.report.summary}</p>
        </div>
        {typeof rawReport.relationshipSignal === 'string' && rawReport.relationshipSignal ? (
          <div>
            <b>关系信号</b>
            <p className="mt-1 leading-6 text-stone-700">{rawReport.relationshipSignal}</p>
          </div>
        ) : null}
        {typeof rawReport.scenarioFit === 'string' && rawReport.scenarioFit ? (
          <div>
            <b>场景适配</b>
            <p className="mt-1 leading-6 text-stone-700">{rawReport.scenarioFit}</p>
          </div>
        ) : null}
        <List title="共同点" items={conversation.report.sharedInterests} />
        <List title="分歧与张力" items={conversation.report.tensions} danger />
        <List title="下一步" items={conversation.report.suggestedNextSteps} />
        {evolutionNotes.length ? <List title="Agent 进化笔记" items={evolutionNotes} /> : null}
        {socialMap.length ? (
          <div className="flex items-center gap-2 rounded border border-[#ddd8ca] bg-[#fbfaf6] p-2 text-stone-700">
            <Route size={16} />
            <span>{socialMap.length} 条社交地图信号已从本次对话生成。</span>
          </div>
        ) : null}
        <div>
          <b>可复用 Prompt</b>
          <p className="mt-1 rounded border border-[#ddd8ca] bg-[#fbfaf6] p-2 leading-6 text-stone-700">{conversation.report.reusablePrompt}</p>
        </div>
      </div>
    ) : <p className="text-sm leading-6 text-stone-600">运行完成后会生成报告。它会回答：真人是否值得继续这段连接、Agent 学到了什么、下一步该做什么？</p>}
  </div>
);
