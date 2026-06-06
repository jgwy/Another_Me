import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Code2,
  Coffee,
  FlaskConical,
  HeartHandshake,
  History,
  Loader2,
  MessageCircle,
  Play,
  Radar,
  RefreshCw,
  Route,
  Save,
  Signal,
  Target,
  UsersRound,
} from 'lucide-react';
import {
  api,
  type Agent,
  type AutonomousPlan,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationResult,
  type HistoryRun,
  type PlaybackStep,
  type Scenario,
  type StructuredSocialReport,
} from '../api/client';

type StatusTone = 'neutral' | 'good' | 'bad';

type SceneNode = {
  slug: string;
  name: string;
  x: number;
  y: number;
  Icon: typeof Coffee;
  role: string;
  defaultGoal: string;
};

type AgentNode = {
  agent: Agent;
  x: number;
  y: number;
  tone: string;
};

type PlaybackState = {
  activeIndex: number;
  activeKind: PlaybackStep['kind'] | 'idle';
  line: string;
};

const sceneNodes: SceneNode[] = [
  { slug: 'cafe', name: 'Cafe', x: 21, y: 31, Icon: Coffee, role: '兴趣发现', defaultGoal: '想发现兴趣和轻社交连接，判断是否值得继续认识' },
  { slug: 'exchange', name: 'Exchange', x: 72, y: 27, Icon: BriefcaseBusiness, role: '商业判断', defaultGoal: '想判断这段关系是否有投资、商业或合作价值' },
  { slug: 'lab', name: 'Lab', x: 62, y: 67, Icon: FlaskConical, role: '研究探索', defaultGoal: '想探索一个研究或专业问题，并转成低风险实验' },
  { slug: 'coding-club', name: 'Coding Club', x: 34, y: 71, Icon: Code2, role: '项目协作', defaultGoal: '想寻找 AI Coding 或项目协作对象，一起推进可交付 Demo' },
  { slug: 'memory-garden', name: 'Memory Garden', x: 18, y: 61, Icon: HeartHandshake, role: '长期陪伴', defaultGoal: '想维护朋友、异地或长期陪伴关系里的共同记忆' },
  { slug: 'signal-tower', name: 'Signal Tower', x: 49, y: 18, Icon: Signal, role: '报告中心', defaultGoal: '查看社交报告和关系图谱' },
];

const agentPalette = ['#305c55', '#9a4d3f', '#5c628c', '#9a7c2f', '#607246', '#855f7f', '#2d6e8a', '#7b4b38'];

const demoGoals = [
  '想找投资人评估这个 Agent 社交 Demo 是否值得继续融资',
  '想找 coding partner 一起把黑客松 Demo 做完整',
  '想发现 AI Coding 和独立音乐的共同兴趣',
  '想维护一段异地关系里的陪伴和共同记忆',
  '想把一个模糊研究问题转成低风险实验',
];

const toneClass: Record<StatusTone, string> = {
  neutral: 'text-stone-600',
  good: 'text-emerald-700',
  bad: 'text-rose-700',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getRawReport = (conversation: ConversationResult | ConversationDetail | null) => {
  const raw = (conversation?.report as unknown as { raw?: Record<string, unknown> })?.raw;
  return raw || {};
};

const listFromRaw = (raw: Record<string, unknown>, key: string) => {
  const value = raw[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

const structuredFromRaw = (raw: Record<string, unknown>): StructuredSocialReport | null => {
  const value = raw.structuredSocialReport;
  if (!value || typeof value !== 'object') return null;
  const report = value as StructuredSocialReport;
  return typeof report.relationshipScore === 'number' ? report : null;
};

const socialMapFromRaw = (raw: Record<string, unknown>) => {
  const value = raw.socialMap;
  return Array.isArray(value)
    ? value.filter((item): item is { label: string; strength: number; kind: string } =>
      typeof item === 'object'
      && item !== null
      && typeof (item as { label?: unknown }).label === 'string'
      && typeof (item as { strength?: unknown }).strength === 'number'
      && typeof (item as { kind?: unknown }).kind === 'string')
    : [];
};

const edgeTone = (score: number) => {
  if (score >= 75) return '#3d7661';
  if (score >= 55) return '#c49a35';
  return '#bd4d4d';
};

export const Workbench = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [provider, setProvider] = useState('mock');
  const [sourceAgentId, setSourceAgentId] = useState('');
  const [goal, setGoal] = useState(demoGoals[0]);
  const [maxRounds, setMaxRounds] = useState(6);
  const [status, setStatus] = useState<{ text: string; tone: StatusTone }>({
    text: '正在加载 Agent Island...',
    tone: 'neutral',
  });
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<AutonomousPlan | null>(null);
  const [conversation, setConversation] = useState<ConversationResult | ConversationDetail | null>(null);
  const [structuredReport, setStructuredReport] = useState<StructuredSocialReport | null>(null);
  const [selectedSceneSlug, setSelectedSceneSlug] = useState<string>('cafe');
  const [runningSceneSlug, setRunningSceneSlug] = useState<string | null>(null);
  const [completedSceneSlug, setCompletedSceneSlug] = useState<string | null>(null);
  const [inspectedSceneSlug, setInspectedSceneSlug] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({
    activeIndex: -1,
    activeKind: 'idle',
    line: '等待派出 Agent。',
  });
  const reportRef = useRef<HTMLElement | null>(null);

  const selectedAgent = agents.find((agent) => agent.id === sourceAgentId);
  const rawReport = getRawReport(conversation);
  const fallbackStructuredReport = structuredReport || structuredFromRaw(rawReport);
  const evolutionNotes = listFromRaw(rawReport, 'evolutionNotes');
  const socialMap = socialMapFromRaw(rawReport);
  const selectedScene = plan?.scenario || scenarios.find((scenario) => scenario.slug === selectedSceneSlug) || scenarios[0];
  const targetAgent = plan?.targetAgent;

  const agentNodes = useMemo<AgentNode[]>(() => agents.slice(0, 12).map((agent, index) => {
    const ring = index % 8;
    const x = [44, 56, 28, 78, 16, 67, 38, 52][ring] + Math.floor(index / 8) * 4;
    const y = [49, 45, 47, 52, 75, 78, 24, 84][ring] - Math.floor(index / 8) * 5;
    return { agent, x, y, tone: agentPalette[index % agentPalette.length] };
  }), [agents]);

  const sourceNode = agentNodes.find((node) => node.agent.id === sourceAgentId);
  const targetNode = agentNodes.find((node) => node.agent.id === targetAgent?.id);
  const sceneNode = sceneNodes.find((node) => node.slug === selectedScene?.slug) || sceneNodes[0];

  const movingToScene = busy && ['choose_scene', 'move', 'match', 'conversation'].includes(playback.activeKind);
  const activeAgentPosition = movingToScene && sceneNode
    ? { x: sceneNode.x - 4, y: sceneNode.y + 8 }
    : { x: sourceNode?.x || 44, y: sourceNode?.y || 49 };

  const load = async () => {
    setStatus({ text: '正在加载 Agent、场景和历史记录...', tone: 'neutral' });
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
    setSourceAgentId((current) => current || nextAgents[0]?.id || '');
    setStatus({ text: '准备好了。选择 Agent 和目标，然后开始自主社交。', tone: 'good' });
  };

  useEffect(() => {
    load().catch((error) => setStatus({ text: error instanceof Error ? error.message : '加载失败。', tone: 'bad' }));
  }, []);

  const playSteps = async (steps: PlaybackStep[]) => {
    for (const [index, step] of steps.entries()) {
      setPlayback({ activeIndex: index, activeKind: step.kind, line: step.detail });
      await new Promise((resolve) => { window.setTimeout(resolve, step.kind === 'conversation' ? 1200 : 700); });
    }
  };

  const startAutonomousRun = async (nextGoal?: string) => {
    if (!sourceAgentId) return;
    if (nextGoal) setGoal(nextGoal);
    setBusy(true);
    setRunningSceneSlug(null);
    setCompletedSceneSlug(null);
    setConversation(null);
    setPlan(null);
    setStructuredReport(null);
    setPlayback({ activeIndex: 0, activeKind: 'read_profile', line: 'Agent 正在读取自身画像和目标。' });
    setStatus({ text: '自主社交运行中：选择场景、寻找对象、生成对话和报告...', tone: 'neutral' });
    try {
      const result = await api.autonomousRun({
        sourceAgentId,
        goal: nextGoal || goal,
        maxRounds,
      });
      setPlan(result.plan);
      setSelectedSceneSlug(result.plan.scenario.slug);
      setRunningSceneSlug(result.plan.scenario.slug);
      const playbackPromise = playSteps(result.plan.playbackSteps);
      await playbackPromise;
      setConversation(result.conversation);
      setStructuredReport(result.structuredReport);
      setHistory(await api.history());
      setCompletedSceneSlug(result.plan.scenario.slug);
      setPlayback({
        activeIndex: result.plan.playbackSteps.length - 1,
        activeKind: 'report',
        line: '社交报告已生成，关系线和下一步建议已写入 Signal Tower。',
      });
      setStatus({ text: '自主社交完成。报告、关系线和历史记录已保存。', tone: 'good' });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : '自主社交失败。', tone: 'bad' });
      setPlayback({ activeIndex: -1, activeKind: 'idle', line: '运行失败，请调整目标或刷新数据。' });
    } finally {
      setRunningSceneSlug(null);
      setBusy(false);
    }
  };

  const handleSceneClick = (scene: SceneNode) => {
    setInspectedSceneSlug(scene.slug);
    setSelectedSceneSlug(scene.slug);
    if (scene.slug === 'signal-tower') {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPlayback({ activeIndex: -1, activeKind: 'report', line: 'Signal Tower 已打开，查看最新社交报告和关系图谱。' });
      return;
    }
    setPlayback({ activeIndex: -1, activeKind: 'idle', line: `${scene.name} 状态已展开。AI 派出后会自己判断是否前往这里。` });
  };

  const openHistory = async (run: HistoryRun) => {
    setStatus({ text: '正在打开历史社交报告...', tone: 'neutral' });
    const detail = await api.conversation(run.id);
    setConversation(detail);
    setStructuredReport(null);
    const raw = getRawReport(detail);
    const historyPlan = raw.autonomousPlan as { sourceAgentId?: string; targetAgentId?: string; scenarioId?: string } | undefined;
    if (historyPlan?.sourceAgentId) setSourceAgentId(historyPlan.sourceAgentId);
    setStatus({ text: '历史记录已打开。', tone: 'good' });
  };

  return (
    <main className="min-h-screen overflow-x-auto bg-[#edf1ed] text-[#1c211f]">
      <div className="desktop-demo-shell grid min-h-screen gap-0">
        <AgentConsole
          agents={agents}
          busy={busy}
          goal={goal}
          maxRounds={maxRounds}
          provider={provider}
          selectedAgent={selectedAgent}
          sourceAgentId={sourceAgentId}
          status={status}
          onGoalChange={setGoal}
          onMaxRoundsChange={setMaxRounds}
          onRefresh={() => load()}
          onSourceAgentChange={setSourceAgentId}
          onStart={() => startAutonomousRun(goal)}
        />

        <section className="flex min-h-screen flex-col border-x border-[#cbd3cb] bg-[#f7f7f1]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd3cb] px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#687a70]">Module 03 Pro / Agent Island 社交地图</p>
              <h1 className="mt-1 text-2xl font-semibold md:text-3xl">派出 Agent，让它替你完成一次低成本高信号社交。</h1>
            </div>
            <div className="flex items-center gap-2 rounded border border-[#cbd3cb] bg-white px-3 py-2 text-sm">
              {busy ? <Loader2 className="animate-spin" size={16} /> : <Radar size={16} />}
              <span>{playback.line}</span>
            </div>
          </header>
          <IslandMap
            activeAgentPosition={activeAgentPosition}
            agentNodes={agentNodes}
            busy={busy}
            conversation={conversation}
            fallbackStructuredReport={fallbackStructuredReport}
            playback={playback}
            sceneNode={sceneNode}
            scenes={sceneNodes}
            selectedSceneSlug={selectedSceneSlug}
            inspectedSceneSlug={inspectedSceneSlug}
            runningSceneSlug={runningSceneSlug}
            completedSceneSlug={completedSceneSlug}
            onSceneClick={handleSceneClick}
            sourceAgentId={sourceAgentId}
            sourceNode={sourceNode}
            targetAgent={targetAgent}
            targetNode={targetNode}
          />

          <ReportDock
            conversation={conversation}
            evolutionNotes={evolutionNotes}
            history={history}
            ref={reportRef}
            onOpenHistory={(run) => {
              openHistory(run).catch((error) =>
                setStatus({ text: error instanceof Error ? error.message : '打开历史失败。', tone: 'bad' }));
            }}
            plan={plan}
            rawReport={rawReport}
            socialMap={socialMap}
            structuredReport={fallbackStructuredReport}
          />
        </section>

        <LivePanel
          busy={busy}
          conversation={conversation}
          playback={playback}
          plan={plan}
          selectedAgent={selectedAgent}
          structuredReport={fallbackStructuredReport}
        />
      </div>
    </main>
  );
};

const AgentConsole = ({
  agents,
  busy,
  goal,
  maxRounds,
  provider,
  selectedAgent,
  sourceAgentId,
  status,
  onGoalChange,
  onMaxRoundsChange,
  onRefresh,
  onSourceAgentChange,
  onStart,
}: {
  agents: Agent[];
  busy: boolean;
  goal: string;
  maxRounds: number;
  provider: string;
  selectedAgent?: Agent;
  sourceAgentId: string;
  status: { text: string; tone: StatusTone };
  onGoalChange: (value: string) => void;
  onMaxRoundsChange: (value: number) => void;
  onRefresh: () => void;
  onSourceAgentChange: (value: string) => void;
  onStart: () => void;
}) => (
  <aside className="min-h-screen overflow-y-auto bg-[#fbfaf6] px-4 py-5">
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-stone-500">Agent 控制台</div>
        <div className="text-lg font-semibold">Autonomous Mode</div>
      </div>
      <button className="icon-button" onClick={onRefresh} type="button" title="刷新数据">
        <RefreshCw size={18} />
      </button>
    </div>

    <div className="panel-block">
      <label className="field-label" htmlFor="sourceAgent">当前 Agent</label>
      <select id="sourceAgent" className="field-input" value={sourceAgentId} onChange={(event) => onSourceAgentChange(event.target.value)}>
        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select>
      {selectedAgent ? (
        <div className="mt-3 rounded border border-[#d7d7cd] bg-white p-3">
          <div className="flex items-center gap-2">
            <AgentAvatar name={selectedAgent.name} tone="#305c55" />
            <div>
              <div className="font-semibold">{selectedAgent.name}</div>
              <div className="text-xs text-stone-500">{selectedAgent.ownerLabel} / {selectedAgent.category}</div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-700">{selectedAgent.persona}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedAgent.skills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}
          </div>
        </div>
      ) : null}
    </div>

    <div className="panel-block">
      <label className="field-label" htmlFor="goal">社交目标</label>
      <textarea id="goal" className="field-input min-h-28 resize-none" value={goal} onChange={(event) => onGoalChange(event.target.value)} />
      <div className="mt-2 grid gap-2">
        {demoGoals.map((item) => (
          <button className="preset-button" key={item} onClick={() => onGoalChange(item)} type="button">
            <ChevronRight size={14} />
            <span>{item}</span>
          </button>
        ))}
      </div>
    </div>

    <div className="panel-block">
      <div className="flex items-center justify-between gap-3">
        <label className="field-label" htmlFor="rounds">对话轮次</label>
        <span className="text-sm font-semibold">{maxRounds} 轮</span>
      </div>
      <input id="rounds" className="mt-2 w-full accent-[#9a4d3f]" min={2} max={10} type="range" value={maxRounds} onChange={(event) => onMaxRoundsChange(Number(event.target.value))} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <MetricTile Icon={Bot} label="Agents" value={agents.length} />
        <MetricTile Icon={Brain} label="LLM" value={provider} />
      </div>
    </div>

    <button className="primary-command" disabled={busy || !sourceAgentId} onClick={onStart} type="button">
      {busy ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
      <span>派出 Agent</span>
    </button>
    <p className={`mt-3 text-sm leading-6 ${toneClass[status.tone]}`}>{status.text}</p>
  </aside>
);

const IslandMap = ({
  activeAgentPosition,
  agentNodes,
  busy,
  conversation,
  fallbackStructuredReport,
  playback,
  sceneNode,
  scenes,
  selectedSceneSlug,
  inspectedSceneSlug,
  runningSceneSlug,
  completedSceneSlug,
  onSceneClick,
  sourceAgentId,
  sourceNode,
  targetAgent,
  targetNode,
}: {
  activeAgentPosition: { x: number; y: number };
  agentNodes: AgentNode[];
  busy: boolean;
  conversation: ConversationResult | ConversationDetail | null;
  fallbackStructuredReport: StructuredSocialReport | null;
  playback: PlaybackState;
  sceneNode?: SceneNode;
  scenes: SceneNode[];
  selectedSceneSlug?: string;
  inspectedSceneSlug: string | null;
  runningSceneSlug: string | null;
  completedSceneSlug: string | null;
  onSceneClick: (scene: SceneNode) => void;
  sourceAgentId: string;
  sourceNode?: AgentNode;
  targetAgent?: Agent;
  targetNode?: AgentNode;
}) => {
  const edge = fallbackStructuredReport?.mapUpdates[0];
  const inspectedScene = scenes.find((scene) => scene.slug === inspectedSceneSlug);
  return (
    <div className="relative flex-1 overflow-hidden p-4">
      <div className="guide-map-stage">
        <div className="guide-paper-grid" />
        <div className="map-entry-callout">
          <span>Agent Island 导览图</span>
          <b>点击「派出 Agent」，AI 会自己决定去哪一站</b>
        </div>
        {inspectedScene ? (
          <div className="scene-inspector">
            <span>建筑状态</span>
            <b>{inspectedScene.name}</b>
            <p>{runningSceneSlug === inspectedScene.slug ? '当前会话中' : completedSceneSlug === inspectedScene.slug ? '刚生成一条关系信号' : '等待 AI 自主路由'}</p>
          </div>
        ) : null}

        <svg className="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="guide-boundary" d="M 11 18 C 24 6, 48 11, 58 8 C 80 2, 93 18, 88 37 C 99 53, 88 78, 69 83 C 50 94, 28 87, 17 75 C 4 61, 2 33, 11 18 Z" />
          <path className="guide-main-path" d="M 44 49 C 33 43, 25 38, 21 31 C 30 25, 39 21, 49 18 C 60 20, 67 23, 72 27 C 69 41, 65 54, 62 67 C 52 69, 43 70, 34 71 C 26 70, 21 66, 18 61 C 25 56, 35 52, 44 49 Z" />
          <path className="guide-side-path" d="M 49 18 C 50 30, 49 40, 44 49 M 44 49 C 55 50, 65 44, 72 27 M 44 49 C 49 58, 55 64, 62 67" />
          {sourceNode && sceneNode ? (
            <path
              className={busy ? 'route-line route-line-active' : 'route-line'}
              d={`M ${sourceNode.x} ${sourceNode.y} C ${(sourceNode.x + sceneNode.x) / 2} ${sourceNode.y - 14}, ${(sourceNode.x + sceneNode.x) / 2} ${sceneNode.y + 14}, ${sceneNode.x} ${sceneNode.y}`}
            />
          ) : null}
          {edge && sourceNode && targetNode ? (
            <line
              className="relationship-line"
              stroke={edgeTone(edge.strength)}
              x1={sourceNode.x}
              x2={targetNode.x}
              y1={sourceNode.y}
              y2={targetNode.y}
            />
          ) : null}
        </svg>

        {scenes.map((scene) => (
          <SceneMarker
            active={scene.slug === selectedSceneSlug}
            completed={scene.slug === completedSceneSlug}
            key={scene.slug}
            running={scene.slug === runningSceneSlug}
            scene={scene}
            onClick={() => onSceneClick(scene)}
          />
        ))}

        {agentNodes.map((node) => {
          const active = node.agent.id === sourceAgentId;
          const matched = node.agent.id === targetAgent?.id;
          const position = active ? activeAgentPosition : { x: node.x, y: node.y };
          return (
            <AgentMarker
              active={active}
              key={node.agent.id}
              matched={matched}
              node={node}
              position={position}
            />
          );
        })}

        {busy || conversation?.messages?.length ? (
          <SpeechBubble
            message={conversation?.messages?.[Math.min(conversation.messages.length - 1, 1)]}
            playback={playback}
            sceneNode={sceneNode}
          />
        ) : null}

        {edge && sourceNode && targetNode ? (
          <div className="edge-label" style={{ left: `${(sourceNode.x + targetNode.x) / 2}%`, top: `${(sourceNode.y + targetNode.y) / 2}%` }}>
            {edge.label} / {edge.strength}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const LivePanel = ({
  busy,
  conversation,
  playback,
  plan,
  selectedAgent,
  structuredReport,
}: {
  busy: boolean;
  conversation: ConversationResult | ConversationDetail | null;
  playback: PlaybackState;
  plan: AutonomousPlan | null;
  selectedAgent?: Agent;
  structuredReport: StructuredSocialReport | null;
}) => (
  <aside className="min-h-screen overflow-y-auto bg-[#fbfaf6] px-4 py-5">
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider text-stone-500">实时社交面板</div>
      <h2 className="text-lg font-semibold">Run Timeline</h2>
    </div>

    <div className="panel-block">
      <div className="flex items-center gap-3">
        {busy ? <Loader2 className="animate-spin text-[#9a4d3f]" size={22} /> : <CheckCircle2 className="text-[#3d7661]" size={22} />}
        <div>
          <div className="font-semibold">{playback.activeKind === 'idle' ? '待命' : playback.activeKind}</div>
          <p className="text-sm leading-6 text-stone-600">{playback.line}</p>
        </div>
      </div>
    </div>

    <div className="panel-block">
      <h3 className="section-title"><Target size={16} /> 当前判断</h3>
      {plan ? (
        <div className="space-y-3 text-sm">
          <SignalRow label="派出" value={plan.sourceAgent.name} />
          <SignalRow label="场景" value={plan.scenario.name} />
          <SignalRow label="对象" value={plan.targetAgent.name} />
          <SignalRow label="匹配度" value={`${plan.score}`} />
          <List title="选择理由" items={plan.reasons.slice(0, 5)} />
          <List danger title="风险提示" items={plan.risks} />
        </div>
      ) : (
        <p className="text-sm leading-6 text-stone-600">{selectedAgent?.name || 'Agent'} 会先读取画像，再自动选择场景和候选对象。</p>
      )}
    </div>

    <div className="panel-block">
      <h3 className="section-title"><MessageCircle size={16} /> 对话气泡</h3>
      <div className="space-y-3">
        {conversation?.messages?.length ? conversation.messages.slice(0, 6).map((message) => (
          <MessageCard key={message.id} message={message} />
        )) : (
          <p className="text-sm leading-6 text-stone-600">运行时会显示 Agent-to-Agent 的关键发言。第一版用播放式状态呈现实时过程，结果由后端保存。</p>
        )}
      </div>
    </div>

    <div className="panel-block">
      <h3 className="section-title"><Route size={16} /> 关系结果</h3>
      {structuredReport ? (
        <div className="space-y-3 text-sm">
          <div className="score-card">
            <span>{structuredReport.relationshipScore}</span>
            <div>
              <b>{structuredReport.relationshipType}</b>
              <p>{structuredReport.summary}</p>
            </div>
          </div>
          <List title="真人下一步" items={structuredReport.nextHumanActions} />
        </div>
      ) : (
        <p className="text-sm leading-6 text-stone-600">报告完成后会在这里显示关系强度、关系类型和下一步行动。</p>
      )}
    </div>
  </aside>
);

const ReportDock = forwardRef<HTMLElement, {
  conversation: ConversationResult | ConversationDetail | null;
  evolutionNotes: string[];
  history: HistoryRun[];
  onOpenHistory: (run: HistoryRun) => void;
  plan: AutonomousPlan | null;
  rawReport: Record<string, unknown>;
  socialMap: Array<{ label: string; strength: number; kind: string }>;
  structuredReport: StructuredSocialReport | null;
}>(({
  conversation,
  evolutionNotes,
  history,
  onOpenHistory,
  plan,
  rawReport,
  socialMap,
  structuredReport,
}, ref) => (
  <section ref={ref} className="border-t border-[#cbd3cb] bg-[#fbfaf6] px-5 py-4">
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_360px]">
      <div className="dock-panel">
        <h2 className="section-title"><Brain size={18} /> Signal Tower 报告</h2>
        {conversation?.report ? (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded bg-[#26362d] p-3 text-white md:col-span-2">
              <div className="text-xs uppercase opacity-70">Summary</div>
              <p className="mt-1 leading-6">{structuredReport?.summary || conversation.report.summary}</p>
            </div>
            <List title="共同兴趣" items={structuredReport?.sharedInterests || conversation.report.sharedInterests} />
            <List danger title="张力/风险" items={structuredReport?.tensions || conversation.report.tensions} />
            <List title="下一步行动" items={structuredReport?.nextHumanActions || conversation.report.suggestedNextSteps} />
            {evolutionNotes.length ? <List title="Agent 学到了什么" items={evolutionNotes} /> : (
              <p className="leading-6 text-stone-700">{structuredReport?.agentLearning || '运行完成后会沉淀 Agent 学习记录。'}</p>
            )}
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-600">运行完成后，这里会生成结构化中文报告：是否值得继续、为什么匹配、共同兴趣、风险提示和真人下一步。</p>
        )}
      </div>

      <div className="dock-panel">
        <h2 className="section-title"><UsersRound size={18} /> 社交地图信号</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {structuredReport?.mapUpdates.map((edge) => (
            <div className="signal-card" key={`${edge.from}-${edge.to}`}>
              <div className="flex items-center justify-between gap-2">
                <b>{edge.label}</b>
                <span>{edge.strength}</span>
              </div>
              <p className="mt-2 text-xs text-stone-600">{edge.from} → {edge.to}</p>
              <div className="mt-3 h-2 rounded bg-stone-200">
                <div className="h-2 rounded" style={{ width: `${clamp(edge.strength, 0, 100)}%`, background: edgeTone(edge.strength) }} />
              </div>
            </div>
          ))}
          {!structuredReport && socialMap.map((item) => (
            <div className="signal-card" key={item.label}>
              <div className="flex items-center justify-between gap-2">
                <b>{item.label}</b>
                <span>{item.strength}</span>
              </div>
              <p className="mt-2 text-xs text-stone-600">{item.kind}</p>
              <div className="mt-3 h-2 rounded bg-stone-200">
                <div className="h-2 rounded bg-[#3d7661]" style={{ width: `${clamp(item.strength, 0, 100)}%` }} />
              </div>
            </div>
          ))}
          {!structuredReport && !socialMap.length ? ['共同语境', '信任潜力', '行动准备度', '待解决张力'].map((item) => (
            <div className="rounded border border-dashed border-[#d7d7cd] p-3 text-sm text-stone-500" key={item}>{item} 会在运行后出现。</div>
          )) : null}
        </div>
      </div>

      <div className="dock-panel">
        <h2 className="section-title"><History size={18} /> 历史记录</h2>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {history.length ? history.map((run) => (
            <button className="history-item" key={run.id} onClick={() => onOpenHistory(run)} type="button">
              <div className="flex items-center justify-between gap-3">
                <b>{run.scenario.name}</b>
                <span style={{ background: edgeTone(run.matchScore) }}>{run.matchScore}</span>
              </div>
              <p>{run.agentA.name} x {run.agentB.name}</p>
              <small>{run.topic}</small>
            </button>
          )) : <p className="text-sm text-stone-600">还没有保存的自主社交任务。</p>}
        </div>
      </div>
    </div>
    {typeof rawReport.reusablePrompt === 'string' && rawReport.reusablePrompt ? (
      <div className="mt-4 flex items-start gap-3 rounded border border-[#d7d7cd] bg-white p-3 text-sm">
        <Save className="mt-1 shrink-0 text-[#687a70]" size={16} />
        <p className="leading-6 text-stone-700">{rawReport.reusablePrompt}</p>
      </div>
    ) : null}
    {plan ? <p className="mt-3 text-xs text-stone-500">本次自动路径：{plan.sourceAgent.name} → {plan.scenario.name} → {plan.targetAgent.name}</p> : null}
  </section>
));

const SceneMarker = ({
  active,
  completed,
  running,
  scene,
  onClick,
}: {
  active: boolean;
  completed: boolean;
  running: boolean;
  scene: SceneNode;
  onClick: () => void;
}) => {
  const Icon = scene.Icon;
  const isTower = scene.slug === 'signal-tower';
  return (
    <button
      aria-label={`${scene.name} building`}
      className={`scene-marker ${active ? 'scene-marker-active' : ''} ${running ? 'scene-marker-running' : ''} ${completed ? 'scene-marker-completed' : ''}`}
      onClick={onClick}
      style={{ left: `${scene.x}%`, top: `${scene.y}%` }}
      type="button"
    >
      <div className="scene-building">
        <div className="scene-roof" />
        <div className="scene-icon"><Icon size={20} /></div>
      </div>
      <div className="scene-copy">
        <b>{scene.name}</b>
        <span>{scene.role}</span>
        <small>{isTower ? '查看报告' : '点击直接开始'}</small>
      </div>
    </button>
  );
};

const AgentMarker = ({
  active,
  matched,
  node,
  position,
}: {
  active: boolean;
  matched: boolean;
  node: AgentNode;
  position: { x: number; y: number };
}) => (
  <div
    className={`agent-marker ${active ? 'agent-marker-active' : ''} ${matched ? 'agent-marker-matched' : ''}`}
    style={{ left: `${position.x}%`, top: `${position.y}%`, '--agent-tone': node.tone } as React.CSSProperties}
    title={node.agent.name}
  >
    <AgentAvatar name={node.agent.name} tone={node.tone} />
    <span>{node.agent.name.replace(' Agent', '')}</span>
  </div>
);

const AgentAvatar = ({ name, tone }: { name: string; tone: string }) => (
  <div className="agent-avatar" style={{ background: tone }}>
    {name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
  </div>
);

const SpeechBubble = ({
  message,
  playback,
  sceneNode,
}: {
  message?: ConversationMessage;
  playback: PlaybackState;
  sceneNode?: SceneNode;
}) => (
  <div className="speech-bubble" style={{ left: `${sceneNode ? sceneNode.x + 3 : 54}%`, top: `${sceneNode ? sceneNode.y - 8 : 36}%` }}>
    <b>{message?.speakerAgent.name || playback.activeKind}</b>
    <p>{message?.content || playback.line}</p>
  </div>
);

const MetricTile = ({ Icon, label, value }: { Icon: typeof Bot; label: string; value: number | string }) => (
  <div className="rounded border border-[#d7d7cd] bg-white p-2">
    <div className="flex items-center justify-between gap-2 text-stone-500">
      <span>{label}</span>
      <Icon size={14} />
    </div>
    <div className="mt-1 truncate font-semibold">{value}</div>
  </div>
);

const SignalRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3 border-b border-[#e2e0d7] pb-2">
    <span className="text-stone-500">{label}</span>
    <b className="text-right">{value}</b>
  </div>
);

const MessageCard = ({ message }: { message: ConversationMessage }) => (
  <article className="rounded border border-[#ddd8ca] bg-white p-3">
    <div className="mb-1 flex items-center justify-between gap-3 text-sm font-semibold">
      <span>{message.speakerAgent.name}</span>
      <span className="text-stone-500">#{message.turnIndex}</span>
    </div>
    <p className="line-clamp-4 text-sm leading-6 text-stone-700">{message.content}</p>
  </article>
);

const List = ({ title, items, danger = false }: { title: string; items: string[]; danger?: boolean }) => (
  <div>
    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
    {items.length ? (
      <ul className={`mt-1 list-disc space-y-1 pl-5 text-sm leading-6 ${danger ? 'text-rose-700' : 'text-stone-700'}`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    ) : <p className="mt-1 text-sm text-stone-500">暂无。</p>}
  </div>
);
