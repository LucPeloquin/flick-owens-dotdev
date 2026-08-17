import { describe, expect, it } from "vitest";
import {
  DS_LITE_INTRO_TIMING,
  initialDsIntroState,
  isPowerDragComplete,
  reduceDsIntro,
  type DsIntroState,
} from "@/lib/ds/intro";

describe("DS Lite replayable intro state machine", () => {
  it("gates the inspection until initialization resolves", () => {
    expect(reduceDsIntro(initialDsIntroState, { type: "activate" })).toEqual(initialDsIntroState);
    expect(reduceDsIntro(initialDsIntroState, { type: "session-checked", completed: false }).phase).toBe("inspecting");
    expect(reduceDsIntro(initialDsIntroState, { type: "session-checked", completed: true }).phase).toBe("complete");
  });

  it("ignores stale callbacks and only opens after a tap", () => {
    let state = reduceDsIntro(initialDsIntroState, { type: "session-checked", completed: false });
    state = reduceDsIntro(state, { type: "aligned" });
    expect(state.phase).toBe("inspecting");
    state = reduceDsIntro(state, { type: "activate" });
    expect(state.phase).toBe("aligning");
    state = reduceDsIntro(state, { type: "opened" });
    expect(state.phase).toBe("aligning");
    state = reduceDsIntro(state, { type: "aligned" });
    state = reduceDsIntro(state, { type: "opened" });
    expect(state.phase).toBe("power-prompt");
  });

  it("supports the fallback closed-to-open path", () => {
    let state = reduceDsIntro(initialDsIntroState, { type: "session-checked", completed: false });
    state = reduceDsIntro(state, { type: "model-failed" });
    expect(state).toMatchObject({ phase: "fallback", fallbackOpen: false });
    state = reduceDsIntro(state, { type: "activate" });
    expect(state).toMatchObject({ phase: "fallback", fallbackOpen: true });
    state = reduceDsIntro(state, { type: "power-success" });
    expect(state.phase).toBe("handoff");

    const promptFailure = reduceDsIntro({ phase: "power-prompt", fallbackOpen: false }, { type: "model-failed" });
    expect(promptFailure).toMatchObject({ phase: "fallback", fallbackOpen: true });
  });

  it("requires the power success action before completing the handoff", () => {
    let state: DsIntroState = { phase: "power-prompt", fallbackOpen: false };
    expect(reduceDsIntro(state, { type: "handoff-complete" }).phase).toBe("power-prompt");
    state = reduceDsIntro(state, { type: "power-success" });
    expect(state.phase).toBe("handoff");
    expect(reduceDsIntro(state, { type: "handoff-complete" }).phase).toBe("complete");
  });

  it("keeps the contract timing values", () => {
    expect(DS_LITE_INTRO_TIMING.powerDragPx).toBe(32);
  });

  it("accepts only an upward power drag of at least 32 pixels", () => {
    expect(isPowerDragComplete(100, 69)).toBe(false);
    expect(isPowerDragComplete(100, 68)).toBe(true);
    expect(isPowerDragComplete(100, 140)).toBe(false);
    expect(isPowerDragComplete(null, 0)).toBe(false);
  });
});
