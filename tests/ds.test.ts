import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DS_POWER_OFF_REVEAL_MS,
  DS_POWER_ON_REVEAL_MS,
  DS_MENU_TILES,
  getDsPowerControlMode,
  initialDsFirmwareState,
  isDsPowerOffAvailable,
  isDsPowerOnAvailable,
  reduceDsFirmware,
  selectedDsTile,
  tileLabel,
  type DsFirmwareState,
} from "@/lib/ds/firmware";
import { dsActionForKey, dsControlForKey, dsDirectionalControlForKey } from "@/lib/ds/navigation";
import {
  DS_TIME_ZONE,
  formatDsDate,
  formatDsTime,
  getDsCalendar,
  getDsClockAngles,
  getDsClockParts,
  millisecondsUntilNextDsSecond,
  startDsClockTicker,
} from "@/lib/ds/clock";
import { powerIndicatorColorFor } from "@/lib/ds/power-indicator";
import { DsNativeClockCalendar } from "@/components/ds/DsNativeClockCalendar";

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

  it("supports an optional fast path when explicitly requested", () => {
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
      [3, "cartridge-placeholder"],
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
    const inert: DsFirmwareState = { ...initialDsFirmwareState, phase: "home", selectedTile: 6 };
    expect(reduceDsFirmware(inert, { type: "launch" })).toEqual(inert);
    expect(tileLabel("cartridge")).toMatch(/coming soon/i);
    expect(selectedDsTile({ ...initialDsFirmwareState, selectedTile: 99 })).toBe("alarm");
  });

  it("starts a shutdown transition without turning a short press into power-off", () => {
    const state: DsFirmwareState = { ...initialDsFirmwareState, phase: "home", poweredAt: -6_000 };
    const next = reduceDsFirmware(state, { type: "power-off-start", now: 9_000 });
    expect(next.phase).toBe("powering-off");
    expect(next.transition?.kind).toBe("shutdown");
    expect(reduceDsFirmware(next, { type: "power-off-complete", now: 9_880 }).phase).toBe("off");
  });

  it("reveals power-off at 15 seconds and power-on one second after shutdown", () => {
    expect(DS_POWER_OFF_REVEAL_MS).toBe(15_000);
    expect(DS_POWER_ON_REVEAL_MS).toBe(1_000);

    const powered = reduceDsFirmware(initialDsFirmwareState, { type: "power-on", now: 2_000 });
    expect(powered.poweredAt).toBe(2_000);
    expect(powered.poweredOffAt).toBeNull();
    expect(isDsPowerOffAvailable(powered, 16_999)).toBe(false);
    expect(getDsPowerControlMode(powered, 16_999)).toBe("hidden");
    expect(isDsPowerOffAvailable(powered, 17_000)).toBe(true);
    expect(getDsPowerControlMode(powered, 17_000)).toBe("power-off");
    expect(reduceDsFirmware(powered, { type: "power-off-start", now: 16_999 })).toEqual(powered);

    const poweringOff = reduceDsFirmware(powered, { type: "power-off-start", now: 17_000 });
    expect(poweringOff.phase).toBe("powering-off");
    expect(getDsPowerControlMode(poweringOff, 99_000)).toBe("hidden");

    const off = reduceDsFirmware(poweringOff, {
      type: "power-off-complete",
      startTime: 17_000,
      now: 17_880,
    });
    expect(off).toMatchObject({ phase: "off", poweredAt: null, poweredOffAt: 17_880 });
    expect(isDsPowerOnAvailable(off, 18_879)).toBe(false);
    expect(getDsPowerControlMode(off, 18_879)).toBe("hidden");
    expect(isDsPowerOnAvailable(off, 18_880)).toBe(true);
    expect(getDsPowerControlMode(off, 18_880)).toBe("power-on");
    expect(reduceDsFirmware(off, { type: "power-on", now: 18_879 })).toEqual(off);

    const restarted = reduceDsFirmware(off, { type: "power-on", now: 18_880 });
    expect(restarted).toMatchObject({ phase: "powering-on", poweredAt: 18_880, poweredOffAt: null });
    expect(getDsPowerControlMode(restarted, 33_879)).toBe("hidden");
    expect(getDsPowerControlMode(restarted, 33_880)).toBe("power-off");
  });

  it("ignores stale or out-of-phase shutdown completion callbacks", () => {
    const home: DsFirmwareState = { ...initialDsFirmwareState, phase: "home", poweredAt: 1_000 };
    expect(reduceDsFirmware(home, { type: "power-off-complete", now: 20_000 })).toEqual(home);

    const poweringOff = reduceDsFirmware(home, { type: "power-off-start", now: 16_000 });
    expect(poweringOff.phase).toBe("powering-off");
    expect(reduceDsFirmware(poweringOff, {
      type: "power-off-complete",
      startTime: 15_999,
      now: 16_880,
    })).toEqual(poweringOff);

    const completed = reduceDsFirmware(poweringOff, {
      type: "power-off-complete",
      startTime: 16_000,
      now: 16_880,
    });
    expect(completed).toMatchObject({ phase: "off", poweredAt: null, poweredOffAt: 16_880 });
    expect(reduceDsFirmware(completed, {
      type: "power-off-complete",
      startTime: 16_000,
      now: 17_000,
    })).toEqual(completed);
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

  it("extracts numeric Las Vegas parts across daylight-saving changes", () => {
    expect(getDsClockParts(new Date("2026-03-08T09:30:00.000Z"))).toMatchObject({
      year: 2026,
      month: 3,
      day: 8,
      hour: 1,
      minute: 30,
      second: 0,
    });
    expect(getDsClockParts(new Date("2026-03-08T10:30:00.000Z"))).toMatchObject({ hour: 3, minute: 30 });
    expect(getDsClockParts(new Date("2026-11-01T08:30:00.000Z"))).toMatchObject({ hour: 1, minute: 30 });
    expect(getDsClockParts(new Date("2026-11-01T09:30:00.000Z"))).toMatchObject({ hour: 1, minute: 30 });
  });

  it("derives deterministic analog hand angles, including second precision", () => {
    expect(getDsClockAngles(new Date("2026-08-10T07:00:00.000Z"))).toEqual({ hour: 0, minute: 0, second: 0 });
    expect(getDsClockAngles(new Date("2026-08-10T19:00:00.000Z"))).toEqual({ hour: 0, minute: 0, second: 0 });
    expect(getDsClockAngles(new Date("2026-08-10T19:15:00.000Z"))).toEqual({ hour: 7.5, minute: 90, second: 0 });
    expect(getDsClockAngles(new Date("2026-08-10T19:30:00.000Z"))).toEqual({ hour: 15, minute: 180, second: 0 });

    const atFiftyNineSeconds = getDsClockAngles(new Date("2026-08-10T19:00:59.000Z"));
    expect(atFiftyNineSeconds.hour).toBeCloseTo(59 / 120);
    expect(atFiftyNineSeconds.minute).toBeCloseTo(5.9);
    expect(atFiftyNineSeconds.second).toBe(354);
  });

  it("builds the current Las Vegas month rather than relying on baked-in menu art", () => {
    const calendar = getDsCalendar(new Date("2026-08-10T19:00:00.000Z"));
    expect(calendar).toMatchObject({ year: 2026, month: 8, day: 10, monthLabel: "AUG 2026" });
    expect(calendar.days[6]).toBe(1);
    expect(calendar.days[15]).toBe(10);
    expect(calendar.days.filter(Boolean)).toHaveLength(31);
    expect(calendar.weekCount).toBe(6);
  });

  it("handles leap years, five-week months, and Las Vegas year rollover", () => {
    const leapFebruary = getDsCalendar(new Date("2028-02-15T20:00:00.000Z"));
    expect(leapFebruary).toMatchObject({ year: 2028, month: 2, day: 15, weekCount: 5 });
    expect(leapFebruary.days[2]).toBe(1);
    expect(leapFebruary.days[30]).toBe(29);
    expect(leapFebruary.days.filter(Boolean)).toHaveLength(29);

    expect(getDsClockParts(new Date("2027-01-01T07:59:59.000Z"))).toMatchObject({
      year: 2026,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
      second: 59,
    });
    expect(getDsClockParts(new Date("2027-01-01T08:00:00.000Z"))).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("aligns ticks to wall-clock seconds and resynchronizes when the tab becomes visible", () => {
    expect(millisecondsUntilNextDsSecond(125)).toBe(875);
    expect(millisecondsUntilNextDsSecond(999)).toBe(1);
    expect(millisecondsUntilNextDsSecond(1_000)).toBe(1_000);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-10T19:00:00.125Z"));
      const ticks: Date[] = [];
      let visibilityListener: (() => void) | undefined;
      const visibility = {
        visibilityState: "visible",
        addEventListener: (_type: "visibilitychange", listener: () => void) => { visibilityListener = listener; },
        removeEventListener: (_type: "visibilitychange", listener: () => void) => {
          if (visibilityListener === listener) visibilityListener = undefined;
        },
      };
      const stop = startDsClockTicker((date) => ticks.push(date), {
        now: () => new Date(Date.now()),
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (timer) => clearTimeout(timer),
        visibility,
      });

      vi.advanceTimersByTime(874);
      expect(ticks).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(ticks.at(-1)?.toISOString()).toBe("2026-08-10T19:00:01.000Z");

      visibility.visibilityState = "hidden";
      visibilityListener?.();
      expect(ticks).toHaveLength(1);

      vi.setSystemTime(new Date("2026-08-10T19:00:05.450Z"));
      visibility.visibilityState = "visible";
      visibilityListener?.();
      expect(ticks.at(-1)?.toISOString()).toBe("2026-08-10T19:00:05.450Z");

      vi.advanceTimersByTime(549);
      expect(ticks).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(ticks.at(-1)?.toISOString()).toBe("2026-08-10T19:00:06.000Z");

      stop();
      expect(visibilityListener).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders both functional panels as native, non-live SVG without external assets", () => {
    const source = readFileSync(path.join(root, "components/ds/DsNativeClockCalendar.tsx"), "utf8");
    const markup = renderToStaticMarkup(createElement(DsNativeClockCalendar, {
      clock: new Date("2026-08-10T19:15:30.000Z"),
    }));

    expect(source).toContain("<svg");
    expect(source).not.toMatch(/<img|DsBitmapText|url\(|fontFamily|href=/i);
    expect(markup).toContain('class="ds-native-clock-calendar"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain("12:15 PM Las Vegas time");
    expect(markup).toContain("AUG 2026 calendar");
    expect(markup).not.toContain("aria-live");
    expect(markup).not.toContain("top.png");
  });
});

describe("DS keyboard contract and curated motion assets", () => {
  it("uses the familiar DeSmuME keyboard layout", () => {
    expect(dsActionForKey("Enter")).toEqual({ type: "hardware-press", control: "start" });
    expect(dsActionForKey("x")).toEqual({ type: "hardware-press", control: "a" });
    expect(dsActionForKey("z")).toEqual({ type: "hardware-press", control: "b" });
    expect(dsActionForKey("s")).toEqual({ type: "hardware-press", control: "x" });
    expect(dsActionForKey("a")).toEqual({ type: "hardware-press", control: "y" });
    expect(dsActionForKey("ArrowRight")).toEqual({ type: "select-delta", delta: 1 });
    expect(dsActionForKey("q")).toEqual({ type: "hardware-press", control: "l" });
    expect(dsActionForKey("w")).toEqual({ type: "hardware-press", control: "r" });
    expect(dsActionForKey("Shift", "ShiftRight")).toEqual({ type: "hardware-press", control: "select" });
    expect(dsActionForKey("p")).toEqual({ type: "hardware-press", control: "power" });
    expect(dsControlForKey(" ")).toBe("a");
    expect(dsControlForKey("Escape")).toBe("b");
    expect(dsControlForKey("Shift", "ShiftLeft")).toBeNull();
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

describe("DS Lite power indicator", () => {
  it("keeps a first visit normal and applies the off/on quirks independently afterward", () => {
    expect(powerIndicatorColorFor(true, false, () => 0)).toBe("green");
    expect(powerIndicatorColorFor(false, false, () => 0)).toBe("off");
    expect(powerIndicatorColorFor(true, true, () => 0.049)).toBe("red");
    expect(powerIndicatorColorFor(true, true, () => 0.05)).toBe("green");
    expect(powerIndicatorColorFor(false, true, () => 0.099)).toBe("orange");
    expect(powerIndicatorColorFor(false, true, () => 0.1)).toBe("off");
  });
});
