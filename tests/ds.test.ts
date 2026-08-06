import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DS_MENU_TILES,
  initialDsFirmwareState,
  reduceDsFirmware,
  selectedDsTile,
  tileLabel,
  type DsFirmwareState,
} from "@/lib/ds/firmware";
import { dsActionForKey, dsDirectionalControlForKey } from "@/lib/ds/navigation";
import { DS_TIME_ZONE, formatDsDate, formatDsTime } from "@/lib/ds/clock";

const root = path.resolve(import.meta.dirname, "..");

describe("original DS firmware state machine", () => {
  it("walks the frame-backed power, warning, touch prompt, and menu phases", () => {
    let state = reduceDsFirmware(initialDsFirmwareState, { type: "power-on", now: 0 });
    expect(state.phase).toBe("powering-on");
    state = reduceDsFirmware(state, { type: "boot-next" });
    expect(state.phase).toBe("boot-logo");
    state = reduceDsFirmware(state, { type: "boot-next" });
    expect(state.phase).toBe("health-warning");
    state = reduceDsFirmware(state, { type: "boot-next" });
    expect(state.phase).toBe("touch-prompt");
    state = reduceDsFirmware(state, { type: "touch", now: 3_380 });
    expect(state.phase).toBe("menu-transition");
    expect(state.transition?.kind).toBe("boot-fade");
    state = reduceDsFirmware(state, { type: "transition-complete" });
    expect(state.phase).toBe("home");
  });

  it("uses the session-only fast path after the first completed boot", () => {
    let state = reduceDsFirmware(initialDsFirmwareState, { type: "power-on", skipBoot: true, now: 5_000 });
    expect(state.phase).toBe("menu-transition");
    expect(state.transition?.kind).toBe("quick-menu");
    state = reduceDsFirmware(state, { type: "transition-complete" });
    expect(state.phase).toBe("home");
    state = reduceDsFirmware(state, { type: "select-delta", delta: -99 });
    expect(state.selectedTile).toBe(0);
    state = reduceDsFirmware(state, { type: "select-delta", delta: 99 });
    expect(state.selectedTile).toBe(DS_MENU_TILES.length - 1);
  });

  it("launches real firmware destinations and leaves inert hardware slots inert", () => {
    const destinations = new Map<number, string>([
      [0, "cartridge-placeholder"],
      [1, "pictochat"],
      [2, "download-play"],
      [5, "settings"],
    ]);
    for (const [index, phase] of destinations) {
      let state: DsFirmwareState = { ...initialDsFirmwareState, phase: "home", selectedTile: index };
      state = reduceDsFirmware(state, { type: "launch", now: 1 });
      expect(state.phase).toBe("menu-transition");
      expect(state.transition?.destination).toBe(phase);
      state = reduceDsFirmware(state, { type: "transition-complete" });
      expect(state.phase).toBe(phase);
    }
    const inert: DsFirmwareState = { ...initialDsFirmwareState, phase: "home", selectedTile: 3 };
    expect(reduceDsFirmware(inert, { type: "launch" })).toEqual(inert);
    expect(tileLabel("cartridge")).toMatch(/coming soon/i);
    expect(selectedDsTile({ ...initialDsFirmwareState, selectedTile: 99 })).toBe("alarm");
  });

  it("starts a shutdown transition without turning a short press into power-off", () => {
    const state: DsFirmwareState = { ...initialDsFirmwareState, phase: "home" };
    const next = reduceDsFirmware(state, { type: "power-off-start", now: 9_000 });
    expect(next.phase).toBe("powering-off");
    expect(next.transition?.kind).toBe("shutdown");
    expect(reduceDsFirmware(next, { type: "power-off-complete" }).phase).toBe("off");
  });

  it("ignores stale transition callbacks and blocks back during an in-flight swap", () => {
    const state = reduceDsFirmware(
      { ...initialDsFirmwareState, phase: "home" },
      { type: "launch", now: 12 },
    );
    expect(reduceDsFirmware(state, { type: "back", now: 13 })).toEqual(state);
    expect(reduceDsFirmware(state, { type: "transition-complete", startTime: 11 })).toEqual(state);
    expect(reduceDsFirmware(state, { type: "transition-complete", startTime: 12 }).phase).toBe("cartridge-placeholder");
  });
});

describe("Las Vegas firmware clock", () => {
  it("pins the clock to Pacific time and follows daylight-saving transitions", () => {
    expect(DS_TIME_ZONE).toBe("America/Los_Angeles");
    expect(formatDsDate(new Date("2026-03-08T09:30:00.000Z"))).toBe("03/08/2026");
    expect(formatDsTime(new Date("2026-03-08T09:30:00.000Z"))).toBe("01:30 AM");
    expect(formatDsTime(new Date("2026-03-08T10:30:00.000Z"))).toBe("03:30 AM");
    expect(formatDsTime(new Date("2026-11-01T08:30:00.000Z"))).toBe("01:30 AM");
    expect(formatDsTime(new Date("2026-11-01T09:30:00.000Z"))).toBe("01:30 AM");
  });
});

describe("DS keyboard contract and curated motion assets", () => {
  it("maps authentic controls without turning shoulders into portfolio shortcuts", () => {
    expect(dsActionForKey("Enter")).toEqual({ type: "launch" });
    expect(dsActionForKey("a")).toEqual({ type: "launch" });
    expect(dsActionForKey("Escape")).toEqual({ type: "back" });
    expect(dsActionForKey("ArrowRight")).toEqual({ type: "select-delta", delta: 1 });
    expect(dsActionForKey("x")).toEqual({ type: "hardware-press", control: "x" });
    expect(dsActionForKey("q")).toEqual({ type: "hardware-press", control: "l" });
    expect(dsActionForKey("e")).toEqual({ type: "hardware-press", control: "r" });
    expect(dsActionForKey("1")).toEqual({ type: "hardware-press", control: "select" });
    expect(dsActionForKey("2")).toEqual({ type: "hardware-press", control: "start" });
    expect(dsActionForKey("p")).toEqual({ type: "hardware-press", control: "power" });
    expect(dsDirectionalControlForKey("ArrowLeft")).toBe("dpad-left");
    expect(dsDirectionalControlForKey("ArrowUp")).toBe("dpad-up");
    expect(dsDirectionalControlForKey("ArrowDown")).toBe("dpad-down");
    expect(dsDirectionalControlForKey("x")).toBeNull();
  });

  it("keeps source hashes, logical crops, and frame atlas dimensions deterministic", () => {
    const crops = JSON.parse(readFileSync(path.join(root, "assets/ds/crops.json"), "utf8")) as {
      regions: Record<string, { source: string; x: number; y: number; output: string; width: number; height: number; sha256: string }>;
    };
    expect(crops.regions["menu-bottom"].x).toBe(7);
    expect(crops.regions["menu-bottom"].y).toBe(216);
    for (const [id, region] of Object.entries(crops.regions)) {
      const file = readFileSync(path.join(root, region.output));
      expect(file.length, id).toBeGreaterThan(32);
      expect(createHash("sha256").update(file).digest("hex"), id).toBe(region.sha256);
      expect(file.readUInt32BE(16), id).toBe(region.width);
      expect(file.readUInt32BE(20), id).toBe(region.height);
    }

    const motion = JSON.parse(readFileSync(path.join(root, "assets/ds/motion.json"), "utf8")) as {
      sources: Record<string, { output: string; timingOutput: string; rawPath: string }>;
      sprites: Array<{ output: string; sha256: string }>;
    };
    expect(motion.sources.splash.rawPath).toContain("assets/ds/raw/boot");
    for (const [id, source] of Object.entries(motion.sources)) {
      const atlas = readFileSync(path.join(root, source.output));
      const timing = JSON.parse(readFileSync(path.join(root, source.timingOutput), "utf8")) as { frameCount: number; totalDurationMs: number; delays: number[] };
      expect(atlas.readUInt32BE(16), id).toBe(2_048);
      expect(timing.frameCount, id).toBeGreaterThan(1);
      expect(timing.totalDurationMs, id).toBeGreaterThan(100);
      expect(timing.delays.length, id).toBe(timing.frameCount);
      if (id === "splash") {
        expect(timing.frameCount).toBe(111);
        expect(timing.totalDurationMs).toBe(2_220);
        expect(new Set(timing.delays)).toEqual(new Set([20]));
      }
      if (id === "health") {
        expect(timing.frameCount).toBe(38);
        expect(timing.totalDurationMs).toBe(1_160);
        expect(timing.delays.filter((delay) => delay === 40).length).toBe(20);
      }
    }
    for (const sprite of motion.sprites) {
      const file = readFileSync(path.join(root, sprite.output));
      expect(existsSync(path.join(root, sprite.output))).toBe(true);
      expect(createHash("sha256").update(file).digest("hex")).toBe(sprite.sha256);
    }

    const references = JSON.parse(readFileSync(path.join(root, "assets/ds/references.json"), "utf8")) as Record<string, { output: string; sha256: string; outputDimensions: { width: number; height: number } }>;
    for (const [id, reference] of Object.entries(references)) {
      const file = readFileSync(path.join(root, reference.output));
      expect(createHash("sha256").update(file).digest("hex"), id).toBe(reference.sha256);
      expect(file.readUInt32BE(16), id).toBe(reference.outputDimensions.width);
      expect(file.readUInt32BE(20), id).toBe(reference.outputDimensions.height);
    }
  });
});
