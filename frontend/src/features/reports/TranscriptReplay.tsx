import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Message, Participant } from "../../lib/api";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { cn } from "../../lib/cn";
import { bubbleIn } from "../../lib/anim";
import { formatTime } from "../../lib/format";
import { asNumber, asString } from "./content";

const SPEEDS = [0.5, 1, 2] as const;
type Speed = (typeof SPEEDS)[number];
/** Base dwell per message during replay; divided by the chosen speed. */
const STEP_MS = 1100;

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4v6h6M20 20v-6h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 9a7 7 0 0 0-12-3L4 9m1 6a7 7 0 0 0 12 3l3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("transition-transform duration-200", open && "rotate-180")}
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

function SystemRow({ content }: { content: string }) {
  return (
    <motion.div variants={bubbleIn} initial="hidden" animate="show" exit={{ opacity: 0 }} className="flex justify-center">
      <span className="max-w-xl rounded-full border border-border/50 bg-surface-2/50 px-3.5 py-1.5 text-center text-xs leading-relaxed text-faint">
        {content}
      </span>
    </motion.div>
  );
}

function AgentRow({
  message,
  seat,
  participant,
}: {
  message: Message;
  seat: number | undefined;
  participant: Participant | undefined;
}) {
  const right = seat === 2;
  const name = participant?.agent.name ?? "Agent";
  const avatar = participant?.agent.avatar ?? null;

  return (
    <motion.div
      variants={bubbleIn}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      className={cn("flex items-end gap-3", right ? "flex-row-reverse" : "flex-row")}
    >
      <Avatar name={name} avatar={avatar} size="sm" className="shrink-0" />
      <div className={cn("flex max-w-[80%] flex-col gap-1", right ? "items-end" : "items-start")}>
        <div className={cn("flex items-center gap-2", right && "flex-row-reverse")}>
          <span className="text-xs font-semibold text-ink">{name}</span>
          {message.turn_index != null && (
            <span className="font-mono text-[11px] text-faint">[对话{message.turn_index}]</span>
          )}
          <span className="font-mono text-[11px] text-faint">{formatTime(message.created_at)}</span>
        </div>
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm leading-relaxed text-ink",
            right
              ? "rounded-tr-sm border-brand/25 bg-brand-soft/70"
              : "rounded-tl-sm border-border/60 bg-surface-2/70",
          )}
        >
          {message.content}
        </div>
      </div>
    </motion.div>
  );
}

function SandboxBubble({
  message,
  seat,
  participant,
}: {
  message: Message;
  seat: number | undefined;
  participant: Participant | undefined;
}) {
  const [open, setOpen] = useState(false);
  const meta = message.meta;
  const language = asString(meta.language) || "python";
  const code = asString(meta.code);
  const stdout = asString(meta.stdout) || message.content;
  const stderr = asString(meta.stderr);
  const exitCode = asNumber(meta.exit_code, 0);
  const durationMs = asNumber(meta.duration_ms, 0);
  const name = participant?.agent.name;
  const right = seat === 2;

  return (
    <motion.div
      variants={bubbleIn}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      className={cn("flex", right ? "justify-end" : "justify-start")}
    >
      <div className="w-full max-w-[88%] overflow-hidden rounded-2xl border border-accent/30 bg-surface-2/40">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-surface-2/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-accent/15 text-[11px] text-accent">▶</span>
            <span className="text-xs font-semibold text-ink">Sandbox · ran code</span>
            {name && <span className="text-xs text-faint">by {name}</span>}
          </div>
          <Badge tone={exitCode === 0 ? "success" : "danger"}>exit {exitCode}</Badge>
        </div>

        {code && (
          <div className="border-b border-border/40">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs text-muted transition-colors hover:text-ink"
            >
              <span className="font-mono">{language}</span>
              <span className="flex items-center gap-1.5">
                {open ? "Hide code" : "Show code"}
                <ChevronIcon open={open} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.pre
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-x-auto bg-canvas/60 px-4 py-3 font-mono text-xs leading-relaxed text-ink"
                >
                  <code>{code}</code>
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">stdout</span>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-accent">
            {stdout}
          </pre>
          {stderr && (
            <>
              <span className="mt-3 block text-[11px] font-medium uppercase tracking-wider text-faint">stderr</span>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-danger">
                {stderr}
              </pre>
            </>
          )}
          <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-faint">
            <span>exit {exitCode}</span>
            <span>·</span>
            <span>{durationMs}ms</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MessageRow({
  message,
  seat,
  participant,
}: {
  message: Message;
  seat: number | undefined;
  participant: Participant | undefined;
}) {
  if (message.sender === "system") return <SystemRow content={message.content} />;
  if (message.sender === "sandbox") return <SandboxBubble message={message} seat={seat} participant={participant} />;
  return <AgentRow message={message} seat={seat} participant={participant} />;
}

function TypingHint() {
  return (
    <div className="flex items-center gap-1.5 pl-12">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-faint"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Replay                                                                      */
/* -------------------------------------------------------------------------- */

export function TranscriptReplay({
  messages,
  participants,
}: {
  messages: Message[];
  participants: Participant[];
}) {
  const sorted = useMemo(() => [...messages].sort((a, b) => a.seq - b.seq), [messages]);
  const seatByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of participants) map.set(p.agent_id, p.seat);
    return map;
  }, [participants]);
  const participantByAgent = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of participants) map.set(p.agent_id, p);
    return map;
  }, [participants]);

  const [replaying, setReplaying] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);

  const total = sorted.length;
  const finished = replaying && revealed >= total;

  useEffect(() => {
    if (!replaying || !playing) return;
    if (revealed >= total) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setRevealed((n) => Math.min(n + 1, total)), STEP_MS / speed);
    return () => clearTimeout(timer);
  }, [replaying, playing, revealed, speed, total]);

  if (total === 0) {
    return (
      <EmptyState
        icon="💬"
        title="No transcript yet"
        description="Messages will appear here once the conversation has run."
      />
    );
  }

  const visible = replaying ? sorted.slice(0, revealed) : sorted;
  const progress = total > 0 ? Math.min(revealed, total) / total : 0;

  const startReplay = () => {
    setReplaying(true);
    setRevealed(0);
    setPlaying(true);
  };
  const togglePlay = () => {
    if (!replaying) {
      startReplay();
      return;
    }
    if (finished) {
      setRevealed(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };
  const restart = () => {
    setReplaying(true);
    setRevealed(0);
    setPlaying(true);
  };
  const showAll = () => {
    setReplaying(false);
    setPlaying(false);
    setRevealed(total);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 shadow-soft backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!replaying ? (
              <Button size="sm" onClick={startReplay} leftIcon={<PlayIcon />}>
                Replay
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={togglePlay}
                  leftIcon={finished ? <RestartIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
                >
                  {finished ? "Replay" : playing ? "Pause" : "Play"}
                </Button>
                <Button size="sm" variant="ghost" onClick={restart} leftIcon={<RestartIcon />}>
                  Restart
                </Button>
                <Button size="sm" variant="ghost" onClick={showAll}>
                  Show all
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {replaying && (
              <span className="font-mono text-xs text-faint">
                {Math.min(revealed, total)}/{total}
              </span>
            )}
            <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-surface-2/60 p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    s === speed ? "bg-brand text-white" : "text-muted hover:text-ink",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {replaying && (
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full w-full origin-left rounded-full bg-brand"
              initial={false}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {visible.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              seat={m.agent_id ? seatByAgent.get(m.agent_id) : undefined}
              participant={m.agent_id ? participantByAgent.get(m.agent_id) : undefined}
            />
          ))}
        </AnimatePresence>
        {replaying && playing && !finished && <TypingHint />}
      </div>
    </div>
  );
}
