/**
 * A single agent profile card for the gallery. The whole surface links to the
 * agent's detail page; entrance + exit are orchestrated by the parent grid's
 * stagger container, and a subtle spring lift fires on hover.
 */
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import type { Agent } from "../../lib/api";
import { spring, fadeUp } from "../../lib/anim";
import { truncate } from "../../lib/format";
import { Card } from "../../components/ui/Card";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";

const MAX_TAGS = 4;

export function AgentCard({ agent }: { agent: Agent }) {
  const tags = agent.profile_tags.slice(0, MAX_TAGS);
  const overflow = agent.profile_tags.length - tags.length;

  return (
    <motion.div
      layout
      variants={fadeUp}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, scale: 1.012 }}
      transition={spring.snappy}
    >
      <Link to={`/agents/${agent.id}`} className="block focus-visible:outline-none">
        <Card className="group flex h-full flex-col gap-4 p-5 transition-colors hover:border-brand/40 group-focus-visible:border-brand/60">
          <div className="flex items-start gap-3.5">
            <Avatar name={agent.name} avatar={agent.avatar} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold tracking-tight text-ink">
                  {agent.name}
                </h3>
                <Badge tone={agent.is_public ? "accent" : "neutral"}>
                  {agent.is_public ? "Public" : "Private"}
                </Badge>
              </div>
              <span className="font-mono text-xs text-faint">{agent.id.slice(0, 8)}</span>
            </div>
          </div>

          <p className="min-h-[2.5rem] flex-1 text-sm leading-relaxed text-muted">
            {truncate(agent.persona, 120)}
          </p>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} tone="brand">
                  {tag}
                </Badge>
              ))}
              {overflow > 0 && <Badge tone="neutral">+{overflow}</Badge>}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>🌀</span>
              {agent.max_rounds} rounds
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>🧩</span>
              {agent.skills.length} {agent.skills.length === 1 ? "skill" : "skills"}
            </span>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
