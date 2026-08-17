"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { isPowerDragComplete, type DsIntroPhase } from "@/lib/ds/intro";
import type { DsPowerIndicatorColor } from "@/lib/ds/power-indicator";

const DsLiteIntroCanvas = dynamic(
  () => import("./DsLiteIntroCanvas").then((module) => module.DsLiteIntroCanvas),
  { ssr: false, loading: () => null },
);

type DsLiteIntroProps = {
  phase: DsIntroPhase;
  fallbackOpen: boolean;
  reducedMotion: boolean;
  modelReady: boolean;
  onModelReady: () => void;
  onActivate: () => void;
  onAligned: () => void;
  onOpenComplete: () => void;
  onModelError: () => void;
  onPowerSuccess: () => void;
  onSkip: () => void;
  powerIndicatorColor: DsPowerIndicatorColor;
};

export function DsLiteIntro({
  phase,
  fallbackOpen,
  reducedMotion,
  modelReady,
  onModelReady,
  onActivate,
  onAligned,
  onOpenComplete,
  onModelError,
  onPowerSuccess,
  onSkip,
  powerIndicatorColor,
}: DsLiteIntroProps) {
  const [powerSwitchPulse, setPowerSwitchPulse] = useState(0);
  const showCanvas = phase === "inspecting" || phase === "aligning" || phase === "opening" || phase === "power-prompt" || phase === "handoff";
  const showPower = phase === "power-prompt" || (phase === "fallback" && fallbackOpen);
  const openArt = fallbackOpen || phase === "opening" || phase === "power-prompt" || phase === "handoff";
  // Do not paint the legacy CSS shell while the real GLB is loading. It used
  // to flash on every first visit before the WebGL canvas became ready. The
  // 2D shell remains available only for the explicit model/WebGL fallback.
  const showFallbackArt = phase === "fallback";

  return (
    <section
      className={`ds-lite-intro ${phase === "complete" ? "is-complete" : ""} ${phase === "fallback" ? "is-fallback" : ""} ${phase === "handoff" ? "is-handoff" : ""}`}
      aria-label="Red Nintendo DS Lite introduction"
    >
      <div className="ds-lite-intro-stage">
        {showFallbackArt && <DsLiteFallbackArt open={openArt} muted={false} />}
        {showCanvas && (
          <div className={`ds-lite-canvas-layer ${modelReady ? "is-ready" : ""}`} aria-hidden="true">
            <DsLiteIntroCanvas
              phase={phase as Exclude<DsIntroPhase, "checking" | "complete" | "fallback">}
              reducedMotion={reducedMotion}
              onModelReady={onModelReady}
              onActivate={onActivate}
              onAligned={onAligned}
              onOpenComplete={onOpenComplete}
              onError={onModelError}
              powerSwitchPulse={powerSwitchPulse}
              powerIndicatorColor={powerIndicatorColor}
            />
          </div>
        )}
        {phase === "fallback" && !fallbackOpen && (
          <button type="button" className="ds-lite-fallback-hit" onClick={onActivate}>
            <span className="sr-only">Open the red DS Lite</span>
          </button>
        )}
      </div>

      {showPower && (
        <PowerPrompt
          onPulse={() => setPowerSwitchPulse((current) => current + 1)}
          onSuccess={onPowerSuccess}
          reducedMotion={reducedMotion}
        />
      )}

      <div className="ds-lite-intro-copy">
        <p className="ds-lite-eyebrow">FIRST BOOT / CRIMSON RED</p>
        <h1>FLICK OWENS DS</h1>
        <p className="ds-lite-intro-instruction" aria-live="polite">
          {phase === "checking" && "Preparing the inspection view…"}
          {phase === "inspecting" && "Drag to inspect. Tap the console when you are ready."}
          {phase === "aligning" && "Returning to the home position…"}
          {phase === "opening" && "Opening the clamshell…"}
          {showPower && "Slide POWER up to start."}
          {phase === "handoff" && "Starting firmware…"}
          {phase === "fallback" && !fallbackOpen && "3D is unavailable. Tap the console to continue."}
        </p>
        {phase === "inspecting" && (
          <button type="button" className="ds-lite-activate-button" onClick={onActivate}>
            OPEN CONSOLE <span aria-hidden="true">↗</span>
          </button>
        )}
        {phase === "fallback" && !fallbackOpen && (
          <button type="button" className="ds-lite-activate-button" onClick={onActivate}>
            CONTINUE <span aria-hidden="true">↗</span>
          </button>
        )}
        <button type="button" className="ds-lite-skip" onClick={onSkip}>SKIP INTRO</button>
        <p className="ds-lite-model-credit">
          3D MODEL / <a href="https://sketchfab.com/3d-models/nintendo-ds-lite-91addaf07dca4b0baa8219888c684431" target="_blank" rel="noreferrer">THI3D</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
        </p>
      </div>
    </section>
  );
}

function PowerPrompt({
  onPulse,
  onSuccess,
  reducedMotion,
}: {
  onPulse: () => void;
  onSuccess: () => void;
  reducedMotion: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const startY = useRef<number | null>(null);
  const switchOnRef = useRef(false);
  const completed = useRef(false);
  const gestureHandled = useRef(false);
  const successTimer = useRef<number | null>(null);
  const controlRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    controlRef.current?.focus({ preventScroll: true });
    return () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current);
    };
  }, []);

  const flick = useCallback(() => {
    if (completed.current) return;
    const next = !switchOnRef.current;
    switchOnRef.current = next;
    setSwitchOn(next);
    onPulse();
    if (!next) return;
    completed.current = true;
    setDragging(false);
    successTimer.current = window.setTimeout(onSuccess, reducedMotion ? 0 : 220);
  }, [onPulse, onSuccess, reducedMotion]);

  const finish = useCallback((clientY: number) => {
    const origin = startY.current;
    startY.current = null;
    setDragging(false);
    if (!gestureHandled.current && isPowerDragComplete(origin, clientY)) {
      gestureHandled.current = true;
      flick();
      return;
    }
    if (origin !== null) {
      setInvalid(true);
      window.setTimeout(() => setInvalid(false), 420);
    }
  }, [flick]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    startY.current = event.clientY;
    gestureHandled.current = false;
    setDragging(true);
    setInvalid(false);
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => finish(event.clientY);
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!gestureHandled.current && isPowerDragComplete(startY.current, event.clientY)) {
      gestureHandled.current = true;
      flick();
      startY.current = null;
      setDragging(false);
    }
  };
  const onPointerCancel = () => {
    startY.current = null;
    gestureHandled.current = false;
    setDragging(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flick();
    }
  };

  return (
    <div className={`ds-lite-power-helper ${dragging ? "is-dragging" : ""} ${switchOn ? "is-on" : ""} ${invalid ? "is-invalid" : ""} ${reducedMotion ? "is-reduced-motion" : ""}`}>
      <button
        type="button"
        ref={controlRef}
        className="ds-lite-power-track"
        aria-label={switchOn ? "Slide POWER up to turn off the Nintendo DS Lite" : "Slide POWER up to turn on the Nintendo DS Lite"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <span className="ds-lite-power-ghost" aria-hidden="true" />
        <svg className="ds-lite-power-arrow" viewBox="0 0 32 64" aria-hidden="true">
          <path d="M16 58V10M5 21 16 9l11 12" />
        </svg>
        <span className="ds-lite-power-label">POWER</span>
      </button>
      <span className="ds-lite-power-status" aria-live="polite">{invalid ? "SLIDE UP / TRY AGAIN" : switchOn ? "POWER ON" : "FLICK UP"}</span>
    </div>
  );
}

function DsLiteFallbackArt({ open, muted }: { open: boolean; muted: boolean }) {
  return (
    <div className={`ds-lite-fallback-art ${open ? "is-open" : "is-closed"} ${muted ? "is-muted" : ""}`} aria-hidden="true">
      <div className="ds-lite-fallback-lid">
        <div className="ds-lite-fallback-screen" />
        <div className="ds-lite-fallback-speakers"><i /><i /><i /><i /><i /></div>
      </div>
      <div className="ds-lite-fallback-hinge" />
      <div className="ds-lite-fallback-deck">
        <div className="ds-lite-fallback-screen" />
        <div className="ds-lite-fallback-dpad" />
        <div className="ds-lite-fallback-buttons"><i /><i /><i /><i /></div>
        <div className="ds-lite-fallback-led" />
      </div>
      <span className="ds-lite-fallback-shadow" />
    </div>
  );
}
