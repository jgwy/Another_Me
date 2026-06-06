/**
 * Shared animation language. Centralizing the spring presets + variants keeps
 * motion consistent across every feature and makes the 60fps target easy to
 * hold: everything here animates only compositor-friendly properties
 * (`opacity`, `transform`/`x`/`y`/`scale`) — never layout-triggering ones.
 */
import type { Transition, Variants } from "motion/react";

/** Physics presets — tuned for a lively-but-controlled feel. */
export const spring = {
  /** General UI entrance / settle. */
  soft: { type: "spring", stiffness: 220, damping: 28, mass: 0.9 } as Transition,
  /** Quick, tight response (toggles, hovers). */
  snappy: { type: "spring", stiffness: 420, damping: 34 } as Transition,
  /** Slow, weighty drift (avatars walking, ambient). */
  gentle: { type: "spring", stiffness: 120, damping: 20, mass: 1.1 } as Transition,
  /** Playful overshoot (sit-down, pop-in). */
  bouncy: { type: "spring", stiffness: 300, damping: 16 } as Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1 },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0 },
};

/** Container that staggers its children's `show` transition. */
export function staggerContainer(stagger = 0.06, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

/** A bubble entrance for streaming chat — rises and settles with a soft spring. */
export const bubbleIn: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
};
