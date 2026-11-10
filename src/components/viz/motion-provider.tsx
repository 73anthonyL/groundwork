"use client";

import { MotionConfig } from "motion/react";

/** Every animation in the app honors the viewer's reduced-motion setting. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
