import { useEffect, useMemo, useState } from 'react';
import { Activity, MessagesSquare, Play, RefreshCw, Sparkles } from 'lucide-react';
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

export const Workbench = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [provider, setProvider] = useState('mock');
  const [agentAId, setAgentAId] = useState('');
  const [agentBId, setAgentBId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [topic, setTopic] = useState('Evaluate Another Me as a hackathon product and find the next best demo move.');
  const [maxRounds, setMaxRounds] = useState(6);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [conversation, setConversation] = useState<ConversationResult | ConversationDetail | null>(null);
  const [status, setStatus] = useState<Status>({ text: 'Loading social workbench...', tone: 'neutral' });
  const [busy, setBusy] = useState(false);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId),
    [scenarioId, scenarios],
  );

  const load = async () => {
    setStatus({ text: 'Loading social workbench...', tone: 'neutral' });
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
    setStatus({ text: 'Ready.', tone: 'good' });
  };

  useEffect(() => {
    load().catch((error) => setStatus({ text: error instanceof Error ? error.message : 'Load failed.', tone: 'bad' }));
  }, []);

  const requestBody = { agentAId, agentBId, scenarioId, topic, maxRounds };

  const generateMatch = async () => {
    setBusy(true);
    setStatus({ text: 'Scoring agent match...', tone: 'neutral' });
    try {
      const result = await api.match(requestBody);
      setMatch(result);
      setStatus({ text: 'Match ready.', tone: 'good' });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Match failed.', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setStatus({ text: 'Running agent conversation...', tone: 'neutral' });
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
      setStatus({ text: 'Conversation complete.', tone: 'good' });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Conversation failed.', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const statusClass = {
    neutral: 'text-[#596157]',
    good: 'text-[#2f6b43]',
    bad: 'text-[#8f493f]',
  }[status.tone];

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20231f]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5">
        <header className="flex flex-col gap-3 border-b border-[#d7d8ce] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#67756b]">Another Me / Module 03</p>
            <h1 className="text-3xl font-semibold tracking-normal">Agent Social Workbench</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded border border-[#c9cdc1] px-2 py-1">Provider: {provider}</span>
            <button className="inline-flex items-center gap-2 rounded border border-[#b9bdae] px-3 py-2" onClick={() => load()}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
          <aside className="space-y-3">
            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} /> Setup</h2>
              <label className="block text-sm font-medium" htmlFor="scenario">Scenario</label>
              <select id="scenario" className="mt-1 w-full rounded border border-[#c9cdc1] p-2" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
              <p className="mt-2 text-sm text-[#596157]">{selectedScenario?.description}</p>

              <label className="mt-4 block text-sm font-medium" htmlFor="agentA">Agent A</label>
              <select id="agentA" className="mt-1 w-full rounded border border-[#c9cdc1] p-2" value={agentAId} onChange={(event) => setAgentAId(event.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>

              <label className="mt-4 block text-sm font-medium" htmlFor="agentB">Agent B</label>
              <select id="agentB" className="mt-1 w-full rounded border border-[#c9cdc1] p-2" value={agentBId} onChange={(event) => setAgentBId(event.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>

              <label className="mt-4 block text-sm font-medium" htmlFor="topic">Topic</label>
              <textarea id="topic" className="mt-1 min-h-28 w-full rounded border border-[#c9cdc1] p-2" value={topic} onChange={(event) => setTopic(event.target.value)} />

              <label className="mt-4 block text-sm font-medium" htmlFor="rounds">Max rounds</label>
              <input id="rounds" className="mt-1 w-full accent-[#8f493f]" min={2} max={10} type="range" value={maxRounds} onChange={(event) => setMaxRounds(Number(event.target.value))} />
              <div className="text-sm text-[#596157]">{maxRounds} turns</div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="rounded bg-[#26362d] px-3 py-2 text-white disabled:opacity-60" disabled={busy || !agentAId || !agentBId || !scenarioId} onClick={generateMatch}>
                  Match
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded bg-[#8f493f] px-3 py-2 text-white disabled:opacity-60" disabled={busy || !agentAId || !agentBId || !scenarioId} onClick={run}>
                  <Play size={16} /> Run
                </button>
              </div>
              <p className={`mt-3 text-sm ${statusClass}`}>{status.text}</p>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity size={18} /> Match</h2>
              {match ? (
                <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                  <div className="text-5xl font-semibold">{match.score}</div>
                  <div className="space-y-2 text-sm">
                    <p>Recommended rounds: {match.recommendedMaxRounds}</p>
                    <ul className="list-disc pl-5">{match.reasons.map((item) => <li key={item}>{item}</li>)}</ul>
                    <ul className="list-disc pl-5 text-[#8f493f]">{match.risks.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              ) : <p className="text-sm text-[#596157]">Generate a match to see fit, risks, and recommended turns.</p>}
            </div>

            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MessagesSquare size={18} /> Transcript</h2>
              <div className="space-y-3">
                {conversation?.messages?.length ? conversation.messages.map((message) => (
                  <article className="rounded border border-[#e2e3dc] bg-[#fbfbf8] p-3" key={message.id}>
                    <div className="mb-1 text-sm font-semibold">{message.speakerAgent.name} / turn {message.turnIndex}</div>
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  </article>
                )) : <p className="text-sm text-[#596157]">Run a conversation to create the transcript.</p>}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold">Report</h2>
              {conversation?.report ? (
                <div className="space-y-3 text-sm">
                  <p className="leading-6">{conversation.report.summary}</p>
                  <div><b>Shared interests</b><ul className="list-disc pl-5">{conversation.report.sharedInterests.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Tensions</b><ul className="list-disc pl-5">{conversation.report.tensions.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Next steps</b><ul className="list-disc pl-5">{conversation.report.suggestedNextSteps.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div><b>Reusable prompt</b><p className="mt-1 rounded border border-[#e2e3dc] bg-[#fbfbf8] p-2">{conversation.report.reusablePrompt}</p></div>
                </div>
              ) : <p className="text-sm text-[#596157]">The report appears after a run completes.</p>}
            </div>

            <div className="rounded border border-[#d7d8ce] bg-white p-4">
              <h2 className="mb-3 text-lg font-semibold">History</h2>
              <div className="space-y-2">
                {history.length ? history.map((run) => (
                  <button className="block w-full rounded border border-[#e2e3dc] p-2 text-left text-sm hover:bg-[#f7f7f2]" key={run.id} onClick={async () => setConversation(await api.conversation(run.id))}>
                    <b>{run.scenario.name}</b>
                    <span className="block text-[#596157]">{run.agentA.name} x {run.agentB.name}</span>
                  </button>
                )) : <p className="text-sm text-[#596157]">No runs yet.</p>}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
};
