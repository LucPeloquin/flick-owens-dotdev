"use client";

import { create } from "zustand";

type CursorState = "open" | "closed" | "hover";

export interface PauseHandler {
  pause: () => void;
  resume: () => void;
}

interface OSState {
  booted: boolean;
  muted: boolean;
  volume: number;
  cursorState: CursorState;
  homeOverlayOpen: boolean;
  activeSlug: string | null;
  bgmSuppressed: boolean;
  pauseHandler: PauseHandler | null;

  boot: () => void;
  toggleMuted: () => void;
  setVolume: (v: number) => void;
  setCursorState: (s: CursorState) => void;
  openHome: () => void;
  closeHome: () => void;
  setActiveSlug: (slug: string | null) => void;
  setBgmSuppressed: (b: boolean) => void;
  setPauseHandler: (h: PauseHandler | null) => void;
}

export const useOS = create<OSState>((set, get) => ({
  booted: false,
  muted: false,
  volume: 0.45,
  cursorState: "open",
  homeOverlayOpen: false,
  activeSlug: null,
  bgmSuppressed: false,
  pauseHandler: null,

  boot: () => set({ booted: true }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setCursorState: (cursorState) => set({ cursorState }),
  openHome: () => {
    const handler = get().pauseHandler;
    handler?.pause();
    set({ homeOverlayOpen: true });
  },
  closeHome: () => {
    const handler = get().pauseHandler;
    handler?.resume();
    set({ homeOverlayOpen: false });
  },
  setActiveSlug: (activeSlug) => set({ activeSlug }),
  setBgmSuppressed: (bgmSuppressed) => set({ bgmSuppressed }),
  setPauseHandler: (pauseHandler) => set({ pauseHandler }),
}));
