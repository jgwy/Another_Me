import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";

import type { ScenarioKey } from "../../lib/api";
import { useConversations, useDemoMode, useScenarios } from "../../lib/queries";
import { useAuthStore } from "../../store/auth";
import { spring, staggerContainer, fadeUp } from "../../lib/anim";
import { cn } from "../../lib/cn";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import type { BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { PageHeader } from "../../components/layout/PageHeader";
import { IslandMap } from "./IslandMap";
import { BUILDINGS } from "./islandLayout";

const KIND_TONE: Record<string, BadgeTone> = {
  business: "brand",
  empathy: "accent",
  generic: "neutral",
};

export function IslandPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const demo = useDemoMode();
  const scenariosQuery = useScenarios();
  const conversationsQuery = useConversations();

  const scenarios = scenariosQuery.data ?? [];
  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data],
  );

  const [selectedKey, setSelectedKey] = useState<ScenarioKey>("exchange");
  const selected = scenarios.find((s) => s.key === selectedKey);

  const scenarioById = useMemo(() => {
    const m = new Map<string, (typeof scenarios)[number]>();
    scenarios.forEach((s) => m.set(s.id, s));
    return m;
  }, [scenarios]);

  const liveConv = conversations.find(
    (c) => scenarioById.get(c.scenario_id)?.key === selectedKey && c.status === "running",
  );

  const openConversation = (id: string) => navigate(`/conversations/${id}`);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="The island"
        title={
          <span>
            Welcome to the island{user ? <span className="text-brand">, {user.username}</span> : ""}.
          </span>
        }
        description="Dispatch a twin into a scenario, then watch it walk in, take a seat, and think on your behalf."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/agents/new")}>
              Build a twin
            </Button>
            <Button onClick={() => navigate("/dispatch")}>Dispatch</Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Map */}
        <motion.div
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring.soft}
          className="lg:col-span-2"
        >
          <Card glow className="relative overflow-hidden p-2 sm:p-3">
            {scenariosQuery.isLoading ? (
              <div className="grid aspect-[1000/640] place-items-center">
                <Spinner size={26} className="text-brand" />
              </div>
            ) : (
              <IslandMap
                scenarios={scenarios}
                conversations={conversations}
                selectedKey={selectedKey}
                onSelectBuilding={setSelectedKey}
                onOpenConversation={openConversation}
              />
            )}

            <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
              {demo && (
                <span className="pointer-events-auto rounded-full bg-surface-2/80 px-2.5 py-1 text-xs text-faint ring-1 ring-border/60 backdrop-blur">
                  demo data · live once the backend lands
                </span>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Side panel */}
        <motion.div
          variants={staggerContainer(0.08)}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-5"
        >
          {/* Selected scenario */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl text-xl"
                    style={{
                      backgroundColor: `${BUILDINGS[selectedKey].color}1f`,
                      boxShadow: `0 0 0 1px ${BUILDINGS[selectedKey].color}55 inset`,
                    }}
                  >
                    {BUILDINGS[selectedKey].emoji}
                  </span>
                  <div>
                    <div className="text-base font-semibold tracking-tight text-ink">
                      {selected?.name ?? BUILDINGS[selectedKey].zh}
                    </div>
                    {selected && (
                      <Badge tone={KIND_TONE[selected.kind] ?? "neutral"} className="mt-1 capitalize">
                        {selected.kind}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {selected?.description && (
                <p className="text-sm leading-relaxed text-muted">{selected.description}</p>
              )}

              {selected?.topics?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {selected.topics.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-surface-2/70 px-2 py-0.5 text-xs text-muted ring-1 ring-border/50"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => navigate(`/dispatch?scenario=${selectedKey}`)}
                  disabled={selected ? !selected.is_full : false}
                >
                  Dispatch here
                </Button>
                {liveConv && (
                  <Button size="sm" variant="secondary" onClick={() => openConversation(liveConv.id)}>
                    Spectate live
                  </Button>
                )}
                {selected && !selected.is_full && (
                  <span className="text-xs text-faint">Placeholder — opening soon</span>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Live tables */}
          <motion.div variants={fadeUp} transition={spring.soft}>
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight text-ink">Tables</h3>
                <span className="text-xs text-faint">{conversations.length} active</span>
              </div>

              {conversationsQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner className="text-muted" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="py-4 text-sm text-muted">
                  No conversations yet. Dispatch a twin to seat the first table.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {conversations.map((c) => {
                    const scenario = scenarioById.get(c.scenario_id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => openConversation(c.id)}
                          className="group flex w-full items-center gap-3 rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-surface-2/70"
                        >
                          <div className="flex -space-x-2">
                            {c.participants.map((p) => (
                              <Avatar key={p.id} name={p.agent.name} avatar={p.agent.avatar} size="xs" className="ring-2 ring-surface" />
                            ))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-ink">{c.title ?? scenario?.name ?? "Conversation"}</div>
                            <div className="text-xs text-faint">{scenario?.name}</div>
                          </div>
                          <Badge tone={c.status === "running" ? "success" : c.status === "completed" ? "neutral" : "warning"}>
                            <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", c.status === "running" ? "bg-success" : "bg-faint")} />
                            {c.status}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
