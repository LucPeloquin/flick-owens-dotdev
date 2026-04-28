"use client";

import { useEffect, useMemo, useRef } from "react";

interface Bubble {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number; // horizontal sway amplitude in px
  layer: 0 | 1 | 2;
}

// Deterministic PRNG so SSR and CSR agree — React would warn on random
// positions otherwise. Seeded Mulberry32.
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function useBubbles(count: number, seed: number): Bubble[] {
  return useMemo(() => {
    const rand = mulberry32(seed);
    const list: Bubble[] = [];
    for (let i = 0; i < count; i++) {
      const layer = (i % 3) as 0 | 1 | 2;
      const baseSize = layer === 0 ? 36 : layer === 1 ? 72 : 120;
      list.push({
        left: rand() * 100,
        size: baseSize + rand() * baseSize * 0.5,
        delay: -rand() * 30,
        duration: 28 + rand() * 24 + layer * 10,
        drift: 20 + rand() * 40 - layer * 6,
        layer,
      });
    }
    return list;
  }, [count, seed]);
}

export function BubbleField() {
  const bubbles = useBubbles(28, 0xfb1cc);
  const rootRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Normalize to -1..1 relative to viewport center
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const tick = () => {
      // Lerp current toward target for smoothness
      current.current.x += (target.current.x - current.current.x) * 0.06;
      current.current.y += (target.current.y - current.current.y) * 0.06;
      const el = rootRef.current;
      if (el) {
        el.style.setProperty("--mx", current.current.x.toFixed(3));
        el.style.setProperty("--my", current.current.y.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const byLayer: [Bubble[], Bubble[], Bubble[]] = [[], [], []];
  for (const b of bubbles) byLayer[b.layer].push(b);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ ["--mx" as string]: 0, ["--my" as string]: 0 }}
    >
      {byLayer.map((layerBubbles, li) => (
        <div key={li} className={`wii-layer wii-layer-${li}`}>
          {layerBubbles.map((b, i) => (
            <span
              key={i}
              className={`wii-bubble wii-bubble-l${b.layer}`}
              style={{
                left: `${b.left}%`,
                width: `${b.size}px`,
                height: `${b.size}px`,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
                ["--drift" as string]: `${b.drift}px`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
