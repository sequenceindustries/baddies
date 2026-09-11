"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { transitions } from "@/lib/motion/tokens";

/**
 * Cross-fades between pages on client-side navigation — Next's App
 * Router has no built-in page-transition primitive, so this is the
 * standard way to get one with `motion` already in scope: key the
 * animated wrapper on the current pathname, let AnimatePresence handle
 * the old page's exit before the new one enters.
 *
 * Deliberately short and subtle (a plain cross-fade, no slide/scale) —
 * "not flashy, not slow" was the explicit brief here, and a longer or
 * busier transition on every single navigation gets old fast.
 * mode="wait" (the old page fully exits before the new one mounts)
 * rather than "sync" — a brief overlap of two full pages stacked on top
 * of each other reads as broken, not smooth.
 *
 * Mounted in layout.tsx wrapping only {children} — Nav and
 * BottomTabBar sit outside it and stay static across route changes,
 * and it's inside AgeGate/SessionProvider so it only ever renders once
 * the gate is already confirmed (AgeGate fully replaces this whole
 * subtree, wrapper included, until then — see that component's own
 * comment).
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitions.standard}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
