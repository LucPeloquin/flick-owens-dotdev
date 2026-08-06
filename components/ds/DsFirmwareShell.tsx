"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { getAudio } from "@/lib/audio/engine";
import type { SfxName } from "@/lib/audio/sounds";
import {
  DS_MENU_TILES,
  initialDsFirmwareState,
  reduceDsFirmware,
  selectedDsTile,
  tileLabel,
  type DsControlId,
  type DsFirmwarePhase,
  type DsMenuTileId,
} from "@/lib/ds/firmware";
import { dsDirectionalControlForKey } from "@/lib/ds/navigation";
import { formatDsDate, formatDsTime } from "@/lib/ds/clock";
import { DsBitmapText } from "./DsBitmapText";
import { DsScreen } from "./DsScreen";

const MUTE_KEY = "ds-firmware-muted";
const VOLUME_KEY = "ds-firmware-volume";
const BOOT_SEEN_KEY = "ds-firmware-boot-seen";
const POWER_HOLD_MS = 700;
const BOOT_LOGO_MS = 2_220;
const HEALTH_MS = 1_160;
const SELECT_FADE_FRAMES = 25;
const MENU_FADE_FRAMES = 31;
const FRAME_MS = 1000 / 60;
const SPLASH_DELAYS = Array.from({ length: 111 }, () => 20);

const HEALTH_DELAYS = [
  20, 20, 20, 20, 40, 40, 40, 40, 20, 20, 20, 20, 20, 40, 40, 40, 40, 40, 40,
  20, 40, 40, 40, 40, 40, 40, 20, 20, 20, 20, 20, 40, 40, 40, 40, 40, 20, 20, 20,
];

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

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function DsFirmwareShell() {
  const [state, dispatch] = useReducer(reduceDsFirmware, initialDsFirmwareState);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [hydrated, setHydrated] = useState(false);
  const [transitionFrame, setTransitionFrame] = useState(0);
  const [pressedControl, setPressedControl] = useState<PressedControl>(null);
  const [pressedTile, setPressedTile] = useState<DsMenuTileId | null>(null);
  const [downloadSelection, setDownloadSelection] = useState(0);
  const [tileAway, setTileAway] = useState(false);
  const [cursor, setCursor] = useState(() => CURSOR_TARGETS[DS_MENU_TILES[0]]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const powerButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedTileButton = useRef<HTMLButtonElement | null>(null);
  const powerHoldTimer = useRef<number | null>(null);
  const powerHoldTriggered = useRef(false);
  const tileAwayRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const phase = state.phase;

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

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
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const play = useCallback((name: SfxName) => getAudio().play(name), []);

  const completeTransition = useCallback((startTime: number) => {
    if (state.transition?.startTime !== startTime) return;
    if (state.transition.source === "touch-prompt") window.sessionStorage.setItem(BOOT_SEEN_KEY, "true");
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
        dispatch({ type: "power-off-complete", startTime: transitionStart });
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
    if (phase === "off") powerButtonRef.current?.focus({ preventScroll: true });
    if (phase === "home") selectedTileButton.current?.focus({ preventScroll: true });
  }, [phase, state.selectedTile]);

  const powerOn = useCallback(() => {
    const audio = getAudio();
    audio.unlock();
    audio.setMuted(state.muted);
    audio.setVolume(state.volume);
    const seen = window.sessionStorage.getItem(BOOT_SEEN_KEY) === "true";
    dispatch({ type: "power-on", skipBoot: seen || reducedMotionRef.current, now: now() });
  }, [state.muted, state.volume]);

  const beginPowerPress = useCallback(() => {
    if (phase === "off") {
      powerOn();
      return;
    }
    if (phase === "powering-off" || powerHoldTimer.current !== null) return;
    powerHoldTriggered.current = false;
    powerHoldTimer.current = window.setTimeout(() => {
      powerHoldTriggered.current = true;
      play("ds-shutdown");
      dispatch({ type: "power-off-start", now: now() });
    }, POWER_HOLD_MS);
  }, [phase, play, powerOn]);

  const endPowerPress = useCallback(() => {
    if (powerHoldTimer.current !== null) {
      window.clearTimeout(powerHoldTimer.current);
      powerHoldTimer.current = null;
    }
  }, []);

  useEffect(() => () => endPowerPress(), [endPowerPress]);

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
    if (tile === "gba" || tile === "alarm") {
      play("ds-invalid");
      return;
    }
    play("ds-confirm");
    dispatch({ type: "launch", now: now() });
  }, [phase, play, state]);

  const goBack = useCallback(() => {
    if (!["pictochat", "download-play", "settings", "cartridge-placeholder"].includes(phase)) return;
    play("ds-select");
    dispatch({ type: "back", now: now() });
  }, [phase, play]);

  const pressControl = useCallback((control: DsControlId) => {
    setPressedControl({ control, pointerId: null });
    if (control === "power") {
      beginPowerPress();
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
  }, [activateSelected, beginPowerPress, goBack, moveDownloadSelection, moveSelection, phase, play]);

  const releaseControl = useCallback((control: DsControlId) => {
    if (control === "power") endPowerPress();
    setPressedControl((current) => (current?.control === control ? null : current));
  }, [endPowerPress]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      const key = event.key;
      const normalized = key.toLowerCase();
      if (target?.closest(".ds-hardware-button, .ds-menu-hotspot") && (key === "Enter" || key === " ")) return;
      if (normalized === "p") {
        event.preventDefault();
        if (!event.repeat) pressControl("power");
        return;
      }
      if (phase === "off") return;
      if (event.repeat && ["Enter", " ", "Escape", "a", "b", "x", "y", "q", "e", "1", "2"].includes(normalized)) return;
      if (key === "ArrowLeft" || key === "ArrowUp") {
        event.preventDefault();
        pressControl("dpad-left");
        return;
      }
      if (key === "ArrowRight" || key === "ArrowDown") {
        event.preventDefault();
        pressControl("dpad-right");
        return;
      }
      if (normalized === "a" || key === "Enter" || key === " ") {
        event.preventDefault();
        pressControl("a");
        return;
      }
      if (normalized === "b" || key === "Escape") {
        event.preventDefault();
        pressControl("b");
        return;
      }
      if (normalized === "x") { event.preventDefault(); pressControl("x"); }
      if (normalized === "y") { event.preventDefault(); pressControl("y"); }
      if (normalized === "q") { event.preventDefault(); pressControl("l"); }
      if (normalized === "e") { event.preventDefault(); pressControl("r"); }
      if (key === "1") { event.preventDefault(); pressControl("select"); }
      if (key === "2") { event.preventDefault(); pressControl("start"); }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (target?.closest(".ds-hardware-button, .ds-menu-hotspot") && (event.key === "Enter" || event.key === " ")) return;
      const normalized = event.key.toLowerCase();
      const directional = dsDirectionalControlForKey(event.key);
      const control: DsControlId | null = normalized === "p" ? "power" : normalized === "a" || event.key === "Enter" || event.key === " " ? "a" : normalized === "b" || event.key === "Escape" ? "b" : normalized === "x" ? "x" : normalized === "y" ? "y" : normalized === "q" ? "l" : normalized === "e" ? "r" : event.key === "1" ? "select" : event.key === "2" ? "start" : directional;
      if (control) releaseControl(control);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, pressControl, releaseControl]);

  useEffect(() => {
    const onVisibility = () => getAudio().suppressBgm(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const transition = state.transition;
  const visualPhase = useMemo(() => {
    if (phase === "menu-transition" && transition) {
      if (transition.kind === "quick-menu") return transition.destination;
      return transitionFrame >= SELECT_FADE_FRAMES ? transition.destination : transition.source;
    }
    if (phase === "powering-off" && transition) return transition.source;
    return phase;
  }, [phase, transition, transitionFrame]);

  const washOpacity = useMemo(() => {
    if (phase === "powering-off") return reducedMotion ? 1 : Math.min(1, transitionFrame / SELECT_FADE_FRAMES);
    if (phase !== "menu-transition" || !transition) return 0;
    if (transition.kind === "quick-menu") return reducedMotion ? 0 : Math.max(0, 1 - transitionFrame / MENU_FADE_FRAMES);
    if (transitionFrame <= SELECT_FADE_FRAMES) return transitionFrame / SELECT_FADE_FRAMES;
    return Math.max(0, 1 - (transitionFrame - SELECT_FADE_FRAMES) / MENU_FADE_FRAMES);
  }, [phase, reducedMotion, transition, transitionFrame]);

  const onScreenPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input")) return;
    touchStart.current = { x: event.clientX, y: event.clientY };
    if (visualPhase === "touch-prompt") {
      dispatch({ type: "touch", now: now() });
      play("ds-select");
    }
  };

  const onScreenPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    <main className="ds-page ds-page-overlay">
      <header className="ds-page-header">
        <DsBitmapText>FLICK OWENS / NINTENDO DS</DsBitmapText>
        <span className="ds-header-meta">ORIGINAL NTR-001 FIRMWARE</span>
      </header>

      <div className="ds-console-wrap">
        <section className={consoleClass} aria-label="Original gray Nintendo DS">
          <img
            className="ds-launchbox-overlay"
            src="/assets/ds/overlays/nintendo-ds-overlay-animated-light.webp"
            alt=""
            aria-hidden="true"
          />
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

      <footer className="ds-page-footer">
        <span>{phase === "off" ? "PRESS POWER / HOLD 700 MS TO SHUT DOWN" : "256 × 192 / AUTHENTIC CONTROL SURFACE"}</span>
        <span>© {new Date().getFullYear()} Flick Owens</span>
      </footer>
    </main>
  );
}

function DsTopContent({ phase, clock, reducedMotion }: { phase: DsFirmwarePhase; clock: Date; reducedMotion: boolean }) {
  if (phase === "off" || phase === "powering-off") return <div className="ds-black-screen" />;
  if (phase === "powering-on" || phase === "boot-logo") return <DsBootAnimation kind="splash" reducedMotion={reducedMotion} />;
  if (phase === "health-warning" || phase === "touch-prompt") return <DsBootAnimation kind="splash" reducedMotion={reducedMotion} staticFrame={110} />;
  if (phase === "home" || phase === "download-play") {
    return (
      <div className="ds-home-top">
        <img className="ds-raster-fill" src="/assets/ds/menu/top.png" alt="Nintendo DS calendar and clock" />
        <div className="ds-home-clock" aria-live="polite" aria-label={`${formatDsDate(clock)}, ${formatDsTime(clock)} Pacific Time`}>
          <DsBitmapText>{formatDsTime(clock)}</DsBitmapText>
          <DsBitmapText className="ds-home-date">{formatDsDate(clock)}</DsBitmapText>
        </div>
        <div className="ds-home-owner"><DsBitmapText>{phase === "download-play" ? "USER" : "FLICK"}</DsBitmapText></div>
      </div>
    );
  }
  return (
    <div className="ds-subscreen-top">
      <img className="ds-raster-fill" src="/assets/ds/menu/top.png" alt="Nintendo DS menu chrome" />
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
  if (phase === "cartridge-placeholder") return <DsCartridgePlaceholder onBack={onBack} />;

  return (
    <div className="ds-home-bottom">
      <img className="ds-raster-fill" src="/assets/ds/menu/bottom.png?v=firmware-menu-1" alt="Nintendo DS home menu" />
      <div className="ds-cartridge-menu-panel" aria-hidden="true">
        <img src="/assets/ds/menu/portfolio-cartridge-icon.png" alt="" />
        <div className="ds-cartridge-menu-copy">
          <DsBitmapText>FLICK OWENS DS</DsBitmapText>
          <span>PORTFOLIO CARTRIDGE</span>
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
              aria-label={tileLabel(tile)}
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
              <span className="sr-only">{tileLabel(tile)}</span>
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
      <div className="ds-selection-announce" aria-live="polite">{tileLabel(DS_MENU_TILES[selectedTile])}</div>
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

function DsCartridgePlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <div className="ds-cartridge-screen">
      <img src="/assets/ds/menu/placeholder-icons.png" alt="Empty cartridge slot" className="ds-placeholder-strip" />
      <DsBitmapText className="ds-cartridge-title">FLICK OWENS</DsBitmapText>
      <p>PORTFOLIO CARTRIDGE</p>
      <strong>COMING SOON</strong>
      <span>THE FIRMWARE MENU IS READY.<br />THE CARTRIDGE CONTENT IS NOT INSERTED YET.</span>
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
  volume,
  onVolumeChange,
}: {
  phase: DsFirmwarePhase;
  pressedControl: DsControlId | null;
  powerButtonRef: MutableRefObject<HTMLButtonElement | null>;
  onPress: (control: DsControlId) => void;
  onRelease: (control: DsControlId) => void;
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
      {button("power", "POWER", "ds-power-button")}
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
