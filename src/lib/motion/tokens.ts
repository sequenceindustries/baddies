/**
 * Shared duration/easing tokens for the `motion` (motion.dev)-driven
 * layer of this app — every modal/dropdown/reveal/carousel/count-up
 * consumer imports from here rather than hand-tuning its own animation
 * numbers, so the whole site reads as one consistent motion system
 * instead of 20 separately-guessed ones. See globals.css's own comment
 * (just above its prefers-reduced-motion rule) for why this layer
 * exists alongside, not instead of, the app's original CSS-only motion
 * (button/link hover, .hover-lift, heart-pop) — those have no real
 * exit/unmount lifecycle to animate and stay exactly as they were.
 *
 * Durations are in seconds (motion's own unit), matching the product
 * brief's own three bands: micro-interactions ~150-250ms, standard
 * transitions ~250-400ms, larger reveals ~400-700ms.
 */

export const DURATION = {
  micro: 0.18,
  standard: 0.32,
  large: 0.55,
} as const;

// Deliberately no bouncy/overshoot easing curve is exported anywhere in
// this file — that's not an oversight, it's how "no bouncing, ever" is
// enforced: nobody building a new component here has a spring-with-
// overshoot or an elastic ease sitting one import away to reach for.
export const EASE = {
  // A gentle standard ease-in-out — the default for nearly everything.
  standard: [0.4, 0, 0.2, 1],
  // Decelerating — entrances, reveals, anything appearing.
  out: [0, 0, 0.2, 1],
  // Accelerating — exits, anything leaving.
  in: [0.4, 0, 1, 1],
} as const;

// The one pre-tuned spring config anyone in this codebase should reach
// for (e.g. a drag-release snap-back) — heavily damped on purpose, so
// it settles instead of bouncing. Don't hand-roll a second spring
// config elsewhere; if this one doesn't fit, use a tween + EASE
// instead.
export const SPRING_DAMPED = {
  type: "spring",
  stiffness: 300,
  damping: 30,
} as const;

export const transitions = {
  micro: { duration: DURATION.micro, ease: EASE.standard },
  standard: { duration: DURATION.standard, ease: EASE.standard },
  large: { duration: DURATION.large, ease: EASE.out },
} as const;

// Shared variants — import these into modal/overlay/dropdown/reveal
// consumers instead of redefining initial/animate/exit shapes per
// file. Centered modals & lightboxes use backdropFade + fadeScale;
// dropdowns/menus/drawers use backdropFade + fadeSlideUp (a small
// downward offset reads as "dropped from its trigger", not "rising
// from below" — see each consumer for the exact y direction it wants).

export const backdropFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.standard },
  exit: { opacity: 0, transition: transitions.micro },
};

export const fadeScale = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: transitions.standard },
  exit: { opacity: 0, scale: 0.97, transition: transitions.micro },
};

// y: positive = enters from below (reveals, sheets); a consumer that
// wants "drops down from its trigger" passes a negative y itself
// rather than this default — see AccountMenu/dropdown usage.
export const fadeSlideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transitions.standard },
  exit: { opacity: 0, y: 8, transition: transitions.micro },
};
