/**
 * The one place motion is tuned. Components import these; nothing sets its own duration.
 * Springs for anything that moves, eased tweens only for fades and drawn lines.
 */
export const spring = {
  /** Default: move, reorder, morph. */
  ui: { type: "spring", bounce: 0, duration: 0.4 },
  /** Presses and toggles. */
  snappy: { type: "spring", bounce: 0, duration: 0.25 },
  /** Panels and sheets. */
  sheet: { type: "spring", bounce: 0.15, duration: 0.35 },
  /** A small celebration: a figure landing, a status flipping to paid. */
  pop: { type: "spring", bounce: 0.3, duration: 0.45 },
} as const;

export const ease = {
  /** Lines being drawn, ribbons wiping in. */
  trace: [0.65, 0, 0.35, 1],
  out: [0.2, 0, 0, 1],
} as const;

/** hover: anything answering the cursor. fade: mount and exit. mark: a highlight being drawn. */
export const duration = { hover: 0.15, fade: 0.35, mark: 0.7, draw: 0.9, count: 1.1, step: 1.8 } as const;

/** List entrance: parent staggers, rows rise 12px. */
export const list = {
  parent: { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } },
  row: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: spring.ui } },
} as const;
