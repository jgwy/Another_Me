import { motion } from "motion/react";
import { cn } from "../../lib/cn";
import { bubbleIn } from "../../lib/anim";

export interface SandboxBubbleProps {
  side: "left" | "right";
  agentName?: string;
  language: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/** Renders a `sandbox-output` event as a distinct "code ran" evidence card
 *  (R19 / AE4). The locked SSE payload carries no source code — only the run
 *  result — so we surface stdout/stderr, exit code and duration. */
export function SandboxBubble({ side, agentName, language, stdout, stderr, exitCode, durationMs }: SandboxBubbleProps) {
  const failed = exitCode !== 0;
  return (
    <motion.div
      layout="position"
      variants={bubbleIn}
      initial="hidden"
      animate="show"
      className={cn("flex w-full", side === "right" ? "justify-end" : "justify-start")}
    >
      <div className="w-full max-w-[88%] overflow-hidden rounded-2xl border border-warning/30 bg-[#0a0a12] shadow-soft">
        <div className="flex items-center gap-2 border-b border-warning/20 bg-warning/10 px-3 py-1.5 text-xs">
          <span className="font-medium text-warning">⚡ sandbox ran code</span>
          {agentName && <span className="text-faint">· {agentName}</span>}
          <span className="ml-auto flex items-center gap-2 font-mono text-faint">
            <span>{language}</span>
            <span>{durationMs}ms</span>
            <span className={failed ? "text-danger" : "text-success"}>exit {exitCode}</span>
          </span>
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-xs leading-relaxed text-emerald-300">
          {stdout || "(no output)"}
        </pre>
        {stderr && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-t border-danger/20 bg-danger/5 px-3 py-2 font-mono text-xs text-danger">
            {stderr}
          </pre>
        )}
      </div>
    </motion.div>
  );
}
