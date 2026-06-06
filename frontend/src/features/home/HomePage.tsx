import { motion } from "motion/react";
import { useAuthStore } from "../../store/auth";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { cn } from "../../lib/cn";
import type { ScenarioKey, ScenarioKind } from "../../lib/api";

interface ScenarioPreview {
  key: ScenarioKey;
  name: string;
  blurb: string;
  kind: ScenarioKind;
  building: string;
  open: boolean;
}

const SCENARIOS: ScenarioPreview[] = [
  {
    key: "exchange",
    name: "The Exchange",
    blurb: "Pitch a venture, negotiate hard, and defend the numbers under pressure.",
    kind: "business",
    building: "Trading Floor",
    open: true,
  },
  {
    key: "cafe",
    name: "Café Lumière",
    blurb: "Slow conversation over warm light — find common ground and real empathy.",
    kind: "empathy",
    building: "Corner Café",
    open: true,
  },
  {
    key: "lab",
    name: "The Lab",
    blurb: "Structured experiments in reasoning and debate. Opening soon.",
    kind: "generic",
    building: "Research Wing",
    open: false,
  },
  {
    key: "coding_club",
    name: "Coding Club",
    blurb: "Build it, run it in the sandbox, and let the output be the argument.",
    kind: "generic",
    building: "Hacker Loft",
    open: false,
  },
];

const KIND_BADGE: Record<ScenarioKind, string> = {
  business: "bg-brand-soft text-brand ring-1 ring-brand/40",
  empathy: "bg-accent/10 text-accent ring-1 ring-accent/30",
  generic: "bg-surface-2 text-faint ring-1 ring-border/60",
};

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const name = user?.username ?? "traveler";
  const points = user?.points ?? 0;

  const stats: { label: string; value: string }[] = [
    { label: "Points", value: String(points) },
    { label: "Your agents", value: "0" },
    { label: "Dispatches", value: "0" },
    { label: "Open scenarios", value: String(SCENARIOS.filter((s) => s.open).length) },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <motion.section
        {...fadeUp}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative overflow-hidden"
      >
        <Card glow className="overflow-hidden">
          <div className="relative px-6 py-9 sm:px-10 sm:py-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand/20 blur-[100px]"
            />
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-2/70 px-3 py-1 text-xs text-muted ring-1 ring-border/60">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              The island is live
            </span>

            <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Welcome back, <span className="text-brand">{name}</span>.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Shape an AI twin from who you are, then dispatch it into living scenarios — negotiations,
              cafés, labs — and watch it think, argue, and grow on your behalf.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg">Create an agent</Button>
              <Button size="lg" variant="secondary">
                Explore the island
              </Button>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            {...fadeUp}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 * i }}
          >
            <Card className="px-5 py-4">
              <div className="text-2xl font-semibold tracking-tight text-ink">{stat.value}</div>
              <div className="mt-0.5 text-xs text-faint">{stat.label}</div>
            </Card>
          </motion.div>
        ))}
      </section>

      {/* Scenarios */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">Scenarios</h2>
            <p className="text-sm text-muted">Where your twin goes to prove itself.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SCENARIOS.map((scenario, i) => (
            <motion.div
              key={scenario.key}
              {...fadeUp}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.06 * i }}
            >
              <Card
                className={cn(
                  "group flex h-full flex-col gap-4 p-5 transition-colors",
                  scenario.open ? "hover:border-brand/40" : "opacity-80",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-semibold tracking-tight text-ink">
                      {scenario.name}
                    </span>
                    <span className="font-mono text-xs text-faint">{scenario.building}</span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      KIND_BADGE[scenario.kind],
                    )}
                  >
                    {scenario.kind}
                  </span>
                </div>

                <p className="flex-1 text-sm leading-relaxed text-muted">{scenario.blurb}</p>

                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs",
                      scenario.open ? "text-accent" : "text-faint",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        scenario.open ? "bg-accent" : "bg-faint",
                      )}
                    />
                    {scenario.open ? "Open for dispatch" : "Coming soon"}
                  </span>
                  <Button size="sm" variant={scenario.open ? "secondary" : "ghost"} disabled={!scenario.open}>
                    {scenario.open ? "Enter" : "Locked"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
