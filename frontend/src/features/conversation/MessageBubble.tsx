import { motion } from "motion/react";
import { Avatar } from "../../components/ui/Avatar";
import { cn } from "../../lib/cn";
import { bubbleIn } from "../../lib/anim";

export interface MessageBubbleProps {
  side: "left" | "right";
  name: string;
  avatar?: string | null;
  color: string;
  turnIndex: number | null;
  content: string;
  streaming?: boolean;
}

export function MessageBubble({ side, name, avatar, color, turnIndex, content, streaming }: MessageBubbleProps) {
  const right = side === "right";
  return (
    <motion.div
      layout="position"
      variants={bubbleIn}
      initial="hidden"
      animate="show"
      className={cn("flex w-full items-start gap-3", right ? "flex-row-reverse" : "flex-row")}
    >
      <Avatar name={name} avatar={avatar} size="sm" className="mt-0.5 shrink-0" />
      <div className={cn("flex max-w-[78%] flex-col gap-1", right ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-muted">{name}</span>
          {turnIndex != null && <span className="font-mono text-faint">[对话{turnIndex}]</span>}
        </div>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-ink",
            right ? "rounded-tr-sm bg-surface-2/70" : "rounded-tl-sm bg-surface-2/90",
          )}
          style={{ boxShadow: `inset 0 0 0 1px ${color}33` }}
        >
          {content}
          {streaming && (
            <span
              className="ml-0.5 inline-block h-3.5 w-[3px] translate-y-[2px] animate-pulse rounded-sm align-middle"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
