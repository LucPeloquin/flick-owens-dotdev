"use client";

import { usePathname, useRouter } from "next/navigation";
import { getAudio } from "@/lib/audio/engine";
import { withViewTransition } from "@/lib/transitions";

function WiiButton({
  href,
  label,
  glyph,
  tone,
  onClickSound = "tink",
}: {
  href: string;
  label: string;
  glyph: React.ReactNode;
  tone: "blue" | "grey" | "orange";
  onClickSound?: Parameters<ReturnType<typeof getAudio>["play"]>[0];
}) {
  const router = useRouter();
  const gradients = {
    blue: "from-[#cfe7ff] via-[#6eb3ff] to-[#2a6ac8]",
    grey: "from-[#f5f5f5] via-[#cfcfcf] to-[#6f6f6f]",
    orange: "from-[#ffd9a8] via-[#ff9e40] to-[#b85e0b]",
  }[tone];

  return (
    <button
      data-wii-interactive
      onClick={() => {
        getAudio().play(onClickSound);
        withViewTransition(() => router.push(href));
      }}
      className="group flex flex-col items-center"
      aria-label={label}
    >
      <div
        className={`relative grid h-16 w-28 place-items-center rounded-[28px] bg-gradient-to-b ${gradients} shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_4px_10px_rgba(0,0,0,0.4)] transition-transform group-hover:-translate-y-[1px] group-active:translate-y-[1px]`}
      >
        <div className="absolute inset-x-3 top-1 h-3 rounded-full bg-white/60 blur-[1px]" />
        <div className="relative text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
          {glyph}
        </div>
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/85">
        {label}
      </div>
    </button>
  );
}

export function BottomButtons() {
  const pathname = usePathname();
  const onMenu = pathname === "/";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-end gap-8">
        <WiiButton
          href="/"
          label="Wii Menu"
          tone="blue"
          onClickSound={onMenu ? "tink" : "back"}
          glyph={
            <svg width="30" height="22" viewBox="0 0 30 22" fill="none">
              <path
                d="M3 4 C6 14 9 16 11 4 M11 4 L14 18 M16 4 L19 18 M21 4 C24 14 27 16 29 4"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          }
        />
        <WiiButton
          href="/mail"
          label="Message Board"
          tone="grey"
          glyph={
            <svg width="34" height="22" viewBox="0 0 34 22" fill="none">
              <rect
                x="2"
                y="2"
                width="30"
                height="18"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="M2 4 L17 14 L32 4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinejoin="round"
              />
            </svg>
          }
        />
      </div>
    </div>
  );
}
