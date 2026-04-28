"use client";

// Runs `cb` inside a View Transition when supported, otherwise just runs it.
// Setting a matching `view-transition-name` on the source element (tile) and
// the destination element (channel frame) makes the browser morph between
// them — that's the Wii zoom.
export function withViewTransition(cb: () => void) {
  if (typeof document === "undefined") return cb();
  if (typeof document.startViewTransition !== "function") return cb();
  document.startViewTransition(() => cb());
}
