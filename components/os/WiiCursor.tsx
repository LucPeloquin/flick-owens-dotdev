"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useOS } from "@/lib/store/os";

export function WiiCursor() {
  const cursorState = useOS((s) => s.cursorState);
  const setCursorState = useOS((s) => s.setCursorState);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 420, damping: 32, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 420, damping: 32, mass: 0.4 });

  const lastX = useRef(0);
  const lastY = useRef(0);
  const vx = useMotionValue(0);
  const rotate = useTransform(vx, [-40, 40], [-12, 12]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      vx.set(e.clientX - lastX.current);
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      x.set(e.clientX);
      y.set(e.clientY);
    };
    const onDown = () => setCursorState("closed");
    const onUp = () => setCursorState("open");
    const onOverInteractive = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-wii-interactive]")) setCursorState("hover");
      else if (useOS.getState().cursorState === "hover") setCursorState("open");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointerover", onOverInteractive);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerover", onOverInteractive);
    };
  }, [x, y, vx, setCursorState]);

  const color =
    cursorState === "closed"
      ? "#ffd24d"
      : cursorState === "hover"
        ? "#8ed0ff"
        : "#ffffff";

  return (
    <motion.div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        x: springX,
        y: springY,
        rotate,
        pointerEvents: "none",
        zIndex: 10000,
        translateX: "-18%",
        translateY: "-12%",
      }}
    >
      <svg width="44" height="54" viewBox="0 0 44 54" fill="none">
        <defs>
          <filter id="handShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.45" />
          </filter>
        </defs>
        <g filter="url(#handShadow)">
          <path
            d="M14 6 C14 3 16 2 18 2 C20 2 22 3 22 6 L22 22 L24 22 L24 10 C24 8 26 7 28 7 C30 7 32 8 32 10 L32 24 L34 24 L34 14 C34 12 36 11 38 11 C40 11 42 12 42 14 L42 32 C42 44 34 50 24 50 C14 50 8 44 6 36 L3 28 C2 26 3 23 5 22 C7 21 9 22 10 24 L14 30 Z"
            fill={color}
            stroke="#1a1a1a"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {cursorState === "closed" && (
            <circle cx="22" cy="28" r="3" fill="#1a1a1a" />
          )}
        </g>
      </svg>
    </motion.div>
  );
}
