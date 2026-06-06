import type { Agent, Scenario } from '../generated/prisma/client';
import { matchAgents } from './matcher';

type SceneIntent = {
  slug: string;
  keywords: string[];
  targetHints: string[];
  label: string;
};

type PlaybackStepKind = 'read_profile' | 'choose_scene' | 'move' | 'match' | 'conversation' | 'report';
type MapEventType = 'thinking' | 'choose_scene' | 'move' | 'discover' | 'conversation' | 'report';

export type AutonomousPlaybackStep = {
  kind: PlaybackStepKind;
  title: string;
  detail: string;
};

export type AutonomousMapEvent = {
  type: MapEventType;
  label: string;
  sceneSlug?: string;
  agentId?: string;
};

export type AutonomousPlanInput = {
  sourceAgentId: string;
  goal: string;
  preferredScenarioSlug?: string;
  agents: Agent[];
  scenarios: Scenario[];
  maxRounds: number;
};

export type AutonomousPlan = {
  sourceAgent: Agent;
  targetAgent: Agent;
  scenario: Scenario;
  topic: string;
  maxRounds: number;
  score: number;
  reasons: string[];
  risks: string[];
  route: string[];
  mapEvents: AutonomousMapEvent[];
  playbackSteps: AutonomousPlaybackStep[];
};

export type SocialReportShapeInput = {
  sourceAgentName: string;
  targetAgentName: string;
  scenarioName: string;
  matchScore: number;
  summary: string;
  sharedInterests: string[];
  tensions: string[];
  suggestedNextSteps: string[];
};

export type StructuredSocialReport = {
  relationshipScore: number;
  relationshipType: string;
  summary: string;
  sharedInterests: string[];
  tensions: string[];
  nextHumanActions: string[];
  mapUpdates: Array<{
    from: string;
    to: string;
    strength: number;
    label: string;
  }>;
  agentLearning: string;
};

const sceneIntents: SceneIntent[] = [
  {
    slug: 'exchange',
    label: '商业/投资/合作判断',
    keywords: ['投资', '融资', '商业', '合作', '市场', '资本', 'vc', 'investor', 'business'],
    targetHints: ['投资', '风险投资', '商业模式', '市场分析', 'VC'],
  },
  {
    slug: 'coding-club',
    label: 'AI Coding/项目协作',
    keywords: ['coding', '代码', '工程', '项目', '协作', 'demo', '黑客松', '开发', 'ai coding'],
    targetHints: ['工程', 'AI Coding', '系统设计', '调试排错'],
  },
  {
    slug: 'lab',
    label: '专业知识/研究探索',
    keywords: ['研究', '实验', '专业', '知识', '假设', '数据', 'lab', 'research'],
    targetHints: ['研究', '实验规划', '科学谨慎'],
  },
  {
    slug: 'memory-garden',
    label: '长期陪伴/关系维护',
    keywords: ['异地恋', '长期', '陪伴', '朋友', '记忆', '关系', '情绪', 'memory'],
    targetHints: ['关系', '记忆提示', '情绪支持', '异步陪伴'],
  },
  {
    slug: 'cafe',
    label: '轻社交/兴趣发现',
    keywords: ['朋友', '兴趣', '认识', '聊天', '社交', '音乐', '生活', 'cafe'],
    targetHints: ['社交', '朋友匹配', '兴趣发现', '音乐品味', '对话引导'],
  },
];

const textScore = (text: string, keywords: string[]) => {
  const normalized = text.toLowerCase();
  return keywords.reduce((score, keyword) => score + (normalized.includes(keyword.toLowerCase()) ? 1 : 0), 0);
};

const agentText = (agent: Agent) =>
  `${agent.name} ${agent.category} ${agent.persona} ${agent.skills.join(' ')} ${agent.rules.join(' ')}`;

const chooseIntent = (goal: string, scenarios: Scenario[]) => {
  const supportedSlugs = new Set(scenarios.map((scenario) => scenario.slug));
  const ranked = sceneIntents
    .filter((intent) => supportedSlugs.has(intent.slug))
    .map((intent) => ({ intent, score: textScore(goal, intent.keywords) }))
    .sort((left, right) => right.score - left.score);

  return ranked.find((item) => item.score > 0)?.intent
    || sceneIntents.find((intent) => supportedSlugs.has(intent.slug))
    || sceneIntents[sceneIntents.length - 1];
};

const chooseTargetAgent = (
  sourceAgent: Agent,
  candidates: Agent[],
  scenario: Scenario,
  goal: string,
  intent: SceneIntent,
  maxRounds: number,
) => {
  const ranked = candidates.map((candidate) => {
    const hintScore = textScore(agentText(candidate), intent.targetHints) * 18;
    const match = matchAgents(sourceAgent, candidate, scenario, goal, maxRounds);
    return { candidate, match, score: match.score + hintScore };
  }).sort((left, right) => right.score - left.score);

  return ranked[0];
};

const relationshipTypeFor = (score: number) => {
  if (score >= 80) return '潜在合作伙伴';
  if (score >= 65) return '值得继续观察';
  if (score >= 50) return '轻连接';
  return '暂不建议推进';
};

const edgeLabelFor = (score: number) => {
  if (score >= 75) return '可继续合作';
  if (score >= 55) return '待观察';
  return '存在风险';
};

export const planAutonomousSocialRun = ({
  sourceAgentId,
  goal,
  preferredScenarioSlug,
  agents,
  scenarios,
  maxRounds,
}: AutonomousPlanInput): AutonomousPlan => {
  const sourceAgent = agents.find((agent) => agent.id === sourceAgentId);
  if (!sourceAgent) throw new Error('没有找到要派出的 Agent。');

  const candidates = agents.filter((agent) => agent.id !== sourceAgentId);
  if (!candidates.length) throw new Error('至少需要两个 Agent 才能开始自主社交。');

  const intent = chooseIntent(goal, scenarios);
  const preferredScenario = preferredScenarioSlug
    ? scenarios.find((item) => item.slug === preferredScenarioSlug)
    : undefined;
  if (preferredScenarioSlug && !preferredScenario) {
    throw new Error(`地图场景 ${preferredScenarioSlug} 不存在。`);
  }
  const scenario = preferredScenario || scenarios.find((item) => item.slug === intent.slug) || scenarios[0];
  if (!scenario) throw new Error('没有可用的社交场景。');
  const scenarioReason = preferredScenario
    ? `用户点击了 ${scenario.name}，系统将当前 Agent 直接派往该场景。`
    : `系统把目标路由到 ${scenario.name}，因为它最适合「${intent.label}」。`;

  const target = chooseTargetAgent(sourceAgent, candidates, scenario, goal, intent, maxRounds);
  const match = target.match;
  const topic = `${goal.trim()}｜场景：${scenario.name}｜系统目标：${intent.label}`;

  return {
    sourceAgent,
    targetAgent: target.candidate,
    scenario,
    topic,
    maxRounds: match.recommendedMaxRounds,
    score: match.score,
    reasons: [
      `${sourceAgent.name} 的画像已读取：${sourceAgent.category} / ${sourceAgent.skills.slice(0, 2).join('、')}。`,
      scenarioReason,
      `候选对象中 ${target.candidate.name} 的技能和场景信号最高。`,
      ...match.reasons,
    ],
    risks: match.risks,
    route: ['home', 'central-path', scenario.slug],
    mapEvents: [
      {
        type: 'thinking',
        label: `${sourceAgent.name} 正在读取画像和目标。`,
        agentId: sourceAgent.id,
      },
      {
        type: 'choose_scene',
        label: `AI 自主选择 ${scenario.name}。`,
        sceneSlug: scenario.slug,
      },
      {
        type: 'move',
        label: `${sourceAgent.name} 正在沿导览路线前往 ${scenario.name}。`,
        sceneSlug: scenario.slug,
        agentId: sourceAgent.id,
      },
      {
        type: 'discover',
        label: `${sourceAgent.name} 在 ${scenario.name} 发现 ${target.candidate.name}。`,
        sceneSlug: scenario.slug,
        agentId: target.candidate.id,
      },
      {
        type: 'conversation',
        label: `${sourceAgent.name} 和 ${target.candidate.name} 正在进行 Agent-to-Agent 对话。`,
        sceneSlug: scenario.slug,
      },
      {
        type: 'report',
        label: 'Signal Tower 正在生成关系报告。',
        sceneSlug: 'signal-tower',
      },
    ],
    playbackSteps: [
      {
        kind: 'read_profile',
        title: '读取 Agent 画像',
        detail: `${sourceAgent.name} 正在读取 persona、skills、rules 和 owner intent。`,
      },
      {
        kind: 'choose_scene',
        title: `选择 ${scenario.name}`,
        detail: `目标被判断为「${intent.label}」，Agent 将前往 ${scenario.name}。`,
      },
      {
        kind: 'move',
        title: '移动到场景',
        detail: `${sourceAgent.name} 正在穿过 Agent Island，靠近 ${scenario.name}。`,
      },
      {
        kind: 'match',
        title: `发现 ${target.candidate.name}`,
        detail: `匹配度 ${match.score}，系统建议进行 ${match.recommendedMaxRounds} 轮对话。`,
      },
      {
        kind: 'conversation',
        title: 'Agent-to-Agent 对话',
        detail: '双方开始交换目标、证据、共同兴趣和风险信号。',
      },
      {
        kind: 'report',
        title: '生成行动报告',
        detail: '系统沉淀关系强度、风险提示、关系线和下一步真人动作。',
      },
    ],
  };
};

export const shapeSocialReport = ({
  sourceAgentName,
  targetAgentName,
  scenarioName,
  matchScore,
  summary,
  sharedInterests,
  tensions,
  suggestedNextSteps,
}: SocialReportShapeInput): StructuredSocialReport => ({
  relationshipScore: matchScore,
  relationshipType: relationshipTypeFor(matchScore),
  summary,
  sharedInterests,
  tensions,
  nextHumanActions: suggestedNextSteps,
  mapUpdates: [{
    from: sourceAgentName,
    to: targetAgentName,
    strength: matchScore,
    label: edgeLabelFor(matchScore),
  }],
  agentLearning: `${sourceAgentName} 在 ${scenarioName} 中学到了 ${targetAgentName} 的关键偏好、合作边界和下一步验证方式。`,
});
