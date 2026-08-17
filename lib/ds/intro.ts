/**
 * The replayable DS Lite presentation deliberately lives outside the firmware
 * reducer. Keeping this contract pure makes interrupted gestures and stale
 * animation callbacks harmless, while the existing firmware remains reusable.
 */

export const DS_LITE_INTRO_TIMING = {
  alignmentMs: 420,
  openingMs: 650,
  helperRevealMs: 160,
  handoffMs: 240,
  powerDragPx: 32,
} as const;

export type DsIntroPhase =
  | "checking"
  | "inspecting"
  | "aligning"
  | "opening"
  | "power-prompt"
  | "handoff"
  | "complete"
  | "fallback";

export type DsIntroState = {
  phase: DsIntroPhase;
  /** The 2D open render used when WebGL is unavailable. */
  fallbackOpen: boolean;
};

export type DsIntroAction =
  | { type: "session-checked"; completed: boolean }
  | { type: "activate" }
  | { type: "aligned" }
  | { type: "opened" }
  | { type: "fallback-open" }
  | { type: "power-success" }
  | { type: "handoff-complete" }
  | { type: "skip" }
  | { type: "model-failed" }
  | { type: "reset" };

export const initialDsIntroState: DsIntroState = {
  phase: "checking",
  fallbackOpen: false,
};

export function reduceDsIntro(state: DsIntroState, action: DsIntroAction): DsIntroState {
  switch (action.type) {
    case "session-checked":
      if (state.phase !== "checking") return state;
      return action.completed
        ? { phase: "complete", fallbackOpen: false }
        : { phase: "inspecting", fallbackOpen: false };
    case "activate":
      if (state.phase === "inspecting") return { ...state, phase: "aligning" };
      if (state.phase === "fallback") return { ...state, fallbackOpen: true };
      return state;
    case "aligned":
      return state.phase === "aligning" ? { ...state, phase: "opening" } : state;
    case "opened":
      return state.phase === "opening" ? { ...state, phase: "power-prompt" } : state;
    case "fallback-open":
      return state.phase === "fallback" ? { ...state, fallbackOpen: true } : state;
    case "power-success":
      if (state.phase !== "power-prompt" && !(state.phase === "fallback" && state.fallbackOpen)) return state;
      return { ...state, phase: "handoff" };
    case "handoff-complete":
      return state.phase === "handoff" ? { phase: "complete", fallbackOpen: false } : state;
    case "skip":
      return state.phase === "complete" ? state : { phase: "complete", fallbackOpen: false };
    case "model-failed":
      if (state.phase === "complete") return state;
      return {
        phase: "fallback",
        fallbackOpen: state.fallbackOpen || state.phase === "power-prompt" || state.phase === "handoff",
      };
    case "reset":
      return initialDsIntroState;
    default:
      return state;
  }
}

export function isDsIntroBlocking(phase: DsIntroPhase): boolean {
  return phase !== "complete";
}

export function isPowerDragComplete(startY: number | null, endY: number): boolean {
  return startY !== null && startY - endY >= DS_LITE_INTRO_TIMING.powerDragPx;
}
