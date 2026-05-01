"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { ChannelManifest } from "@/lib/channels/types";
import { getAudio } from "@/lib/audio/engine";
import { withViewTransition } from "@/lib/transitions";

const iconGlyphs: Record<string, React.ReactNode> = {
  disc: (
    <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
      <circle cx="34" cy="34" r="30" fill="#1d1d1d" stroke="#444" strokeWidth="1" />
      <circle cx="34" cy="34" r="22" fill="url(#discSheen)" opacity="0.35" />
      <circle cx="34" cy="34" r="8" fill="#0a0a0a" />
      <circle cx="34" cy="34" r="3" fill="#666" />
      <defs>
        <radialGradient id="discSheen" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  ),
  mii: (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none">
      <circle cx="31" cy="26" r="18" fill="#fde4c8" stroke="#3b2a1a" strokeWidth="2" />
      <circle cx="24" cy="25" r="2.5" fill="#1a1a1a" />
      <circle cx="38" cy="25" r="2.5" fill="#1a1a1a" />
      <path d="M25 32 Q31 37 37 32" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M14 14 C18 6 44 6 48 14 C50 22 44 20 31 20 C18 20 12 22 14 14 Z" fill="#7a3a1a" />
      <rect x="14" y="46" width="34" height="12" rx="2" fill="#3f7fc4" />
    </svg>
  ),
  music: (
    <svg width="58" height="58" viewBox="0 0 58 58" fill="none">
      <path
        d="M20 42 V14 L44 10 V38"
        stroke="white"
        strokeWidth="3"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="44" r="6" fill="white" />
      <circle cx="40" cy="40" r="6" fill="white" />
    </svg>
  ),
  media: (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none">
      <rect x="4" y="12" width="54" height="34" rx="4" fill="white" opacity="0.95" />
      <path d="M25 22 L42 29 L25 36 Z" fill="#c2410c" />
      <rect x="14" y="50" width="34" height="4" rx="2" fill="white" opacity="0.7" />
    </svg>
  ),
};

export interface ChannelTileHandle {
  focus: () => void;
  activate: () => void;
}

interface Props {
  channel?: ChannelManifest;
  slot: number;
  focused: boolean;
  onFocus: () => void;
}

export const ChannelTile = forwardRef<ChannelTileHandle, Props>(function ChannelTile(
  { channel, slot, focused, onFocus },
  ref,
) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const hoveredRef = useRef(false);

  const activate = useCallback(() => {
    if (!channel) return;
    getAudio().play("zoom");
    withViewTransition(() => router.push(`/channel/${channel.slug}`));
  }, [channel, router]);

  useImperativeHandle(ref, () => ({
    focus: () => btnRef.current?.focus(),
    activate,
  }));

  if (!channel) return <EmptySlot slot={slot} />;

  const preview = channel.preview;
  const bg =
    preview.kind === "color"
      ? preview.color
      : "linear-gradient(180deg, #2a2a2a, #0a0a0a)";
  const accent = channel.accent ?? "#2a6ac8";

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  const vtName = `channel-${channel.slug}`;
  const style: CSSProperties = {
    background: bg,
    viewTransitionName: vtName,
  };

  return (
    <div className="relative">
      <motion.button
        ref={btnRef}
        data-wii-interactive
        data-slot={slot}
        aria-label={channel.title}
        onClick={activate}
        onKeyDown={onKey}
        onFocus={onFocus}
        onMouseEnter={() => {
          if (!hoveredRef.current) {
            hoveredRef.current = true;
            getAudio().play("hover", { volume: 0.25 });
          }
          onFocus();
        }}
        onMouseLeave={() => {
          hoveredRef.current = false;
        }}
        animate={
          focused
            ? {
                scale: 1.055,
                y: -4,
                rotate: [0, -0.35, 0.35, -0.2, 0.2, 0],
              }
            : { scale: 1, y: 0, rotate: 0, opacity: 1 }
        }
        transition={
          focused
            ? {
                scale: { type: "spring", stiffness: 320, damping: 22 },
                y: { type: "spring", stiffness: 320, damping: 22 },
                rotate: {
                  duration: 1.9,
                  repeat: Infinity,
                  repeatType: "loop",
                  ease: "easeInOut",
                },
              }
            : { type: "spring", stiffness: 320, damping: 22 }
        }
        className="group channel-tile relative block aspect-[781/425] w-full overflow-visible outline-none"
      >
        <div
          className="channel-tile-screen relative h-full w-full overflow-hidden bg-white"
          style={style}
        >
          {preview.kind === "color" && preview.icon && (
            <div className="absolute inset-0 grid place-items-center">
              {iconGlyphs[preview.icon] ?? (
                <div className="text-3xl font-bold text-white">
                  {preview.label ?? "?"}
                </div>
              )}
            </div>
          )}
          {preview.kind === "color" && preview.label && !preview.icon && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-3xl font-bold tracking-wide text-white drop-shadow">
                {preview.label}
              </div>
            </div>
          )}
          {preview.kind === "static" && (
            <Image
              src={preview.src}
              alt=""
              fill
              sizes="(max-width: 768px) 42vw, 224px"
              className="object-cover"
              draggable={false}
            />
          )}
          {preview.kind === "video" && (
            <video
              className="h-full w-full object-cover"
              src={preview.src}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
            />
          )}
          {preview.kind !== "static" && (
            <>
              <div className="pointer-events-none absolute inset-x-2 top-2 h-4 rounded-md bg-white/35 blur-sm" />
              <div className="pointer-events-none absolute inset-x-2 bottom-2 h-3 rounded-md bg-black/20 blur-sm" />
            </>
          )}
        </div>

        <div className="channel-tile-frame" />
        <div className="channel-tile-sheen" />
        <div
          className="channel-tile-focus"
          style={{
            boxShadow: focused
              ? `0 0 0 5px ${accent}, 0 0 24px ${accent}88, 0 14px 32px rgba(0,0,0,0.28)`
              : "0 0 0 0 transparent",
          }}
        />
      </motion.button>

      {/* Label only when focused/hovered — like the real Wii */}
      <motion.div
        initial={false}
        animate={{ opacity: focused ? 1 : 0, y: focused ? 0 : -4 }}
        transition={{ duration: 0.15 }}
        className="pointer-events-none absolute inset-x-0 top-full mt-2 text-center text-xs uppercase tracking-[0.2em] text-white/90 drop-shadow"
      >
        {channel.title}
      </motion.div>
    </div>
  );
});

function EmptySlot({ slot }: { slot: number }) {
  return (
    <div
      className="empty-channel-slot relative aspect-[781/425] w-full select-none overflow-hidden"
      aria-hidden
      data-empty-slot={slot}
    >
      <div className="empty-channel-fill" />
      <div className="channel-tile-frame" />
    </div>
  );
}
