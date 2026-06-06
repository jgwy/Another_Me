import { describe, expect, it } from 'vitest';
import { planAutonomousSocialRun, shapeSocialReport } from './autonomousSocial';

const baseAgent = {
  id: 'agent-founder',
  name: 'Founder Agent',
  ownerLabel: 'Demo',
  category: '创业',
  persona: '一个目标清晰的创业者分身，能把产品愿景、风险、用户牵引力和 Demo 价值讲得具体。',
  skills: ['融资叙事', '产品策略', '黑客松演示'],
  rules: ['保持简洁'],
  modelConfig: {},
  maxRounds: 6,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const agents = [
  baseAgent,
  {
    ...baseAgent,
    id: 'agent-vc',
    name: 'VC Agent',
    category: '投资',
    persona: '一个怀疑但建设性的投资人分身，会检验市场规模、防御性、商业模式和创始人洞察。',
    skills: ['风险投资', '市场分析', '商业模式'],
  },
  {
    ...baseAgent,
    id: 'agent-coder',
    name: 'Coding Partner Agent',
    category: '工程',
    persona: '一个务实的 AI Coding 伙伴，会把产品想法拆成可以交付的实现步骤。',
    skills: ['AI Coding', '系统设计', '调试排错'],
  },
];

const scenarios = [
  {
    id: 'scenario-cafe',
    slug: 'cafe',
    name: 'Cafe',
    description: '轻松聊天场景，用来发现兴趣、价值观和关系可能性。',
    prompt: 'Cafe prompt',
    closingPrompt: 'Cafe closing',
    suggestedTopics: ['寻找共同兴趣'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'scenario-exchange',
    slug: 'exchange',
    name: 'Exchange',
    description: '商业评估、投资辩论和策略判断场景。',
    prompt: 'Exchange prompt',
    closingPrompt: 'Exchange closing',
    suggestedTopics: ['评估创业项目'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'scenario-coding',
    slug: 'coding-club',
    name: 'Coding Club',
    description: 'AI Coding、产品构建、实现规划和 Demo 准备场景。',
    prompt: 'Coding prompt',
    closingPrompt: 'Coding closing',
    suggestedTopics: ['规划 Demo'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe('planAutonomousSocialRun', () => {
  it('selects an investment scene and counterpart for investor goals', () => {
    const plan = planAutonomousSocialRun({
      sourceAgentId: 'agent-founder',
      goal: '想找投资人评估这个 Agent 社交 Demo 是否值得继续融资',
      agents,
      scenarios,
      maxRounds: 6,
    });

    expect(plan.scenario.slug).toBe('exchange');
    expect(plan.targetAgent.name).toBe('VC Agent');
    expect(plan.topic).toContain('投资人');
    expect(plan.reasons.length).toBeGreaterThanOrEqual(3);
    expect(plan.playbackSteps.map((step) => step.kind)).toEqual([
      'read_profile',
      'choose_scene',
      'move',
      'match',
      'conversation',
      'report',
    ]);
  });

  it('falls back to coding club when the goal is project collaboration', () => {
    const plan = planAutonomousSocialRun({
      sourceAgentId: 'agent-founder',
      goal: '想找 coding partner 一起把黑客松 Demo 做完整',
      agents,
      scenarios,
      maxRounds: 5,
    });

    expect(plan.scenario.slug).toBe('coding-club');
    expect(plan.targetAgent.name).toBe('Coding Partner Agent');
    expect(plan.maxRounds).toBe(5);
  });

  it('returns route and map events for autonomous map playback', () => {
    const plan = planAutonomousSocialRun({
      sourceAgentId: 'agent-founder',
      goal: '想找 coding partner 一起把黑客松 Demo 做完整',
      agents,
      scenarios,
      maxRounds: 5,
    });

    expect(plan.scenario.slug).toBe('coding-club');
    expect(plan.route).toEqual(['home', 'central-path', 'coding-club']);
    expect(plan.mapEvents.map((event) => event.type)).toEqual([
      'thinking',
      'choose_scene',
      'move',
      'discover',
      'conversation',
      'report',
    ]);
    expect(plan.reasons[1]).toContain('系统把目标路由到 Coding Club');
  });
});

describe('shapeSocialReport', () => {
  it('returns the structured Chinese report shape needed by the map UI', () => {
    const report = shapeSocialReport({
      sourceAgentName: 'Founder Agent',
      targetAgentName: 'Coding Partner Agent',
      scenarioName: 'Coding Club',
      matchScore: 84,
      summary: '两个 Agent 在 AI Coding 和黑客松 Demo 上形成强共识。',
      sharedInterests: ['AI Coding', '产品 Demo'],
      tensions: ['商业判断还需要更多证据'],
      suggestedNextSteps: ['安排真人进行 15 分钟 Demo 讨论'],
    });

    expect(report.relationshipScore).toBe(84);
    expect(report.relationshipType).toBe('潜在合作伙伴');
    expect(report.nextHumanActions).toEqual(['安排真人进行 15 分钟 Demo 讨论']);
    expect(report.mapUpdates).toEqual([
      {
        from: 'Founder Agent',
        to: 'Coding Partner Agent',
        strength: 84,
        label: '可继续合作',
      },
    ]);
  });
});
