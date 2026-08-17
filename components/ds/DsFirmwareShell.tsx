"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { getAudio } from "@/lib/audio/engine";
import type { SfxName } from "@/lib/audio/sounds";
import {
  cartridgeForKind,
  cartridgesForKind,
  type DsCartridge,
  type DsCartridgeKind,
  type DsCartridgeLaunch,
  type GbaCartridgeId,
  type NdsCartridgeId,
} from "@/lib/ds/cartridges";
import {
  DS_POWER_OFF_REVEAL_MS,
  DS_POWER_ON_REVEAL_MS,
  DS_MENU_TILES,
  getDsPowerControlMode,
  initialDsFirmwareState,
  reduceDsFirmware,
  selectedDsTile,
  tileLabel,
  type DsControlId,
  type DsFirmwarePhase,
  type DsMenuTileId,
  type DsPowerControlMode,
} from "@/lib/ds/firmware";
import { dsControlForKey } from "@/lib/ds/navigation";
import { initialDsHardwareState, reduceDsHardware, type DsHardwareState, type DsInstalledCartridges } from "@/lib/ds/hardware";
import { startDsClockTicker } from "@/lib/ds/clock";
import { powerIndicatorColorFor, type DsPowerIndicatorColor } from "@/lib/ds/power-indicator";
import { DsBitmapText } from "./DsBitmapText";
import { DsNativeClockCalendar } from "./DsNativeClockCalendar";
import { DsRuntimeFrame, useSkyEmuRuntime, type SkyEmuRuntime } from "./DsSkyEmuRuntime";
import { DsScreen } from "./DsScreen";
import { DsLiteIntro } from "./DsLiteIntro";
import type { PowerSwitchAnchor, ProjectedBounds } from "./DsLiteIntroCanvas";
import {
  DS_LITE_INTRO_TIMING,
  initialDsIntroState,
  isDsIntroBlocking,
  reduceDsIntro,
} from "@/lib/ds/intro";

const MUTE_KEY = "ds-firmware-muted";
const VOLUME_KEY = "ds-firmware-volume";
const BOOT_LOGO_MS = 2_220;
const HEALTH_MS = 1_160;
const SELECT_FADE_FRAMES = 25;
const MENU_FADE_FRAMES = 31;
const FRAME_MS = 1000 / 60;
const POWER_VISIT_COOKIE = "flick-ds-visited";
const INSTALLED_CARTRIDGES_KEY = "flick-ds-installed-cartridges";
const SPLASH_DELAYS = Array.from({ length: 111 }, () => 20);

const HEALTH_DELAYS = [
  20, 20, 20, 20, 40, 40, 40, 40, 20, 20, 20, 20, 20, 40, 40, 40, 40, 40, 40,
  20, 40, 40, 40, 40, 40, 40, 20, 20, 20, 20, 20, 40, 40, 40, 40, 40, 20, 20, 20,
];

const DsLiteFirmwareCanvas = dynamic(
  () => import("./DsLiteIntroCanvas").then((module) => module.DsLiteIntroCanvas),
  { ssr: false, loading: () => null },
);

const DOWNLOAD_HOSTS = [
  { title: "New Super Mario Bros.", status: "User", players: "01/02" },
  { title: "TETRIS DS", status: "Manuel", players: "01/10" },
  { title: "Pac-Man Vs.", status: "User", players: "01/04" },
] as const;

const MENU_HITBOXES: Record<DsMenuTileId, { x: number; y: number; width: number; height: number }> = {
  cartridge: { x: 33, y: 25, width: 188, height: 44 },
  pictochat: { x: 33, y: 73, width: 92, height: 44 },
  "download-play": { x: 129, y: 73, width: 92, height: 44 },
  gba: { x: 33, y: 121, width: 188, height: 44 },
  backlight: { x: 10, y: 175, width: 12, height: 12 },
  settings: { x: 117, y: 170, width: 20, height: 20 },
  alarm: { x: 234, y: 170, width: 12, height: 20 },
};

const CURSOR_TARGETS: Record<DsMenuTileId, { x: number; y: number; width: number; height: number }> = {
  cartridge: { x: 31, y: 23, width: 182, height: 38 },
  pictochat: { x: 31, y: 71, width: 86, height: 38 },
  "download-play": { x: 127, y: 71, width: 86, height: 38 },
  gba: { x: 31, y: 119, width: 182, height: 38 },
  backlight: { x: 0, y: 167, width: 20, height: 18 },
  settings: { x: 112, y: 167, width: 20, height: 18 },
  alarm: { x: 225, y: 167, width: 20, height: 18 },
};

type PressedControl = { control: DsControlId; pointerId: number | null } | null;

type Firmware3dAnchors = {
  base: ProjectedBounds | null;
  top: ProjectedBounds | null;
  bottom: ProjectedBounds | null;
  power: PowerSwitchAnchor | null;
  cartridgeNds: PowerSwitchAnchor | null;
  cartridgeGba: PowerSwitchAnchor | null;
  stylus: PowerSwitchAnchor | null;
};

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function normalizeLaunch(launch: DsCartridgeLaunch | undefined): DsCartridgeLaunch | null {
  return launch ?? null;
}

function launchUsesTopScreen(launch: DsCartridgeLaunch | undefined): boolean {
  if (!launch) return false;
  return launch.type === "rom" ? launch.system === "gba" : launch.display === "top-only";
}

export function DsFirmwareShell() {
  const [state, dispatch] = useReducer(reduceDsFirmware, initialDsFirmwareState);
  const [hardware, dispatchHardware] = useReducer(reduceDsHardware, initialDsHardwareState);
  const [intro, dispatchIntro] = useReducer(reduceDsIntro, initialDsIntroState);
  const [introModelReady, setIntroModelReady] = useState(false);
  const [firmwareModelReady, setFirmwareModelReady] = useState(false);
  const [firmwareModelFailed, setFirmwareModelFailed] = useState(false);
  const [firmwareAnchors, setFirmwareAnchors] = useState<Firmware3dAnchors>({
    base: null,
    top: null,
    bottom: null,
    power: null,
    cartridgeNds: null,
    cartridgeGba: null,
    stylus: null,
  });
  const [firmwarePowerSwitchPulse, setFirmwarePowerSwitchPulse] = useState(0);
  const [powerClock, setPowerClock] = useState(now);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [hydrated, setHydrated] = useState(false);
  const [transitionFrame, setTransitionFrame] = useState(0);
  const [pressedControl, setPressedControl] = useState<PressedControl>(null);
  const [heldControls, setHeldControls] = useState<Set<DsControlId>>(() => new Set());
  const [pressedTile, setPressedTile] = useState<DsMenuTileId | null>(null);
  const [downloadSelection, setDownloadSelection] = useState(0);
  const [keyboardGuideOpen, setKeyboardGuideOpen] = useState(false);
  const [launchedCartridgeSlot, setLaunchedCartridgeSlot] = useState<DsCartridgeKind>("nds");
  const [screenFocus, setScreenFocus] = useState<"full" | "top">("full");
  const [returningVisitor, setReturningVisitor] = useState<boolean | null>(null);
  const [powerIndicatorColor, setPowerIndicatorColor] = useState<DsPowerIndicatorColor>("off");
  const [tileAway, setTileAway] = useState(false);
  const [cursor, setCursor] = useState(() => CURSOR_TARGETS[DS_MENU_TILES[0]]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const powerButtonRef = useRef<HTMLButtonElement | null>(null);
  const powerGuideRef = useRef<HTMLDivElement | null>(null);
  const selectedTileButton = useRef<HTMLButtonElement | null>(null);
  const tileAwayRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const pendingPowerOnAfterOpen = useRef(false);
  const previousIndicatorPower = useRef<boolean | null>(null);
  const previousIndicatorVisitor = useRef<boolean | null>(null);
  const phase = state.phase;
  // A one-shot timer changes this memo at the exact 15 s / 1 s boundaries,
  // so the helper never needs a permanent polling interval.
  const powerControlMode = useMemo(() => getDsPowerControlMode(state, powerClock), [powerClock, state]);
  const effectivePowerControlMode = hardware.mode === "idle" && (hardware.pose === "open" || hardware.pose === "closed")
    ? powerControlMode
    : "hidden";
  const installedNdsCartridge = hardware.cartridges.nds
    ? cartridgeForKind("nds", hardware.cartridges.nds)
    : null;
  const installedGbaCartridge = hardware.cartridges.gba
    ? cartridgeForKind("gba", hardware.cartridges.gba)
    : null;
  const activeCartridge = launchedCartridgeSlot === "gba" ? installedGbaCartridge : installedNdsCartridge;
  const activeLaunch = normalizeLaunch((phase === "cartridge-placeholder" || (phase === "menu-transition" && state.transition?.kind === "launch"))
    ? activeCartridge?.launch
    : undefined);
  const topOnlyLaunch = launchUsesTopScreen(activeCartridge?.launch);
  const skyEmuRuntime = useSkyEmuRuntime(activeLaunch);
  const releaseAllRuntime = skyEmuRuntime.releaseAll;
  const introBlocking = isDsIntroBlocking(intro.phase);
  // Warm the persistent firmware canvas beneath the opaque power prompt, then
  // leave it mounted through handoff and normal use. Its GLB and projected
  // screen anchors are therefore ready before the visitor powers on; no
  // canvas remount or late model fade can read as a page reload.
  const show3dFirmware = (intro.phase === "power-prompt" || intro.phase === "handoff" || intro.phase === "complete") && !firmwareModelFailed;
  // Keep the legacy DOM shell available only for the explicit WebGL fallback.
  // During a normal intro/handoff it is never mounted, so the powered model
  // cannot flash back to the old frame between the POWER gesture and the GLB.
  const showLegacyConsole = intro.phase === "fallback" || (intro.phase === "complete" && firmwareModelFailed);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    dispatchHardware({ type: "set-powered", powered: phase !== "off" && phase !== "powering-off" });
  }, [phase]);

  useEffect(() => {
    // The opening experience is deliberately replayable: every document load
    // starts with the closed, orbitable 3D console instead of using a
    // returning-session shortcut.
    dispatchIntro({ type: "session-checked", completed: false });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntroModelReady(false);
  }, []);

  useEffect(() => {
    const visitedBefore = document.cookie.split(";").some((cookie) => cookie.trim() === `${POWER_VISIT_COOKIE}=1`);
    if (!visitedBefore) document.cookie = `${POWER_VISIT_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
    // Cookie detection must happen after hydration so a first visit can never
    // briefly inherit an odd LED color from server-rendered state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturningVisitor(visitedBefore);
  }, []);

  useEffect(() => {
    if (returningVisitor === null) return;
    const powered = phase !== "off" && phase !== "powering-off";
    if (previousIndicatorPower.current === powered && previousIndicatorVisitor.current === returningVisitor) return;
    previousIndicatorPower.current = powered;
    previousIndicatorVisitor.current = returningVisitor;
    setPowerIndicatorColor(powerIndicatorColorFor(powered, returningVisitor));
  }, [phase, returningVisitor]);

  useEffect(() => {
    // Once the visitor taps, the alignment/opening phases must make progress
    // through the render loop. If WebGL created a blank canvas or lost its
    // context, those callbacks never arrive; keep the explicit 2D fallback
    // available instead of leaving the intro stuck on “Returning to the home
    // position…”. Inspection itself intentionally has no timeout so a visitor
    // can rotate the console for as long as they want.
    if (intro.phase !== "aligning" && intro.phase !== "opening") return;
    const timer = window.setTimeout(() => dispatchIntro({ type: "model-failed" }), 10_000);
    return () => window.clearTimeout(timer);
  }, [intro.phase]);

  useEffect(() => {
    if (!show3dFirmware || firmwareModelReady || firmwareModelFailed) return;
    const timer = window.setTimeout(() => setFirmwareModelFailed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [firmwareModelFailed, firmwareModelReady, show3dFirmware]);

  useEffect(() => {
    if (intro.phase !== "handoff") return;
    const timer = window.setTimeout(
      () => dispatchIntro({ type: "handoff-complete" }),
      reducedMotion ? 0 : DS_LITE_INTRO_TIMING.handoffMs,
    );
    return () => window.clearTimeout(timer);
  }, [intro.phase, reducedMotion]);

  useEffect(() => {
    const savedMuted = window.localStorage.getItem(MUTE_KEY) === "true";
    const savedVolume = Number(window.localStorage.getItem(VOLUME_KEY));
    dispatch({ type: "set-muted", muted: savedMuted });
    if (Number.isFinite(savedVolume)) dispatch({ type: "set-volume", volume: savedVolume });
    // This initialization bridges browser preferences into the client island once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cartridges: DsInstalledCartridges = initialDsHardwareState.cartridges;
    try {
      const raw = window.localStorage.getItem(INSTALLED_CARTRIDGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DsInstalledCartridges>;
        cartridges = {
          nds: parsed.nds && cartridgeForKind("nds", parsed.nds) ? parsed.nds : null,
          gba: parsed.gba && cartridgeForKind("gba", parsed.gba) ? parsed.gba : null,
        };
      }
    } catch {
      cartridges = initialDsHardwareState.cartridges;
    }
    dispatchHardware({
      type: "restore-installed",
      cartridges,
      // The stylus is a physical accessory for the current session only. A
      // fresh page load always starts with it seated in its holder, even when
      // the visitor removed it before refreshing.
      stylusPresent: true,
    });
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(INSTALLED_CARTRIDGES_KEY, JSON.stringify(hardware.cartridges));
  }, [hardware.cartridges, hardware.stylusPresent, hydrated]);

  useEffect(() => {
    getAudio().preload([
      "ds-startup",
      "ds-select",
      "ds-confirm",
      "ds-shutdown",
      "ds-hover",
      "ds-invalid",
      "ds-downloadplay-searching",
    ]);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MUTE_KEY, String(state.muted));
    window.localStorage.setItem(VOLUME_KEY, String(state.volume));
    const audio = getAudio();
    audio.setMuted(state.muted);
    audio.setVolume(state.volume);
  }, [hydrated, state.muted, state.volume]);

  useEffect(() => {
    return startDsClockTicker(setClock, {
      now: () => new Date(),
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
      clearTimeout: (timer) => window.clearTimeout(timer),
      visibility: document,
    });
  }, []);

  useEffect(() => {
    let boundary: number | null = null;
    if (state.phase === "off" && state.poweredOffAt !== null) {
      boundary = state.poweredOffAt + DS_POWER_ON_REVEAL_MS;
    } else if (state.phase !== "off" && state.phase !== "powering-off" && state.poweredAt !== null) {
      boundary = state.poweredAt + DS_POWER_OFF_REVEAL_MS;
    }

    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (boundary === null) return;
      const remaining = boundary - now();
      if (remaining <= 0) return;
      timer = window.setTimeout(() => setPowerClock(now()), Math.ceil(remaining));
    };
    schedule();

    const resync = () => {
      if (document.visibilityState !== "visible") return;
      setPowerClock(now());
      schedule();
    };
    document.addEventListener("visibilitychange", resync);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [state.phase, state.poweredAt, state.poweredOffAt]);

  const play = useCallback((name: SfxName) => getAudio().play(name), []);

  const handleFirmwareModelReady = useCallback(() => setFirmwareModelReady(true), []);
  const handleFirmwareModelError = useCallback(() => {
    setFirmwareModelFailed(true);
    setFirmwareModelReady(false);
  }, []);
  const handleFirmwareScreenPosition = useCallback((screen: "top" | "bottom", position: ProjectedBounds) => {
    setFirmwareAnchors((current) => ({ ...current, [screen]: position }));
  }, []);
  const handleFirmwareBasePosition = useCallback((position: ProjectedBounds) => {
    setFirmwareAnchors((current) => ({ ...current, base: position }));
  }, []);
  const handleFirmwarePowerPosition = useCallback((position: PowerSwitchAnchor) => {
    setFirmwareAnchors((current) => ({ ...current, power: position }));
  }, []);
  const handleCartridgePromptPosition = useCallback((slot: DsCartridgeKind, position: PowerSwitchAnchor) => {
    setFirmwareAnchors((current) => ({
      ...current,
      [slot === "nds" ? "cartridgeNds" : "cartridgeGba"]: position,
    }));
  }, []);
  const handleStylusPromptPosition = useCallback((position: PowerSwitchAnchor) => {
    setFirmwareAnchors((current) => ({ ...current, stylus: position }));
  }, []);

  const completeTransition = useCallback((startTime: number) => {
    if (state.transition?.startTime !== startTime) return;
    dispatch({ type: "transition-complete", startTime });
  }, [state.transition]);

  useEffect(() => {
    if (phase === "powering-on") {
      const timer = window.setTimeout(() => {
        dispatch({ type: "boot-next" });
      }, reducedMotion ? 0 : 1);
      return () => window.clearTimeout(timer);
    }
    if (phase === "boot-logo") {
      const startupTimer = window.setTimeout(() => play("ds-startup"), reducedMotion ? 0 : 520);
      const nextTimer = window.setTimeout(() => dispatch({ type: "boot-next" }), reducedMotion ? 0 : BOOT_LOGO_MS);
      return () => {
        window.clearTimeout(startupTimer);
        window.clearTimeout(nextTimer);
      };
    }
    if (phase === "health-warning") {
      const nextTimer = window.setTimeout(() => dispatch({ type: "boot-next" }), reducedMotion ? 0 : HEALTH_MS);
      return () => window.clearTimeout(nextTimer);
    }
    if (phase === "menu-transition" && state.transition) {
      const transition = state.transition;
      const frames = transition.kind === "quick-menu" ? MENU_FADE_FRAMES : SELECT_FADE_FRAMES + MENU_FADE_FRAMES;
      const timer = window.setTimeout(() => completeTransition(transition.startTime), reducedMotion ? 0 : Math.ceil(frames * FRAME_MS));
      return () => window.clearTimeout(timer);
    }
    if (phase === "powering-off") {
      const transitionStart = state.transition?.startTime;
      const timer = window.setTimeout(() => {
        dispatch({ type: "power-off-complete", startTime: transitionStart, now: now() });
        setPressedControl(null);
      }, reducedMotion ? 0 : 880);
      return () => window.clearTimeout(timer);
    }
  }, [completeTransition, phase, play, reducedMotion, state.transition]);

  useEffect(() => {
    if (phase !== "menu-transition" && phase !== "powering-off") {
      // Resetting the visual clock when leaving a transition keeps stale frames from leaking into the next launch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTransitionFrame(0);
      return;
    }
    if (reducedMotion) {
      setTransitionFrame(SELECT_FADE_FRAMES + MENU_FADE_FRAMES);
      return;
    }
    let frame = 0;
    let raf = 0;
    let last = now();
    const tick = (time: number) => {
      const elapsed = time - last;
      if (elapsed >= FRAME_MS) {
        const steps = Math.min(4, Math.floor(elapsed / FRAME_MS));
        last += steps * FRAME_MS;
        frame += steps;
        setTransitionFrame(frame);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [phase, reducedMotion, state.transition?.kind]);

  useEffect(() => {
    if (phase === "off" || phase === "powering-off") {
      // Camera focus is external presentation state and must reset with power.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScreenFocus("full");
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "home") return;
    const target = CURSOR_TARGETS[DS_MENU_TILES[state.selectedTile]];
    if (reducedMotion) {
      // Reduced motion intentionally snaps the hardware cursor to its destination.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCursor(target);
      return;
    }
    let raf = 0;
    let last = now();
    const tick = (time: number) => {
      if (time - last >= FRAME_MS) {
        last = time;
        setCursor((current) => {
          const next = {
            x: Math.round(current.x + (target.x - current.x) * 0.25),
            y: Math.round(current.y + (target.y - current.y) * 0.25),
            width: target.width,
            height: target.height,
          };
          return next;
        });
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [phase, reducedMotion, state.selectedTile]);

  useEffect(() => {
    if (effectivePowerControlMode === "power-on" && !introBlocking) powerGuideRef.current?.focus({ preventScroll: true });
    if (phase === "home") selectedTileButton.current?.focus({ preventScroll: true });
  }, [effectivePowerControlMode, introBlocking, phase, state.selectedTile]);

  const powerOn = useCallback((at = now()) => {
    const audio = getAudio();
    audio.unlock();
    audio.setMuted(state.muted);
    audio.setVolume(state.volume);
    setPowerClock(at);
    dispatch({ type: "power-on", skipBoot: reducedMotionRef.current, now: at });
  }, [state.muted, state.volume]);

  const activateIntro = useCallback(() => {
    if (intro.phase === "inspecting") {
      dispatchIntro({ type: "activate" });
      if (reducedMotionRef.current) {
        dispatchIntro({ type: "aligned" });
        dispatchIntro({ type: "opened" });
      }
      return;
    }
    if (intro.phase === "fallback") dispatchIntro({ type: "activate" });
  }, [intro.phase]);

  const completeIntroWithPower = useCallback(() => {
    if (intro.phase !== "power-prompt" && !(intro.phase === "fallback" && intro.fallbackOpen)) return;
    powerOn();
    dispatchIntro({ type: "power-success" });
  }, [intro.fallbackOpen, intro.phase, powerOn]);

  const skipIntro = useCallback(() => {
    // Skipping is intentionally a page-local escape hatch. A later refresh
    // still starts the closed intro again.
    dispatchIntro({ type: "skip" });
  }, []);

  const togglePower = useCallback(() => {
    const actionTime = now();
    const mode = getDsPowerControlMode(state, actionTime);
    if (mode === "hidden") return false;
    setPowerClock(actionTime);
    if (mode === "power-on") {
      if (hardware.mode !== "idle" || (hardware.pose !== "open" && hardware.pose !== "closed")) return false;
      if (hardware.pose === "closed") {
        pendingPowerOnAfterOpen.current = true;
        dispatchHardware({ type: "request-open" });
        return true;
      }
      powerOn(actionTime);
      return true;
    }
    play("ds-shutdown");
    dispatch({ type: "power-off-start", now: actionTime });
    return true;
  }, [hardware.mode, hardware.pose, play, powerOn, state]);

  const toggleFirmwarePower = useCallback(() => {
    if (!togglePower()) return;
    setFirmwarePowerSwitchPulse((current) => current + 1);
  }, [togglePower]);

  const pressPowerVisual = useCallback(() => {
    if (effectivePowerControlMode === "hidden") return;
    setPressedControl({ control: "power", pointerId: null });
  }, [effectivePowerControlMode]);

  const releasePowerVisual = useCallback(() => {
    setPressedControl((current) => (current?.control === "power" ? null : current));
    setHeldControls((current) => {
      if (!current.has("power")) return current;
      const next = new Set(current);
      next.delete("power");
      return next;
    });
  }, []);

  const handleHardwareMotionComplete = useCallback((token: number) => {
    if (token !== hardware.motionToken) return;
    if (hardware.pose === "closing") {
      dispatchHardware({ type: "close-complete", token });
      return;
    }
    if (hardware.pose === "opening") {
      dispatchHardware({ type: "open-complete", token });
      if (pendingPowerOnAfterOpen.current) {
        pendingPowerOnAfterOpen.current = false;
        powerOn();
      }
      return;
    }
    if (hardware.mode === "ejecting") {
      dispatchHardware({ type: "eject-complete", token });
      return;
    }
    if (hardware.mode === "inserting") dispatchHardware({ type: "insert-complete", token });
    if (hardware.mode === "stylus-ejecting" || hardware.mode === "stylus-inserting") {
      dispatchHardware({ type: "stylus-motion-complete", token });
    }
  }, [hardware.mode, hardware.motionToken, hardware.pose, powerOn]);

  const activateCartridgeSlot = useCallback((slot: DsCartridgeKind) => {
    dispatchHardware({ type: "request-eject", slot });
  }, []);

  const activateStylus = useCallback(() => {
    dispatchHardware({ type: hardware.stylusPresent ? "request-stylus-eject" : "request-stylus-insert" });
  }, [hardware.stylusPresent]);

  const selectServiceCartridge = useCallback((cartridge: DsCartridge) => {
    if (cartridge.kind === "nds") {
      dispatchHardware({ type: "select-cartridge", slot: "nds", cartridgeId: cartridge.id as NdsCartridgeId });
    } else {
      dispatchHardware({ type: "select-cartridge", slot: "gba", cartridgeId: cartridge.id as GbaCartridgeId });
    }
  }, []);
  const activateLibraryCartridge = useCallback((slot: DsCartridgeKind) => {
    const removed = hardware.removedCartridge;
    if (!removed || removed.slot !== slot) return;
    if (slot === "nds") dispatchHardware({ type: "select-cartridge", slot: "nds", cartridgeId: removed.cartridgeId as NdsCartridgeId });
    else dispatchHardware({ type: "select-cartridge", slot: "gba", cartridgeId: removed.cartridgeId as GbaCartridgeId });
  }, [hardware.removedCartridge]);
  const previewLibraryCartridge = useCallback((cartridge: DsCartridge) => {
    if (cartridge.kind === "nds") {
      dispatchHardware({ type: "preview-cartridge", slot: "nds", cartridgeId: cartridge.id as NdsCartridgeId });
    } else {
      dispatchHardware({ type: "preview-cartridge", slot: "gba", cartridgeId: cartridge.id as GbaCartridgeId });
    }
  }, []);

  const moveSelection = useCallback((delta: number) => {
    dispatch({ type: "select-delta", delta });
    play("ds-hover");
  }, [play]);

  const moveDownloadSelection = useCallback((delta: number) => {
    setDownloadSelection((current) => {
      const next = Math.max(0, Math.min(DOWNLOAD_HOSTS.length - 1, current + delta));
      if (next !== current) play("ds-hover");
      return next;
    });
  }, [play]);

  const activateSelected = useCallback(() => {
    if (phase !== "home") return;
    const tile = selectedDsTile(state);
    if (tile === "backlight") {
      dispatch({ type: "set-backlight", backlight: !state.backlight });
      play("ds-settings-increase");
      return;
    }
    if (tile === "alarm" || (tile === "cartridge" && !installedNdsCartridge) || (tile === "gba" && !installedGbaCartridge)) {
      play("ds-invalid");
      return;
    }
    if (tile === "cartridge") setLaunchedCartridgeSlot("nds");
    if (tile === "gba") setLaunchedCartridgeSlot("gba");
    const launchTarget = tile === "cartridge" ? installedNdsCartridge : installedGbaCartridge;
    setScreenFocus(launchUsesTopScreen(launchTarget?.launch) ? "top" : "full");
    play("ds-confirm");
    dispatch({ type: "launch", now: now() });
  }, [installedGbaCartridge, installedNdsCartridge, phase, play, state]);

  const goBack = useCallback(() => {
    if (!["pictochat", "download-play", "settings", "cartridge-placeholder"].includes(phase)) return;
    play("ds-select");
    setScreenFocus("full");
    dispatch({ type: "back", now: now() });
  }, [phase, play]);

  const transition = state.transition;
  const visualPhase = useMemo(() => {
    if (phase === "menu-transition" && transition) {
      if (transition.kind === "quick-menu") return transition.destination;
      return transitionFrame >= SELECT_FADE_FRAMES ? transition.destination : transition.source;
    }
    if (phase === "powering-off" && transition) return transition.source;
    return phase;
  }, [phase, transition, transitionFrame]);

  const pressControl = useCallback((control: DsControlId) => {
    if (control === "power") {
      if (effectivePowerControlMode === "hidden") return;
      setPressedControl({ control, pointerId: null });
      setHeldControls((current) => new Set(current).add(control));
      toggleFirmwarePower();
      return;
    }
    setPressedControl({ control, pointerId: null });
    setHeldControls((current) => {
      const next = new Set(current);
      next.add(control);
      return next;
    });
    if (activeLaunch?.type === "rom" && visualPhase === "cartridge-placeholder") {
      skyEmuRuntime.press(control);
      return;
    }
    if (phase === "off" || phase === "powering-off") return;
    if (phase === "touch-prompt" && (control === "a" || control === "start")) {
      play("ds-select");
      dispatch({ type: "touch", now: now() });
      return;
    }
    if (phase === "download-play") {
      if (control === "dpad-left" || control === "dpad-up") moveDownloadSelection(-1);
      if (control === "dpad-right" || control === "dpad-down") moveDownloadSelection(1);
      if (control === "a" || control === "start") play("ds-confirm");
      if (control === "b") goBack();
      return;
    }
    if (phase !== "home") {
      if (control === "b") goBack();
      return;
    }
    if (control === "dpad-left" || control === "dpad-up") moveSelection(-1);
    if (control === "dpad-right" || control === "dpad-down") moveSelection(1);
    if (control === "a" || control === "start") activateSelected();
    if (control === "b") goBack();
  }, [activateSelected, activeLaunch, effectivePowerControlMode, goBack, moveDownloadSelection, moveSelection, phase, play, skyEmuRuntime, toggleFirmwarePower, visualPhase]);

  const releaseControl = useCallback((control: DsControlId) => {
    setPressedControl((current) => (current?.control === control ? null : current));
    setHeldControls((current) => {
      if (!current.has(control)) return current;
      const next = new Set(current);
      next.delete(control);
      return next;
    });
    if (activeLaunch?.type === "rom" && visualPhase === "cartridge-placeholder") skyEmuRuntime.release(control);
  }, [activeLaunch, skyEmuRuntime, visualPhase]);

  useEffect(() => {
    const clearHeld = () => {
      setHeldControls(new Set());
      setPressedControl(null);
      releaseAllRuntime();
    };
    window.addEventListener("blur", clearHeld);
    document.addEventListener("visibilitychange", clearHeld);
    return () => {
      window.removeEventListener("blur", clearHeld);
      document.removeEventListener("visibilitychange", clearHeld);
    };
  }, [releaseAllRuntime]);

  useEffect(() => {
    if (skyEmuRuntime.status !== "error") return;
    // A worker/WASM failure must not leave a physical or semantic key held in
    // the host UI while the runtime has stopped accepting releases.
    // Defer the state transition to the next task. This keeps the effect as a
    // subscription to the runtime's external status instead of synchronously
    // cascading another render from inside the effect body.
    const clearId = window.setTimeout(() => {
      setHeldControls(new Set());
      setPressedControl(null);
      releaseAllRuntime();
    }, 0);
    return () => window.clearTimeout(clearId);
  }, [releaseAllRuntime, skyEmuRuntime.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      const key = event.key;
      if (introBlocking) return;
      if (target?.closest(".ds-hardware-button, .ds-menu-hotspot, .ds-keyboard-guide") && (key === "Enter" || key === " ")) return;
      if (keyboardGuideOpen) {
        if (key === "Escape") {
          event.preventDefault();
          setKeyboardGuideOpen(false);
        }
        return;
      }
      const control = dsControlForKey(key, event.code);
      if (!control) return;
      if (event.repeat && !control.startsWith("dpad-")) return;
      event.preventDefault();
      if (control === "power") {
        if (!event.repeat) pressControl("power");
        return;
      }
      if (phase === "off") return;
      pressControl(control);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (target?.closest(".ds-hardware-button, .ds-menu-hotspot, .ds-keyboard-guide") && (event.key === "Enter" || event.key === " ")) return;
      const control = dsControlForKey(event.key, event.code);
      if (control) releaseControl(control);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [introBlocking, keyboardGuideOpen, phase, pressControl, releaseControl]);

  useEffect(() => {
    const onVisibility = () => getAudio().suppressBgm(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const washOpacity = useMemo(() => {
    if (phase === "powering-off") return reducedMotion ? 1 : Math.min(1, transitionFrame / SELECT_FADE_FRAMES);
    if (phase !== "menu-transition" || !transition) return 0;
    if (transition.kind === "quick-menu") return reducedMotion ? 0 : Math.max(0, 1 - transitionFrame / MENU_FADE_FRAMES);
    if (transitionFrame <= SELECT_FADE_FRAMES) return transitionFrame / SELECT_FADE_FRAMES;
    return Math.max(0, 1 - (transitionFrame - SELECT_FADE_FRAMES) / MENU_FADE_FRAMES);
  }, [phase, reducedMotion, transition, transitionFrame]);

  const onScreenPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input")) return;
    if (activeLaunch?.type === "rom" && visualPhase === "cartridge-placeholder") {
      const rect = event.currentTarget.getBoundingClientRect();
      skyEmuRuntime.touch(
        Math.max(0, Math.min(255, ((event.clientX - rect.left) / rect.width) * 256)),
        Math.max(0, Math.min(191, ((event.clientY - rect.top) / rect.height) * 192)),
        true,
      );
      return;
    }
    touchStart.current = { x: event.clientX, y: event.clientY };
    if (visualPhase === "touch-prompt") {
      dispatch({ type: "touch", now: now() });
      play("ds-select");
    }
  };

  const onScreenPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeLaunch?.type === "rom" && visualPhase === "cartridge-placeholder") {
      const rect = event.currentTarget.getBoundingClientRect();
      skyEmuRuntime.touch(
        Math.max(0, Math.min(255, ((event.clientX - rect.left) / rect.width) * 256)),
        Math.max(0, Math.min(191, ((event.clientY - rect.top) / rect.height) * 192)),
        false,
      );
      return;
    }
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || visualPhase !== "home") return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 14) {
      moveSelection(deltaX < 0 || deltaY > 0 ? 1 : -1);
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (visualPhase !== "home") return;
    event.preventDefault();
    moveSelection(event.deltaY > 0 ? 1 : -1);
  };

  const consoleClass = [
    "ds-console",
    "ds-console-overlay",
    phase === "off" ? "is-off" : "is-on",
    phase === "powering-off" ? "is-powering-off" : "",
    state.backlight ? "is-backlit" : "is-backlight-off",
  ].filter(Boolean).join(" ");

  return (
    <main className={`ds-page ds-page-overlay ${show3dFirmware ? "is-3d-firmware" : ""}`}>
      {introBlocking && (
        <DsLiteIntro
          phase={intro.phase}
          fallbackOpen={intro.fallbackOpen}
          reducedMotion={reducedMotion}
          modelReady={introModelReady}
          onModelReady={() => setIntroModelReady(true)}
          onActivate={activateIntro}
          onAligned={() => dispatchIntro({ type: "aligned" })}
          onOpenComplete={() => dispatchIntro({ type: "opened" })}
          onModelError={() => {
            setIntroModelReady(false);
            dispatchIntro({ type: "model-failed" });
          }}
          onPowerSuccess={completeIntroWithPower}
          onSkip={skipIntro}
          powerIndicatorColor={powerIndicatorColor}
        />
      )}

      <header className="ds-page-header" aria-hidden={introBlocking}>
        <DsBitmapText>FLICK OWENS / CRIMSON DS LITE</DsBitmapText>
        <span className="ds-header-meta">256 × 192 FIRMWARE</span>
      </header>

      <DsKeyboardGuide open={keyboardGuideOpen} onToggle={() => setKeyboardGuideOpen((current) => !current)} />

      {show3dFirmware ? (
        <DsLiteFirmwareStage
          phase={phase}
          visualPhase={visualPhase}
          clock={clock}
          reducedMotion={reducedMotion}
          state={state}
          serviceEnabled={!introBlocking}
          hardware={hardware}
          installedNdsCartridge={installedNdsCartridge}
          installedGbaCartridge={installedGbaCartridge}
          launchedCartridgeSlot={launchedCartridgeSlot}
          skyEmuRuntime={skyEmuRuntime}
          runtimeFrame={skyEmuRuntime.frame}
          onRuntimeTouch={(x, y, pressed) => skyEmuRuntime.touch(x, y, pressed)}
          screenFocus={screenFocus}
          topOnlyLaunch={topOnlyLaunch}
          onScreenFocusToggle={() => setScreenFocus((current) => current === "top" ? "full" : "top")}
          anchors={firmwareAnchors}
          modelReady={firmwareModelReady}
          pressedControl={pressedControl?.control ?? null}
          pressedControls={heldControls}
          powerIndicatorColor={powerIndicatorColor}
          powerControlMode={introBlocking ? "hidden" : effectivePowerControlMode}
          powerButtonRef={powerButtonRef}
          powerGuideRef={powerGuideRef}
          selectedTileButton={selectedTileButton}
          cursor={cursor}
          pressedTile={pressedTile}
          tileAway={tileAway}
          transitionFrame={transitionFrame}
          onModelReady={handleFirmwareModelReady}
          onModelError={handleFirmwareModelError}
          onScreenPosition={handleFirmwareScreenPosition}
          onBasePosition={handleFirmwareBasePosition}
          onPowerSwitchPosition={handleFirmwarePowerPosition}
          onCartridgePromptPosition={handleCartridgePromptPosition}
          onStylusPromptPosition={handleStylusPromptPosition}
          onPress={pressControl}
          onRelease={releaseControl}
          onPowerFlick={toggleFirmwarePower}
          onPowerPress={pressPowerVisual}
          onPowerRelease={releasePowerVisual}
          onShellActivate={() => dispatchHardware({ type: "request-close" })}
          onCartridgeActivate={activateCartridgeSlot}
          onStylusActivate={activateStylus}
          onLibraryCartridgeActivate={activateLibraryCartridge}
          onHardwareMotionComplete={handleHardwareMotionComplete}
          onSelectServiceCartridge={selectServiceCartridge}
          onPreviewServiceCartridge={previewLibraryCartridge}
          onCancelCartridgeLibrary={() => dispatchHardware({ type: "cancel-library" })}
          powerSwitchPulse={firmwarePowerSwitchPulse}
          volume={state.volume}
          onVolumeChange={(volume) => dispatch({ type: "set-volume", volume })}
          onScreenPointerDown={onScreenPointerDown}
          onScreenPointerUp={onScreenPointerUp}
          onWheel={onWheel}
          onSelect={(index) => {
            dispatch({ type: "select-tile", index });
            play("ds-hover");
          }}
          onLaunch={activateSelected}
          onContinue={() => {
            play("ds-select");
            dispatch({ type: "touch", now: now() });
          }}
          onMenuPress={(tile, pointerId) => {
            setPressedTile(tile);
            tileAwayRef.current = false;
            setTileAway(false);
            if (pointerId !== undefined) setPressedControl(null);
          }}
          onMenuAway={(away) => {
            tileAwayRef.current = away;
            setTileAway(away);
          }}
          onMenuRelease={(tile, index, cancelled) => {
            const wasAway = tileAwayRef.current;
            tileAwayRef.current = false;
            setPressedTile(null);
            setTileAway(false);
            if (cancelled || wasAway) return;
            if (index !== state.selectedTile) {
              dispatch({ type: "select-tile", index });
              play("ds-hover");
            } else {
              activateSelected();
            }
            if (tile === "backlight") play("ds-hover");
          }}
          muted={state.muted}
          onMutedChange={(muted) => dispatch({ type: "set-muted", muted })}
          onDownloadSelect={(index) => {
            setDownloadSelection(index);
            play("ds-hover");
          }}
          downloadSelection={downloadSelection}
          onBack={goBack}
        />
      ) : showLegacyConsole ? (
      <div className="ds-console-wrap" aria-hidden={introBlocking} inert={introBlocking ? true : undefined}>
        <section className={consoleClass} aria-label="Crimson Red Nintendo DS Lite">
          <div className="ds-top-lid">
            <div className="ds-speaker ds-speaker-left" aria-hidden="true" />
            <div className="ds-speaker ds-speaker-right" aria-hidden="true" />
            <DsScreen label="Top screen" className="ds-top-screen">
              <DsTopContent phase={visualPhase} clock={clock} reducedMotion={reducedMotion} />
              {washOpacity > 0 && <div className={`ds-transition-screen-wash ${phase === "powering-off" ? "is-shutdown" : ""}`} style={{ opacity: washOpacity }} aria-hidden="true" />}
            </DsScreen>
            <div className="ds-lid-logo" aria-hidden="true">NINTENDO DS</div>
          </div>
          <div className="ds-hinge" aria-hidden="true" />
          <div className="ds-bottom-deck">
            <DsScreen
              label="Touch screen"
              className="ds-bottom-screen"
              onPointerDown={onScreenPointerDown}
              onPointerUp={onScreenPointerUp}
              onWheel={onWheel}
              >
                <DsBottomContent
                phase={visualPhase}
                selectedTile={state.selectedTile}
                selectedTileButton={selectedTileButton}
                cursor={cursor}
                reducedMotion={reducedMotion}
                pressedTile={pressedTile}
                tileAway={tileAway}
                transitionFrame={transitionFrame}
                installedNdsCartridge={installedNdsCartridge}
                installedGbaCartridge={installedGbaCartridge}
                launchedCartridgeSlot={launchedCartridgeSlot}
                runtime={skyEmuRuntime}
                onSelect={(index) => {
                  dispatch({ type: "select-tile", index });
                  play("ds-hover");
                }}
                onLaunch={activateSelected}
                onContinue={() => {
                  play("ds-select");
                  dispatch({ type: "touch", now: now() });
                }}
                onMenuPress={(tile, pointerId) => {
                  setPressedTile(tile);
                  tileAwayRef.current = false;
                  setTileAway(false);
                  if (pointerId !== undefined) setPressedControl(null);
                }}
                onMenuAway={(away) => {
                  tileAwayRef.current = away;
                  setTileAway(away);
                }}
                onMenuRelease={(tile, index, cancelled) => {
                  const wasAway = tileAwayRef.current;
                  tileAwayRef.current = false;
                  setPressedTile(null);
                  setTileAway(false);
                  if (cancelled || wasAway) return;
                  if (index !== state.selectedTile) {
                    dispatch({ type: "select-tile", index });
                    play("ds-hover");
                  } else {
                    activateSelected();
                  }
                  if (tile === "backlight") play("ds-hover");
                }}
                muted={state.muted}
                volume={state.volume}
                onMutedChange={(muted) => dispatch({ type: "set-muted", muted })}
                onVolumeChange={(volume) => dispatch({ type: "set-volume", volume })}
                downloadSelection={downloadSelection}
                onDownloadSelect={(index) => {
                  setDownloadSelection(index);
                  play("ds-hover");
                }}
                onBack={goBack}
                />
                {washOpacity > 0 && <div className={`ds-transition-screen-wash ${phase === "powering-off" ? "is-shutdown" : ""}`} style={{ opacity: washOpacity }} aria-hidden="true" />}
              </DsScreen>
            <DsHardwareControls
              phase={phase}
              pressedControl={pressedControl?.control ?? null}
              powerButtonRef={powerButtonRef}
              onPress={pressControl}
              onRelease={releaseControl}
              onPowerFlick={togglePower}
              onPowerPress={pressPowerVisual}
              onPowerRelease={releasePowerVisual}
              volume={state.volume}
              onVolumeChange={(volume) => dispatch({ type: "set-volume", volume })}
            />
            <div className="ds-microphone" aria-hidden="true" />
          </div>
          <div className="ds-status-leds" aria-label="Console status">
            <span className={`ds-led ds-led-power ${phase !== "off" ? "is-lit" : ""}`} aria-label={phase === "off" ? "Power off" : "Power on"} />
            <span className={`ds-led ds-led-wireless ${visualPhase === "download-play" ? "is-searching" : ""}`} aria-hidden="true" />
          </div>
        </section>
      </div>
      ) : null}

      <footer className="ds-page-footer" aria-hidden={introBlocking}>
        <span>{phase === "off" ? "FLICK POWER UP TO START" : "256 × 192 / AUTHENTIC CONTROL SURFACE"}</span>
        <span>© {new Date().getFullYear()} Flick Owens</span>
      </footer>
    </main>
  );
}

function DsKeyboardGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const mappings = [
    ["D-PAD", "↑ ↓ ← →"],
    ["A", "X"],
    ["B", "Z"],
    ["X", "S"],
    ["Y", "A"],
    ["L / R", "Q / W"],
    ["START", "ENTER"],
    ["SELECT", "RIGHT SHIFT"],
  ];

  return (
    <aside className={`ds-keyboard-guide ${open ? "is-open" : ""}`} aria-label="Keyboard controls">
      <button type="button" className="ds-keyboard-guide-toggle" aria-expanded={open} aria-controls="ds-keyboard-guide-panel" onClick={onToggle}>
        <span aria-hidden="true">?</span><span className="sr-only">{open ? "Close" : "Open"} keyboard controls</span>
      </button>
      {open && (
        <section id="ds-keyboard-guide-panel" className="ds-keyboard-guide-panel" aria-label="DeSmuME keyboard layout">
          <div className="ds-keyboard-guide-heading">
            <DsBitmapText>KEYBOARD</DsBitmapText>
            <span>DeSmuME layout</span>
          </div>
          <dl>
            {mappings.map(([control, key]) => (
              <div key={control}>
                <dt>{control}</dt><dd><kbd>{key}</kbd></dd>
              </div>
            ))}
          </dl>
          <p><kbd>P</kbd> is this site&apos;s POWER shortcut.</p>
          <p className="ds-asset-credits">
            ACCESSORIES / <a href="https://sketchfab.com/3d-models/nintendo-ds-cartridge-preset-01e161c3e7c24b40888fdf94ad003501" target="_blank" rel="noreferrer">LITTLENGVFX</a> · <a href="https://sketchfab.com/3d-models/gameboy-advance-cartridge-38c1e6702e5d4f21af1d0930689b1d10" target="_blank" rel="noreferrer">VXCL</a> · <a href="https://commons.wikimedia.org/wiki/File:DS_Lite_stylus.jpg" target="_blank" rel="noreferrer">STYLUS REF</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> / <a href="https://creativecommons.org/licenses/by/2.5/" target="_blank" rel="noreferrer">CC BY 2.5</a>
          </p>
        </section>
      )}
    </aside>
  );
}

type DsLiteFirmwareStageProps = {
  phase: DsFirmwarePhase;
  visualPhase: DsFirmwarePhase;
  clock: Date;
  reducedMotion: boolean;
  state: typeof initialDsFirmwareState;
  serviceEnabled: boolean;
  hardware: DsHardwareState;
  installedNdsCartridge: DsCartridge | null;
  installedGbaCartridge: DsCartridge | null;
  launchedCartridgeSlot: DsCartridgeKind;
  skyEmuRuntime: SkyEmuRuntime;
  runtimeFrame: SkyEmuRuntime["frame"];
  onRuntimeTouch: (x: number, y: number, pressed: boolean) => void;
  screenFocus: "full" | "top";
  topOnlyLaunch: boolean;
  onScreenFocusToggle: () => void;
  anchors: Firmware3dAnchors;
  modelReady: boolean;
  pressedControl: DsControlId | null;
  pressedControls: ReadonlySet<DsControlId>;
  powerIndicatorColor: DsPowerIndicatorColor;
  powerControlMode: DsPowerControlMode;
  powerButtonRef: MutableRefObject<HTMLButtonElement | null>;
  powerGuideRef: MutableRefObject<HTMLDivElement | null>;
  selectedTileButton: MutableRefObject<HTMLButtonElement | null>;
  cursor: { x: number; y: number; width: number; height: number };
  pressedTile: DsMenuTileId | null;
  tileAway: boolean;
  transitionFrame: number;
  onModelReady: () => void;
  onModelError: () => void;
  onScreenPosition: (screen: "top" | "bottom", position: ProjectedBounds) => void;
  onBasePosition: (position: ProjectedBounds) => void;
  onPowerSwitchPosition: (position: PowerSwitchAnchor) => void;
  onCartridgePromptPosition: (slot: DsCartridgeKind, position: PowerSwitchAnchor) => void;
  onStylusPromptPosition: (position: PowerSwitchAnchor) => void;
  onPress: (control: DsControlId) => void;
  onRelease: (control: DsControlId) => void;
  onPowerFlick: () => void;
  onPowerPress: () => void;
  onPowerRelease: () => void;
  onShellActivate: () => void;
  onCartridgeActivate: (slot: DsCartridgeKind) => void;
  onStylusActivate: () => void;
  onLibraryCartridgeActivate: (slot: DsCartridgeKind) => void;
  onHardwareMotionComplete: (token: number) => void;
  onSelectServiceCartridge: (cartridge: DsCartridge) => void;
  onPreviewServiceCartridge: (cartridge: DsCartridge) => void;
  onCancelCartridgeLibrary: () => void;
  powerSwitchPulse: number;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onScreenPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onScreenPointerUp: React.PointerEventHandler<HTMLDivElement>;
  onWheel: React.WheelEventHandler<HTMLDivElement>;
  onSelect: (index: number) => void;
  onLaunch: () => void;
  onContinue: () => void;
  onMenuPress: (tile: DsMenuTileId, pointerId?: number) => void;
  onMenuAway: (away: boolean) => void;
  onMenuRelease: (tile: DsMenuTileId, index: number, cancelled: boolean) => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  onDownloadSelect: (index: number) => void;
  downloadSelection: number;
  onBack: () => void;
};

function DsLiteFirmwareStage({
  phase,
  visualPhase,
  clock,
  reducedMotion,
  state,
  serviceEnabled,
  hardware,
  installedNdsCartridge,
  installedGbaCartridge,
  launchedCartridgeSlot,
  skyEmuRuntime,
  runtimeFrame,
  onRuntimeTouch,
  screenFocus,
  topOnlyLaunch,
  onScreenFocusToggle,
  anchors,
  modelReady,
  pressedControl,
  pressedControls,
  powerIndicatorColor,
  powerControlMode,
  powerButtonRef,
  powerGuideRef,
  selectedTileButton,
  cursor,
  pressedTile,
  tileAway,
  transitionFrame,
  onModelReady,
  onModelError,
  onScreenPosition,
  onBasePosition,
  onPowerSwitchPosition,
  onCartridgePromptPosition,
  onStylusPromptPosition,
  onPress,
  onRelease,
  onPowerFlick,
  onPowerPress,
  onPowerRelease,
  onShellActivate,
  onCartridgeActivate,
  onStylusActivate,
  onLibraryCartridgeActivate,
  onHardwareMotionComplete,
  onSelectServiceCartridge,
  onPreviewServiceCartridge,
  onCancelCartridgeLibrary,
  powerSwitchPulse,
  volume,
  onVolumeChange,
  onScreenPointerDown,
  onScreenPointerUp,
  onWheel,
  onSelect,
  onLaunch,
  onContinue,
  onMenuPress,
  onMenuAway,
  onMenuRelease,
  muted,
  onMutedChange,
  onDownloadSelect,
  downloadSelection,
  onBack,
}: DsLiteFirmwareStageProps) {
  const [runtimeWash, setRuntimeWash] = useState(false);
  const runtimeSequence = runtimeFrame?.sequence ?? null;
  const runtimeStarted = useRef(false);

  useEffect(() => {
    if (visualPhase !== "cartridge-placeholder") {
      runtimeStarted.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRuntimeWash(false);
      return;
    }
    if (runtimeSequence === null || runtimeStarted.current) return;
    runtimeStarted.current = true;
    // Hide the native placeholder for one short frame while the first
    // verified framebuffer reaches the GLB screen material.
    setRuntimeWash(true);
    const timer = window.setTimeout(() => setRuntimeWash(false), reducedMotion ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, runtimeSequence, visualPhase]);

  const washOpacity = useMemo(() => {
    if (phase === "powering-off") return reducedMotion ? 1 : Math.min(1, transitionFrame / SELECT_FADE_FRAMES);
    if (phase !== "menu-transition" || !state.transition) return 0;
    if (state.transition.kind === "quick-menu") return reducedMotion ? 0 : Math.max(0, 1 - transitionFrame / MENU_FADE_FRAMES);
    if (transitionFrame <= SELECT_FADE_FRAMES) return transitionFrame / SELECT_FADE_FRAMES;
    return Math.max(0, 1 - (transitionFrame - SELECT_FADE_FRAMES) / MENU_FADE_FRAMES);
  }, [phase, reducedMotion, state.transition, transitionFrame]);
  const runtimeActive = visualPhase === "cartridge-placeholder" && skyEmuRuntime.status !== "idle";

  return (
    <div className={`ds-3d-firmware-stage ${modelReady ? "is-ready" : ""}`} aria-label="Crimson Red Nintendo DS Lite firmware">
      <div className="ds-3d-firmware-shadow" aria-hidden="true" />
      <div className={`ds-3d-firmware-canvas-layer ${modelReady ? "is-ready" : ""}`} aria-hidden="true">
        <DsLiteFirmwareCanvas
          phase="firmware"
          screenFocus={screenFocus}
          reducedMotion={reducedMotion}
          onModelReady={onModelReady}
          onError={onModelError}
          onScreenPosition={onScreenPosition}
          onBasePosition={onBasePosition}
          onPowerSwitchPosition={onPowerSwitchPosition}
          onMeshControlPress={(control) => {
            if (control === "power") onPowerPress();
            else onPress(control as DsControlId);
          }}
          onMeshControlRelease={(control) => {
            if (control === "power") onPowerRelease();
            else onRelease(control as DsControlId);
          }}
          onMeshPowerFlick={onPowerFlick}
          powerInputEnabled={powerControlMode !== "hidden"}
          hardwareState={hardware}
          onShellActivate={serviceEnabled ? onShellActivate : undefined}
          onCartridgeActivate={serviceEnabled ? onCartridgeActivate : undefined}
          onCartridgePromptPosition={onCartridgePromptPosition}
          onStylusPromptPosition={onStylusPromptPosition}
          onStylusActivate={onStylusActivate}
          onLibraryCartridgeActivate={onLibraryCartridgeActivate}
          onHardwareMotionComplete={onHardwareMotionComplete}
          powerSwitchPulse={powerSwitchPulse}
          pressedControl={pressedControl}
          pressedControls={pressedControls}
          powerIndicatorColor={powerIndicatorColor}
          runtimeFrame={runtimeFrame}
          onRuntimeTouch={onRuntimeTouch}
        />
      </div>

      {serviceEnabled && phase === "off" && hardware.mode === "idle" && (hardware.pose === "open" || hardware.pose === "closed") && (
        <div className={`ds-cartridge-service-hint is-${hardware.pose}`} aria-hidden="true">
          <DsBitmapText>{hardware.pose === "open" ? "TAP CONSOLE TO CLOSE" : "CARTRIDGE SERVICE"}</DsBitmapText>
          <span>{hardware.pose === "open" ? "POWERED OFF" : "ROTATE / SELECT A SLOT DOT"}</span>
        </div>
      )}

      {hardware.pose === "open" && phase !== "off" && (
        <>
          <Ds3dScreen
            anchor={anchors.top}
            label="Top screen"
            className={`ds-3d-screen-top ${runtimeActive && modelReady ? "is-runtime-hit-surface" : ""}`}
          >
            {runtimeActive
              ? skyEmuRuntime.frame && !modelReady ? <DsRuntimeFrame frame={skyEmuRuntime.frame} screen="top" /> : modelReady ? null : <div className="ds-black-screen" />
              : <DsTopContent phase={visualPhase} clock={clock} reducedMotion={reducedMotion} />}
            {washOpacity > 0 && <div className={`ds-transition-screen-wash ${phase === "powering-off" ? "is-shutdown" : ""}`} style={{ opacity: washOpacity }} aria-hidden="true" />}
            {runtimeWash && <div className="ds-runtime-frame-wash" aria-hidden="true" />}
          </Ds3dScreen>
          <Ds3dScreen
            anchor={anchors.bottom}
            label="Touch screen"
            className={`ds-3d-screen-bottom ${runtimeActive && modelReady ? "is-runtime-hit-surface" : ""}`}
            onPointerDown={onScreenPointerDown}
            onPointerUp={onScreenPointerUp}
            onWheel={onWheel}
          >
            {runtimeActive && skyEmuRuntime.frame && !modelReady ? <DsRuntimeFrame frame={skyEmuRuntime.frame} screen="bottom" /> : runtimeActive && modelReady ? null : runtimeActive ? <div className="ds-black-screen" /> : <DsBottomContent
              phase={visualPhase}
              selectedTile={state.selectedTile}
              selectedTileButton={selectedTileButton}
              cursor={cursor}
              reducedMotion={reducedMotion}
              pressedTile={pressedTile}
              tileAway={tileAway}
              transitionFrame={transitionFrame}
              installedNdsCartridge={installedNdsCartridge}
              installedGbaCartridge={installedGbaCartridge}
              launchedCartridgeSlot={launchedCartridgeSlot}
              runtime={skyEmuRuntime}
              onSelect={onSelect}
              onLaunch={onLaunch}
              onContinue={onContinue}
              onMenuPress={onMenuPress}
              onMenuAway={onMenuAway}
              onMenuRelease={onMenuRelease}
              muted={muted}
              volume={volume}
              onMutedChange={onMutedChange}
              onVolumeChange={onVolumeChange}
              downloadSelection={downloadSelection}
              onDownloadSelect={onDownloadSelect}
              onBack={onBack}
            />}
            {washOpacity > 0 && <div className={`ds-transition-screen-wash ${phase === "powering-off" ? "is-shutdown" : ""}`} style={{ opacity: washOpacity }} aria-hidden="true" />}
            {runtimeWash && <div className="ds-runtime-frame-wash" aria-hidden="true" />}
          </Ds3dScreen>
        </>
      )}

      {visualPhase === "cartridge-placeholder" && skyEmuRuntime.status === "error" && skyEmuRuntime.error && (
        <p className="ds-runtime-status" role="status">{skyEmuRuntime.error}</p>
      )}

      {topOnlyLaunch && hardware.pose === "open" && phase !== "off" && (
        <button type="button" className="ds-screen-focus-toggle" onClick={onScreenFocusToggle} aria-label={screenFocus === "top" ? "Show full Nintendo DS" : "Focus upper Nintendo DS screen"}>
          {screenFocus === "top" ? "−" : "+"}
        </button>
      )}
      {topOnlyLaunch && screenFocus === "top" && hardware.pose === "open" && phase !== "off" && (
        <DsTopFocusControls onPress={onPress} onRelease={onRelease} pressedControl={pressedControl} />
      )}

      <Ds3dHardwareControls
        phase={phase}
        deckAnchor={anchors.base}
        powerAnchor={anchors.power}
        pressedControl={pressedControl}
        powerButtonRef={powerButtonRef}
        onPress={onPress}
        onRelease={onRelease}
        onPowerFlick={onPowerFlick}
        onPowerPress={onPowerPress}
        onPowerRelease={onPowerRelease}
        volume={volume}
        onVolumeChange={onVolumeChange}
        pointerEnabled={false}
      />
      <DsAmbientPowerRail
        mode={powerControlMode}
        controlRef={powerGuideRef}
        onPowerFlick={onPowerFlick}
      />
      {serviceEnabled && phase === "off" && hardware.pose === "closed" && hardware.mode === "idle" && (
        <div className="ds-cartridge-service-access" aria-label="Cartridge service controls">
          <DsCartridgePromptHit slot="nds" anchor={anchors.cartridgeNds} onActivate={onCartridgeActivate} />
          <DsCartridgePromptHit slot="gba" anchor={anchors.cartridgeGba} onActivate={onCartridgeActivate} />
          <DsStylusPromptHit anchor={anchors.stylus} present={hardware.stylusPresent} onActivate={onStylusActivate} />
        </div>
      )}
      {serviceEnabled && phase === "off" && hardware.mode === "library" && hardware.activeSlot && (
        <DsCartridgeLibrary
          slot={hardware.activeSlot}
          initialCartridgeId={hardware.removedCartridge?.cartridgeId}
          onSelect={onSelectServiceCartridge}
          onPreview={onPreviewServiceCartridge}
          onCancel={onCancelCartridgeLibrary}
        />
      )}
    </div>
  );
}

function DsTopFocusControls({
  onPress,
  onRelease,
  pressedControl,
}: {
  onPress: (control: DsControlId) => void;
  onRelease: (control: DsControlId) => void;
  pressedControl: DsControlId | null;
}) {
  const button = (control: DsControlId, label: string, className: string) => (
    <button
      key={control}
      type="button"
      className={`ds-top-focus-control ${className} ${pressedControl === control ? "is-depressed" : ""}`}
      aria-label={label}
      onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onPress(control); }}
      onPointerUp={(event) => { event.stopPropagation(); onRelease(control); event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => onRelease(control)}
      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); onPress(control); } }}
      onKeyUp={() => onRelease(control)}
    >
      {label}
    </button>
  );
  return (
    <div className="ds-top-focus-controls" aria-label="Upper screen virtual controls">
      <div className="ds-top-focus-left">
        {button("dpad-up", "D-pad up", "is-up")}
        {button("dpad-left", "D-pad left", "is-left")}
        {button("dpad-right", "D-pad right", "is-right")}
        {button("dpad-down", "D-pad down", "is-down")}
        {button("l", "Left shoulder", "is-l")}
      </div>
      <div className="ds-top-focus-right">
        {button("y", "Y", "is-y")}{button("x", "X", "is-x")}{button("a", "A", "is-a")}{button("b", "B", "is-b")}
        {button("r", "Right shoulder", "is-r")}
      </div>
      <div className="ds-top-focus-system">
        {button("select", "Select", "is-select")}{button("start", "Start", "is-start")}
      </div>
    </div>
  );
}

function DsAmbientPowerRail({
  mode,
  controlRef,
  onPowerFlick,
}: {
  mode: DsPowerControlMode;
  controlRef: MutableRefObject<HTMLDivElement | null>;
  onPowerFlick: () => void;
}) {
  const startY = useRef<number | null>(null);
  const fired = useRef(false);

  if (mode === "hidden") return null;

  const finish = (clientY: number) => {
    if (fired.current || startY.current === null) return;
    if (startY.current - clientY < 32) return;
    fired.current = true;
    onPowerFlick();
  };

  return (
    <div
      ref={controlRef}
      className={`ds-ambient-power-rail is-${mode}`}
      role="button"
      tabIndex={0}
      aria-label={`Slide up to turn the Nintendo DS Lite ${mode === "power-on" ? "on" : "off"}`}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        startY.current = event.clientY;
        fired.current = false;
      }}
      onPointerMove={(event) => finish(event.clientY)}
      onPointerUp={(event) => {
        event.stopPropagation();
        finish(event.clientY);
        startY.current = null;
      }}
      onPointerCancel={() => { startY.current = null; fired.current = false; }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) onPowerFlick();
      }}
    >
      <svg className="ds-ambient-power-arrow" viewBox="0 0 24 52" aria-hidden="true">
        <path d="M12 49V5M4 13l8-8 8 8" />
      </svg>
      <span>POWER</span>
      <small>{mode === "power-on" ? "ON" : "OFF"}</small>
    </div>
  );
}

function DsCartridgeLibrary({
  slot,
  initialCartridgeId,
  onSelect,
  onPreview,
  onCancel,
}: {
  slot: DsCartridgeKind;
  initialCartridgeId?: string;
  onSelect: (cartridge: DsCartridge) => void;
  onPreview: (cartridge: DsCartridge) => void;
  onCancel: () => void;
}) {
  const cartridges = cartridgesForKind(slot);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, cartridges.findIndex((cartridge) => cartridge.id === initialCartridgeId)));
  const carouselGesture = useRef<{ pointerId: number; startX: number; dragged: boolean } | null>(null);
  const suppressCardClick = useRef(false);
  useEffect(() => {
    const index = cartridges.findIndex((cartridge) => cartridge.id === initialCartridgeId);
    if (index >= 0) {
      // Sync the centered card to the object that just cleared the slot.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(index);
    }
  }, [cartridges, initialCartridgeId]);
  const move = useCallback((delta: number) => {
    setSelectedIndex((current) => {
      const next = Math.max(0, Math.min(cartridges.length - 1, current + delta));
      if (next !== current) onPreview(cartridges[next]);
      return next;
    });
  }, [cartridges, onPreview]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
        event.preventDefault();
        onSelect(cartridges[selectedIndex]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartridges, move, onSelect, selectedIndex]);
  const selected = cartridges[selectedIndex];
  return (
    <aside className={`ds-cartridge-library is-${slot}`} aria-label={`${slot === "nds" ? "Nintendo DS" : "Game Boy Advance"} cartridge library`}>
      <header>
        <span>{slot === "nds" ? "SLOT-1" : "SLOT-2"}</span>
        <DsBitmapText>{slot === "nds" ? "DS LIBRARY" : "GBA LIBRARY"}</DsBitmapText>
      </header>
      <p>SELECT A CARTRIDGE TO INSERT</p>
      <div
        className="ds-cartridge-library-carousel"
        role="listbox"
        aria-label="Available cartridges"
        onWheel={(event) => { event.preventDefault(); move(event.deltaY > 0 ? 1 : -1); }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          carouselGesture.current = { pointerId: event.pointerId, startX: event.clientX, dragged: false };
        }}
        onPointerMove={(event) => {
          const gesture = carouselGesture.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          const delta = event.clientX - gesture.startX;
          if (Math.abs(delta) <= 6) return;
          gesture.dragged = true;
          move(delta < 0 ? 1 : -1);
          gesture.startX = event.clientX;
        }}
        onPointerUp={(event) => {
          const gesture = carouselGesture.current;
          if (gesture?.pointerId === event.pointerId && gesture.dragged) {
            suppressCardClick.current = true;
            window.setTimeout(() => { suppressCardClick.current = false; }, 0);
          }
          carouselGesture.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { carouselGesture.current = null; }}
      >
        {cartridges.map((cartridge, index) => (
          <button
            key={cartridge.id}
            type="button"
            className={`ds-cartridge-library-card ${index === selectedIndex ? "is-selected" : ""}`}
            role="option"
            aria-selected={index === selectedIndex}
            style={{
              background: cartridge.label.background,
              color: cartridge.label.foreground,
              borderColor: cartridge.label.accent,
              transform: `translateX(${(index - selectedIndex) * 112}px) rotateY(${(index - selectedIndex) * -12}deg) scale(${index === selectedIndex ? 1 : 0.84})`,
            }}
            onClick={() => {
              if (suppressCardClick.current) return;
              onPreview(cartridge);
              setSelectedIndex(index);
              if (index === selectedIndex) onSelect(cartridge);
            }}
          >
            <i style={{ background: cartridge.label.accent }} aria-hidden="true" />
            <strong>{cartridge.shortTitle}</strong>
            <small>{cartridge.description}</small>
          </button>
        ))}
      </div>
      <div className="ds-cartridge-library-selection" aria-live="polite">
        <strong>{selected.shortTitle}</strong><span>{selected.description}</span>
      </div>
      <div className="ds-cartridge-library-actions">
        <button type="button" onClick={() => move(-1)} disabled={selectedIndex === 0}>PREVIOUS</button>
        <button type="button" className="is-insert" onClick={() => onSelect(selected)}>INSERT</button>
        <button type="button" onClick={() => move(1)} disabled={selectedIndex === cartridges.length - 1}>NEXT</button>
      </div>
      <button type="button" className="ds-cartridge-library-cancel" onClick={onCancel}>CANCEL / LEAVE SLOT EMPTY</button>
    </aside>
  );
}

function DsCartridgePromptHit({
  slot,
  anchor,
  onActivate,
}: {
  slot: DsCartridgeKind;
  anchor: PowerSwitchAnchor | null;
  onActivate: (slot: DsCartridgeKind) => void;
}) {
  if (!anchor?.visible) return null;
  return (
    <button
      type="button"
      className={`ds-cartridge-prompt-hit is-${slot}`}
      style={{ left: `${anchor.x}%`, top: `${anchor.y}%` }}
      aria-label={`Eject ${slot === "nds" ? "Nintendo DS" : "Game Boy Advance"} cartridge`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onActivate(slot);
      }}
    >
      <span className="sr-only">Eject {slot === "nds" ? "Nintendo DS" : "Game Boy Advance"} cartridge</span>
    </button>
  );
}

function DsStylusPromptHit({
  anchor,
  present,
  onActivate,
}: {
  anchor: PowerSwitchAnchor | null;
  present: boolean;
  onActivate: () => void;
}) {
  const style: CSSProperties = anchor?.visible
    ? { left: `${anchor.x}%`, top: `${anchor.y}%` }
    : { right: "8%", top: "42%" };
  return (
    <button
      type="button"
      className="ds-stylus-prompt-hit"
      style={style}
      aria-label={present ? "Remove DS Lite stylus" : "Reinsert DS Lite stylus"}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onActivate(); }}
    >
      <span className="sr-only">{present ? "Remove" : "Reinsert"} DS Lite stylus</span>
    </button>
  );
}

function Ds3dScreen({
  anchor,
  label,
  className,
  children,
  onPointerDown,
  onPointerUp,
  onWheel,
}: {
  anchor: ProjectedBounds | null;
  label: string;
  className: string;
  children: ReactNode;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  onWheel?: React.WheelEventHandler<HTMLDivElement>;
}) {
  if (!anchor?.visible || anchor.width <= 0 || anchor.height <= 0) return null;
  const style: CSSProperties = {
    left: `${anchor.left}%`,
    top: `${anchor.top}%`,
    width: `${anchor.width}%`,
    height: `${anchor.height}%`,
  };
  return (
    <div className={`ds-3d-screen ${className}`} style={style} role="region" aria-label={label} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onWheel={onWheel}>
      <div className="ds-screen-canvas">{children}</div>
    </div>
  );
}

function Ds3dHardwareControls({
  phase,
  deckAnchor,
  powerAnchor,
  pressedControl,
  powerButtonRef,
  onPress,
  onRelease,
  onPowerFlick,
  onPowerPress,
  onPowerRelease,
  volume,
  onVolumeChange,
  pointerEnabled = true,
}: {
  phase: DsFirmwarePhase;
  deckAnchor: ProjectedBounds | null;
  powerAnchor: PowerSwitchAnchor | null;
  pressedControl: DsControlId | null;
  powerButtonRef: MutableRefObject<HTMLButtonElement | null>;
  onPress: (control: DsControlId) => void;
  onRelease: (control: DsControlId) => void;
  onPowerFlick: () => void;
  onPowerPress: () => void;
  onPowerRelease: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  pointerEnabled?: boolean;
}) {
  const deck = deckAnchor?.visible && deckAnchor.width > 0 && deckAnchor.height > 0
    ? deckAnchor
    : { left: 17, top: 32, width: 66, height: 54, visible: true };
  const rect = (left: number, top: number, width: number, height: number): CSSProperties => ({
    left: `${deck.left + deck.width * left}%`,
    top: `${deck.top + deck.height * top}%`,
    width: `${deck.width * width}%`,
    height: `${deck.height * height}%`,
  });
  const powerStyle: CSSProperties = powerAnchor?.visible
    ? { left: `${powerAnchor.x - 3.5}%`, top: `${powerAnchor.y - 4.5}%`, width: "max(44px, 9%)", height: "max(44px, 12%)" }
    : rect(0.83, 0.12, 0.13, 0.14);

  const button = (control: DsControlId, label: string, style: CSSProperties, className: string) => (
    <button
      type="button"
      className={`ds-3d-control-hit ${className} ${pressedControl === control ? "is-depressed" : ""}`}
      style={style}
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(control);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        onRelease(control);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => onRelease(control)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) onPress(control);
        }
      }}
      onKeyUp={() => onRelease(control)}
    >
      <span className="sr-only">{label}</span>
    </button>
  );

  return (
    <div className={`ds-3d-controls ${pointerEnabled ? "" : "is-mesh-primary"}`} aria-label="Nintendo DS hardware controls">
      <DsPowerHardwareButton
        phase={phase}
        pressed={pressedControl === "power"}
        powerButtonRef={powerButtonRef}
        onFlick={onPowerFlick}
        onPress={onPowerPress}
        onRelease={onPowerRelease}
        className="ds-3d-power-button"
        style={powerStyle}
      />
      {button("dpad-up", "D-pad up", rect(0.11, 0.47, 0.12, 0.13), "ds-3d-dpad-up")}
      {button("dpad-left", "D-pad left", rect(0.04, 0.56, 0.12, 0.13), "ds-3d-dpad-left")}
      {button("dpad-right", "D-pad right", rect(0.18, 0.56, 0.12, 0.13), "ds-3d-dpad-right")}
      {button("dpad-down", "D-pad down", rect(0.11, 0.65, 0.12, 0.13), "ds-3d-dpad-down")}
      {button("y", "Y button", rect(0.73, 0.47, 0.11, 0.13), "ds-3d-button-y")}
      {button("x", "X button", rect(0.66, 0.56, 0.11, 0.13), "ds-3d-button-x")}
      {button("b", "B button", rect(0.73, 0.65, 0.11, 0.13), "ds-3d-button-b")}
      {button("a", "A button", rect(0.81, 0.56, 0.11, 0.13), "ds-3d-button-a")}
      {button("select", "SELECT button", rect(0.40, 0.81, 0.09, 0.08), "ds-3d-select")}
      {button("start", "START button", rect(0.51, 0.81, 0.09, 0.08), "ds-3d-start")}
      {button("l", "L shoulder button", rect(0.04, -0.04, 0.14, 0.1), "ds-3d-shoulder-left")}
      {button("r", "R shoulder button", rect(0.82, -0.04, 0.14, 0.1), "ds-3d-shoulder-right")}
      <label className={`ds-3d-volume ${pressedControl === "volume" ? "is-depressed" : ""}`} style={rect(0.015, 0.30, 0.08, 0.29)}>
        <span className="sr-only">Volume</span>
        <input
          aria-label="Hardware volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            onPress("volume");
          }}
          onPointerUp={() => onRelease("volume")}
          onPointerCancel={() => onRelease("volume")}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

function DsTopContent({ phase, clock, reducedMotion }: { phase: DsFirmwarePhase; clock: Date; reducedMotion: boolean }) {
  if (phase === "off" || phase === "powering-off") return <div className="ds-black-screen" />;
  if (phase === "powering-on" || phase === "boot-logo") return <DsBootAnimation kind="splash" reducedMotion={reducedMotion} />;
  if (phase === "health-warning" || phase === "touch-prompt") return <DsBootAnimation kind="splash" reducedMotion={reducedMotion} staticFrame={110} />;
  if (phase === "home" || phase === "download-play") {
    return (
      <div className="ds-home-top">
        <img className="ds-raster-fill" src="/assets/ds/menu/top.png" alt="" aria-hidden="true" />
        <DsNativeClockCalendar clock={clock} />
        <div className="ds-home-owner"><DsBitmapText>{phase === "download-play" ? "USER" : "FLICK"}</DsBitmapText></div>
      </div>
    );
  }
  return (
    <div className="ds-subscreen-top">
      <img className="ds-raster-fill" src="/assets/ds/menu/top.png" alt="" aria-hidden="true" />
      <DsNativeClockCalendar clock={clock} />
      <DsBitmapText className="ds-subscreen-title">
        {phase === "pictochat" ? "PICTOCHAT" : phase === "settings" ? "SETTINGS" : "CARTRIDGE"}
      </DsBitmapText>
    </div>
  );
}

function DsBootAnimation({ kind, reducedMotion, staticFrame }: { kind: "splash" | "health"; reducedMotion: boolean; staticFrame?: number }) {
  const [frame, setFrame] = useState(0);
  const delays = kind === "splash" ? SPLASH_DELAYS : HEALTH_DELAYS;
  const frameCount = kind === "splash" ? 111 : HEALTH_DELAYS.length;
  const total = delays.reduce((sum, value) => sum + value, 0) || (kind === "splash" ? BOOT_LOGO_MS : HEALTH_MS);
  useEffect(() => {
    if (staticFrame !== undefined) {
      // The lower screen holds its first warning frame during the logo, while the upper screen holds the final logo during the warning prompt.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFrame(staticFrame);
      return;
    }
    if (reducedMotion) {
      // Reduced motion shows the authentic terminal frame without travelling through intermediate frames.
      setFrame(frameCount - 1);
      return;
    }
    let raf = 0;
    const started = now();
    const tick = (time: number) => {
      const elapsed = Math.min(total - 1, time - started);
      let cursor = 0;
      let nextFrame = 0;
      for (let index = 0; index < frameCount; index += 1) {
        cursor += delays[index] ?? 20;
        if (elapsed < cursor) {
          nextFrame = index;
          break;
        }
        nextFrame = index;
      }
      setFrame(nextFrame);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [delays, frameCount, reducedMotion, staticFrame, total]);
  const columns = 8;
  const rows = kind === "splash" ? 14 : 5;
  const col = frame % columns;
  const row = Math.floor(frame / columns);
  return (
    <div
      className="ds-boot-atlas"
      role="img"
      aria-label={kind === "splash" ? "Nintendo DS startup animation" : "Nintendo DS health and safety warning"}
      style={{
        backgroundImage: `url(/assets/ds/firmware/${kind === "splash" ? "splash" : "health"}-atlas.png)`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${(col / (columns - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
      }}
    />
  );
}

function DsBottomContent({
  phase,
  selectedTile,
  selectedTileButton,
  cursor,
  reducedMotion,
  pressedTile,
  tileAway,
  transitionFrame,
  installedNdsCartridge = null,
  installedGbaCartridge = null,
  launchedCartridgeSlot = "nds",
  runtime,
  onSelect,
  onLaunch,
  onContinue,
  onMenuPress,
  onMenuAway,
  onMenuRelease,
  muted,
  volume,
  onMutedChange,
  onVolumeChange,
  downloadSelection,
  onDownloadSelect,
  onBack,
}: {
  phase: DsFirmwarePhase;
  selectedTile: number;
  selectedTileButton: MutableRefObject<HTMLButtonElement | null>;
  cursor: { x: number; y: number; width: number; height: number };
  reducedMotion: boolean;
  pressedTile: DsMenuTileId | null;
  tileAway: boolean;
  transitionFrame: number;
  installedNdsCartridge?: DsCartridge | null;
  installedGbaCartridge?: DsCartridge | null;
  launchedCartridgeSlot?: DsCartridgeKind;
  runtime?: SkyEmuRuntime;
  onSelect: (index: number) => void;
  onLaunch: () => void;
  onContinue: () => void;
  onMenuPress: (tile: DsMenuTileId, pointerId?: number) => void;
  onMenuAway: (away: boolean) => void;
  onMenuRelease: (tile: DsMenuTileId, index: number, cancelled: boolean) => void;
  muted: boolean;
  volume: number;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  downloadSelection: number;
  onDownloadSelect: (index: number) => void;
  onBack: () => void;
}) {
  if (phase === "off" || phase === "powering-off") return <div className="ds-black-screen" />;
  if (phase === "powering-on" || phase === "boot-logo") return <DsBootAnimation kind="health" reducedMotion={reducedMotion} staticFrame={0} />;
  if (phase === "health-warning") return <DsBootAnimation kind="health" reducedMotion={reducedMotion} />;
  if (phase === "touch-prompt") {
    return (
      <div className="ds-touch-screen-prompt">
        <DsBootAnimation kind="health" reducedMotion={reducedMotion} staticFrame={37} />
        <button type="button" className="ds-touch-prompt-hit" onClick={onContinue} aria-label="Touch the touch screen to continue">
          <span className="sr-only">Touch the touch screen to continue</span>
        </button>
      </div>
    );
  }
  if (phase === "pictochat") return <DsPictoChat onBack={onBack} />;
  if (phase === "download-play") {
    return <DsDownloadPlay selectedHost={downloadSelection} onSelect={onDownloadSelect} onBack={onBack} />;
  }
  if (phase === "settings") return <DsSettings muted={muted} volume={volume} onMutedChange={onMutedChange} onVolumeChange={onVolumeChange} onBack={onBack} />;
  if (phase === "cartridge-placeholder") {
    const cartridge = launchedCartridgeSlot === "gba" ? installedGbaCartridge : installedNdsCartridge;
    return <DsCartridgePlaceholder cartridge={cartridge} onBack={onBack} runtime={runtime} />;
  }

  return (
    <div className="ds-home-bottom">
      <img className="ds-raster-fill" src="/assets/ds/menu/bottom.png?v=firmware-menu-1" alt="Nintendo DS home menu" />
      <div className={`ds-cartridge-menu-panel ${installedNdsCartridge ? "is-inserted" : "is-empty"}`} aria-hidden="true">
        {installedNdsCartridge && <i className="ds-cartridge-menu-mark" style={{ background: installedNdsCartridge.label.accent }} />}
        <div className="ds-cartridge-menu-copy">
          <DsBitmapText>{installedNdsCartridge?.shortTitle ?? "NO DS CARD"}</DsBitmapText>
          <span>{installedNdsCartridge ? "NINTENDO DS CARTRIDGE" : "SLOT-1 EMPTY"}</span>
        </div>
      </div>
      <div className={`ds-gba-menu-panel ${installedGbaCartridge ? "is-inserted" : "is-empty"}`} aria-hidden="true">
        <i style={{ background: installedGbaCartridge?.label.accent ?? "#5f6266" }} />
        <div>
          <DsBitmapText>{installedGbaCartridge?.shortTitle ?? "NO GBA CARD"}</DsBitmapText>
          <span>{installedGbaCartridge ? "GAME BOY ADVANCE" : "SLOT-2 EMPTY"}</span>
        </div>
      </div>
      <div className="ds-menu-hotspots" role="listbox" aria-label="Nintendo DS applications">
        {DS_MENU_TILES.map((tile, index) => {
          const hitbox = MENU_HITBOXES[tile];
          const selected = index === selectedTile;
          const pressed = pressedTile === tile && !tileAway;
          const style = {
            left: `${(hitbox.x / 256) * 100}%`,
            top: `${(hitbox.y / 192) * 100}%`,
            width: `${(hitbox.width / 256) * 100}%`,
            height: `${(hitbox.height / 192) * 100}%`,
          };
          return (
            <button
              key={tile}
              ref={selected ? selectedTileButton : undefined}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={dynamicTileLabel(tile, installedNdsCartridge, installedGbaCartridge)}
              className={`ds-menu-hotspot ds-menu-hotspot-${tile} ${selected ? "is-selected" : ""} ${pressed ? "is-pressed" : ""}`}
              style={style}
              onFocus={() => onSelect(index)}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                onMenuPress(tile, event.pointerId);
                onSelect(index);
              }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const away = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
                onMenuAway(away);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                onMenuRelease(tile, index, tileAway);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => onMenuRelease(tile, index, true)}
              onClick={(event) => {
                event.preventDefault();
                if (event.detail === 0 && selected) onLaunch();
              }}
              onMouseEnter={() => onSelect(index)}
            >
              <span className="sr-only">{dynamicTileLabel(tile, installedNdsCartridge, installedGbaCartridge)}</span>
            </button>
          );
        })}
      </div>
      <div
        className="ds-menu-cursor"
        aria-hidden="true"
        style={{
          left: `${(cursor.x / 256) * 100}%`,
          top: `${(cursor.y / 192) * 100}%`,
          width: `${(cursor.width / 256) * 100}%`,
          height: `${(cursor.height / 192) * 100}%`,
          ...(transitionFrame < SELECT_FADE_FRAMES && phase === "menu-transition" ? { transform: `translateY(-${Math.min(6, transitionFrame)}px)` } : {}),
        }}
      />
      <div className="ds-selection-announce" aria-live="polite">{dynamicTileLabel(DS_MENU_TILES[selectedTile], installedNdsCartridge, installedGbaCartridge)}</div>
    </div>
  );
}

function DsPictoChat({ onBack }: { onBack: () => void }) {
  const [message, setMessage] = useState("");
  return (
    <div className="ds-pictochat-screen">
      <img className="ds-pictochat-tools" src="/assets/ds/pictochat/tools.png" alt="Original PictoChat tool palette" />
      <div className="ds-pictochat-header"><DsBitmapText>PICTOCHAT</DsBitmapText></div>
      <DsBitmapText className="ds-pictochat-placeholder-label">PLACEHOLDER MODE</DsBitmapText>
      <div className="ds-pictochat-canvas" aria-label="PictoChat drawing area" />
      <label className="ds-pictochat-input">
        <span className="sr-only">PictoChat message</span>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="TYPE A MESSAGE" />
      </label>
      <button type="button" className="ds-subscreen-back" onClick={onBack}>B / BACK</button>
    </div>
  );
}

function DsDownloadPlay({
  selectedHost,
  onSelect,
  onBack,
}: {
  selectedHost: number;
  onSelect: (index: number) => void;
  onBack: () => void;
}) {
  const [searching, setSearching] = useState(true);
  const [wirelessFrame, setWirelessFrame] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearching(false), 2_200);
    const interval = window.setInterval(() => setWirelessFrame((frame) => (frame + 1) % 2), 150);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);
  if (searching) {
    return (
      <div className="ds-download-screen">
        <img className="ds-download-status" src="/assets/ds/download-play/status.png" alt="Original DS Download Play status graphics" />
        <img className="ds-wireless-icons" src="/assets/ds/menu/sprites/wirelessicons.png" style={{ objectPosition: `center ${wirelessFrame ? "bottom" : "top"}` }} alt="Wireless play status" />
        <DsBitmapText className="ds-download-copy">SEARCHING FOR A HOST</DsBitmapText>
        <DsBitmapText className="ds-download-placeholder-label">PLACEHOLDER HOST SEARCH</DsBitmapText>
        <button type="button" className="ds-subscreen-back" onClick={onBack}>B / BACK</button>
      </div>
    );
  }

  return (
    <div className="ds-download-menu">
      <img className="ds-download-menu-reference" src="/assets/ds/download-play/menu-reference-clean.png" alt="Nintendo DS Download Play host list" />
      <div className="ds-download-host-list" role="listbox" aria-label="Available Download Play hosts">
        {DOWNLOAD_HOSTS.map((host, index) => (
          <button
            key={host.title}
            type="button"
            role="option"
            aria-selected={selectedHost === index}
            aria-label={`${host.title}, ${host.status}, ${host.players}`}
            className={`ds-download-host-hit ${selectedHost === index ? "is-selected" : ""}`}
            onFocus={() => onSelect(index)}
            onMouseEnter={() => onSelect(index)}
            onClick={() => {
              onSelect(index);
              getAudio().play("ds-confirm");
            }}
          />
        ))}
      </div>
      <div
        className="ds-download-menu-cursor"
        aria-hidden="true"
        style={{ top: `${24 + selectedHost * 18}%` }}
      />
      <div className="ds-selection-announce" aria-live="polite">
        {DOWNLOAD_HOSTS[selectedHost]?.title ?? DOWNLOAD_HOSTS[0].title}
      </div>
      <button type="button" className="ds-subscreen-back ds-download-quit" onClick={onBack}>B / QUIT</button>
    </div>
  );
}

function DsSettings({ muted, volume, onMutedChange, onVolumeChange, onBack }: { muted: boolean; volume: number; onMutedChange: (muted: boolean) => void; onVolumeChange: (volume: number) => void; onBack: () => void }) {
  return (
    <div className="ds-settings-screen">
      <img className="ds-raster-fill" src="/assets/ds/settings/menu.png" alt="Original Nintendo DS settings menu" />
      <div className="ds-settings-controls">
        <DsBitmapText>SOUND SETTINGS</DsBitmapText>
        <label><span>VOLUME</span><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} /></label>
        <button type="button" aria-pressed={muted} onClick={() => onMutedChange(!muted)}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
      </div>
      <button type="button" className="ds-subscreen-back" onClick={onBack}>B / BACK</button>
    </div>
  );
}

function dynamicTileLabel(tile: DsMenuTileId, nds: DsCartridge | null, gba: DsCartridge | null): string {
  if (tile === "cartridge") return nds ? `${nds.title}, Nintendo DS cartridge` : "Nintendo DS cartridge slot empty";
  if (tile === "gba") return gba ? `${gba.title}, Game Boy Advance cartridge` : "Game Boy Advance cartridge slot empty";
  return tileLabel(tile);
}

const CARTRIDGE_APP_COPY: Record<string, { eyebrow: string; headline: string; body: string }> = {
  portfolio: {
    eyebrow: "PORTFOLIO OS",
    headline: "FLICK OWENS",
    body: "Selected work, experiments, and contact paths from the studio portfolio.",
  },
  "advance-portfolio": {
    eyebrow: "ADVANCE PORTFOLIO",
    headline: "FLICK ADVANCE",
    body: "A focused upper-screen edition of the studio portfolio for the Slot-2 cartridge.",
  },
  "cartridge-placeholder": {
    eyebrow: "PORTFOLIO OS",
    headline: "FLICK OWENS",
    body: "A cartridge-sized home for selected work, experiments, and contact paths.",
  },
  "project-archive": {
    eyebrow: "PROJECT INDEX",
    headline: "ARCHIVE DS",
    body: "Selected identities, digital products, and systems—organized for the next playable build.",
  },
  "field-notes": {
    eyebrow: "STUDIO LOG",
    headline: "FIELD NOTES",
    body: "Sketches, process fragments, and interface studies from behind the finished work.",
  },
  "gba-placeholder": {
    eyebrow: "ADVANCE MODE",
    headline: "FLICK ADVANCE",
    body: "A compact Slot-2 experience with its own future application entry point.",
  },
  "color-lab": {
    eyebrow: "PLAYABLE PALETTE",
    headline: "COLOR LAB",
    body: "A small material and color experiment prepared for an interactive cartridge app.",
  },
  soundboard: {
    eyebrow: "8-BIT AUDIO",
    headline: "SOUNDBOARD",
    body: "A cartridge-specific sound toy ready for samples, sequencing, and button mappings.",
  },
};

function DsCartridgePlaceholder({ cartridge, onBack, runtime }: { cartridge: DsCartridge | null; onBack: () => void; runtime?: SkyEmuRuntime }) {
  const copy = cartridge ? CARTRIDGE_APP_COPY[cartridge.appId] ?? CARTRIDGE_APP_COPY["cartridge-placeholder"] : null;
  return (
    <div
      className={`ds-cartridge-screen ${cartridge ? `is-${cartridge.kind}` : "is-empty"}`}
      style={cartridge ? { backgroundColor: cartridge.label.background, color: cartridge.label.foreground } : undefined}
    >
      <div className="ds-cartridge-app-mark" style={{ background: cartridge?.label.accent ?? "#6b6d70" }} aria-hidden="true" />
      <DsBitmapText className="ds-cartridge-title">{copy?.headline ?? "EMPTY SLOT"}</DsBitmapText>
      <p>{copy?.eyebrow ?? "NO CARTRIDGE INSERTED"}</p>
      <strong>{cartridge?.kind === "gba" ? "SLOT-2 APP" : "SLOT-1 APP"}</strong>
      <span>{copy?.body ?? "POWER OFF AND USE THE CARTRIDGE SERVICE DOT TO INSERT A GAME."}</span>
      {runtime?.status === "ready" && (
        <div className="ds-runtime-save-actions">
          <button type="button" onClick={runtime.exportState}>EXPORT STATE</button>
          <label>
            IMPORT STATE
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.arrayBuffer().then(runtime.importState);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      )}
      {runtime?.stateError && <small className="ds-runtime-save-error" role="alert">{runtime.stateError}</small>}
      <button type="button" className="ds-subscreen-back" onClick={onBack}>B / BACK</button>
    </div>
  );
}

function DsHardwareControls({
  phase,
  pressedControl,
  powerButtonRef,
  onPress,
  onRelease,
  onPowerFlick,
  onPowerPress,
  onPowerRelease,
  volume,
  onVolumeChange,
}: {
  phase: DsFirmwarePhase;
  pressedControl: DsControlId | null;
  powerButtonRef: MutableRefObject<HTMLButtonElement | null>;
  onPress: (control: DsControlId) => void;
  onRelease: (control: DsControlId) => void;
  onPowerFlick: () => void;
  onPowerPress: () => void;
  onPowerRelease: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}) {
  const button = (control: DsControlId, label: string, className: string) => (
    <button
      type="button"
      ref={control === "power" ? powerButtonRef : undefined}
      className={`ds-hardware-button ${className} ${pressedControl === control ? "is-depressed" : ""}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(control);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        onRelease(control);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => onRelease(control)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) onPress(control);
        }
      }}
      onKeyUp={() => onRelease(control)}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );

  return (
    <div className="ds-controls" aria-label="Nintendo DS hardware controls">
      <DsPowerHardwareButton
        phase={phase}
        pressed={pressedControl === "power"}
        powerButtonRef={powerButtonRef}
        onFlick={onPowerFlick}
        onPress={onPowerPress}
        onRelease={onPowerRelease}
      />
      <div className="ds-dpad" aria-label="Directional pad">
        {button("dpad-up", "Up", "ds-dpad-up")}
        {button("dpad-left", "Left", "ds-dpad-left")}
        <span className="ds-dpad-center" aria-hidden="true" />
        {button("dpad-right", "Right", "ds-dpad-right")}
        {button("dpad-down", "Down", "ds-dpad-down")}
      </div>
      <div className="ds-action-buttons" aria-label="Action buttons">
        {button("y", "Y", "ds-button-y")}
        {button("x", "X", "ds-button-x")}
        {button("b", "B", "ds-button-b")}
        {button("a", "A", "ds-button-a")}
      </div>
      <div className="ds-system-buttons">
        {button("select", "SELECT", "ds-select-button")}
        {button("start", "START", "ds-start-button")}
      </div>
      {button("l", "L", "ds-shoulder ds-shoulder-left")}
      {button("r", "R", "ds-shoulder ds-shoulder-right")}
      <label className={`ds-volume-slider ${pressedControl === "volume" ? "is-depressed" : ""}`}>
        <span className="sr-only">Volume</span>
        <input
          aria-label="Hardware volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onPress("volume");
          }}
          onPointerUp={() => onRelease("volume")}
          onPointerCancel={() => onRelease("volume")}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </label>
      <span className={`ds-control-status ${phase === "off" ? "is-off" : ""}`} aria-hidden="true">{phase === "off" ? "POWER" : "READY"}</span>
    </div>
  );
}

function DsPowerHardwareButton({
  phase,
  pressed,
  powerButtonRef,
  onFlick,
  onPress,
  onRelease,
  className = "",
  style,
}: {
  phase: DsFirmwarePhase;
  pressed: boolean;
  powerButtonRef: MutableRefObject<HTMLButtonElement | null>;
  onFlick: () => void;
  onPress: () => void;
  onRelease: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const startY = useRef<number | null>(null);
  const fired = useRef(false);
  const [flicking, setFlicking] = useState(false);

  const triggerFlick = () => {
    setFlicking(true);
    window.setTimeout(() => setFlicking(false), 220);
    onFlick();
  };

  return (
    <button
      type="button"
      ref={powerButtonRef}
      className={`ds-hardware-button ds-power-button ${className} ${pressed ? "is-depressed" : ""} ${flicking ? "is-flicking" : ""}`}
      style={style}
      aria-label={phase === "off" ? "Slide POWER up to turn on the Nintendo DS Lite" : "Slide POWER up to turn off the Nintendo DS Lite"}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        startY.current = event.clientY;
        fired.current = false;
        onPress();
      }}
      onPointerMove={(event) => {
        if (fired.current || startY.current === null || startY.current - event.clientY < 14) return;
        fired.current = true;
        startY.current = null;
        onRelease();
        triggerFlick();
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const origin = startY.current;
        startY.current = null;
        onRelease();
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (!fired.current && origin !== null && origin - event.clientY >= 14) {
          fired.current = true;
          triggerFlick();
        }
      }}
      onPointerCancel={() => {
        startY.current = null;
        fired.current = false;
        onRelease();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) triggerFlick();
        }
      }}
    >
      <span aria-hidden="true">POWER</span>
    </button>
  );
}
