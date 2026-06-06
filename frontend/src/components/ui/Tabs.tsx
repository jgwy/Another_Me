import { motion } from "motion/react";
import { cn } from "../../lib/cn";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Unique id so multiple tab strips don't share a layout animation. */
  layoutId?: string;
  className?: string;
}

export function Tabs({ tabs, value, onChange, layoutId = "tab-underline", className }: TabsProps) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-border/50", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-3.5 py-2.5 text-sm font-medium transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
