"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
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

  const cursorSrc =
    cursorState === "closed"
      ? "/assets/wii/cursor/closed.png"
      : "/assets/wii/cursor/open.png";

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
      <Image
        src={cursorSrc}
        alt=""
        width={64}
        height={64}
        className="h-[52px] w-[51px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]"
        draggable={false}
      />
    </motion.div>
  );
}
