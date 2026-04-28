"use client";

import { useEffect, useState } from "react";
import { useOS } from "@/lib/store/os";
import { getAudio } from "@/lib/audio/engine";

export function VolumeControl() {
  const muted = useOS((s) => s.muted);
  const volume = useOS((s) => s.volume);
  const toggleMuted = useOS((s) => s.toggleMuted);
  const setVolume = useOS((s) => s.setVolume);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.matches("input, textarea, select")) return;
      if (e.key === "m" || e.key === "M") {
        toggleMuted();
        getAudio().setMuted(!muted);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        setVolume(Math.min(1, volume + 0.1));
        getAudio().play("tink");
      }
      if (e.key === "-" || e.key === "_") {
        setVolume(Math.max(0, volume - 0.1));
        getAudio().play("tink");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [muted, volume, toggleMuted, setVolume]);

  return (
    <div
      className="fixed right-4 top-4 z-40 flex items-center gap-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={`overflow-hidden rounded-full bg-black/40 backdrop-blur transition-all ${
          open ? "w-44 px-4 opacity-100" : "w-0 opacity-0"
        }`}
      >
        <input
          data-wii-interactive
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            if (muted && v > 0) {
              toggleMuted();
              getAudio().setMuted(false);
            }
          }}
          className="my-3 w-full accent-white"
          aria-label="Volume"
        />
      </div>
      <button
        data-wii-interactive
        onClick={() => {
          toggleMuted();
          getAudio().setMuted(!muted);
        }}
        className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white/30"
        aria-label={muted ? "Unmute" : "Mute"}
        title="M to toggle · +/- to adjust"
      >
        {muted || volume === 0 ? <MuteIcon /> : <SpeakerIcon level={volume} />}
      </button>
    </div>
  );
}

function SpeakerIcon({ level }: { level: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9 H8 L13 5 V19 L8 15 H4 Z"
        fill="currentColor"
      />
      {level > 0.25 && (
        <path
          d="M16 9 Q19 12 16 15"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {level > 0.65 && (
        <path
          d="M18 6 Q23 12 18 18"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor" />
      <path
        d="M17 9 L22 14 M22 9 L17 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
