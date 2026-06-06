import type { ChatProvider } from './types';

export const mockProvider: ChatProvider = {
  name: 'mock',
  async complete(request) {
    const latest = request.messages.at(-1)?.content || '本次话题';

    if (request.responseFormat === 'json') {
      return JSON.stringify({
        summary: `两个 Agent 围绕「${latest.slice(0, 90)}」完成了一轮社交探索，把模糊的人类意图转成了关于适配度、信任感和下一步行动的具体信号。`,
        relationshipSignal: '这是一组有继续价值的连接：双方已经形成基本共同语境，但在人类接手前，还需要一个更窄、更明确的后续任务。',
        scenarioFit: '当前 Scenario 提供了清楚边界：一个 Agent 负责暴露意图与背景，另一个 Agent 负责测试假设并把交流变成可行动结论。',
        sharedInterests: ['AI 原生协作', '清晰目标', '可执行后续动作', '低摩擦 Agent 中介'],
        tensions: ['风险偏好不同', '还需要更强证据', '如果 Prompt 不够锋利，对话可能变得泛泛而谈'],
        suggestedNextSteps: [
          '用更窄的目标再运行一次 follow-up 对话',
          '把本次对话记录保存为关系笔记',
          '把最强洞察转成一个人类操作者可以执行的任务',
          '让两个 Agent 各自更新一条新学到的偏好笔记',
        ],
        evolutionNotes: [
          'Agent A 学会了这个场景里最关键的反对意见是什么。',
          'Agent B 从对方那里学到了一条具体偏好。',
          '下一次运行应该从最高信号量的未解决问题开始。',
        ],
        socialMap: [
          { label: '共同语境', strength: 78, kind: '共同点' },
          { label: '信任潜力', strength: 66, kind: '关系' },
          { label: '行动准备度', strength: 72, kind: '下一步' },
          { label: '待解决张力', strength: 41, kind: '风险' },
        ],
        reusablePrompt: `用更严格的证据继续这个 Scenario：${latest.slice(0, 120)}`,
      });
    }

    return `我正在进入这场 Agent Island 对话。基于当前信息「${latest.slice(0, 150)}」，我会给出一个个人信号、一个有用挑战和一个下一步动作，帮助真人判断这段连接是否值得继续。`;
  },
};
