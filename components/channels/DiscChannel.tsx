"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useOS } from "@/lib/store/os";

// Config — drop your legally-obtained ROM and optional savestate into public/roms/
// (these paths are gitignored). If the ROM is missing you'll see a friendly
// placeholder instead of a broken iframe.
const ROM_URL = "/roms/game.gba";
const SAVESTATE_URL: string | null = null;
const CORE = "gba"; // change to "nds" / "snes" / "nes" etc. per EmulatorJS cores

interface EJSEmulator {
  pause?: () => void;
  play?: () => void;
  elements?: {
    parent?: HTMLElement;
  };
}

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameUrl?: string;
    EJS_pathtodata?: string;
    EJS_loadStateURL?: string;
    EJS_startOnLoaded?: boolean;
    EJS_color?: string;
    EJS_gameName?: string;
    EJS_ready?: () => void;
    EJS_emulator?: EJSEmulator;
  }
}

export default function DiscChannel() {
  const containerId = "disc-channel-emu";
  const [romPresent, setRomPresent] = useState<boolean | null>(null);
  const setPauseHandler = useOS((s) => s.setPauseHandler);

  useEffect(() => {
    // Check once if the ROM is accessible; EmulatorJS otherwise throws noisy errors.
    let cancelled = false;
    fetch(ROM_URL, { method: "HEAD" })
      .then((r) => !cancelled && setRomPresent(r.ok))
      .catch(() => !cancelled && setRomPresent(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Register pause/resume with the OS shell so the HOME overlay can drive it.
  useEffect(() => {
    setPauseHandler({
      pause: () => {
        try {
          window.EJS_emulator?.pause?.();
        } catch {
          /* emulator not booted yet */
        }
      },
      resume: () => {
        try {
          window.EJS_emulator?.play?.();
        } catch {
          /* emulator not booted yet */
        }
      },
    });
    return () => setPauseHandler(null);
  }, [setPauseHandler]);

  if (romPresent === null) {
    return (
      <div className="grid h-full place-items-center bg-black text-white">
        <div className="text-sm opacity-70">Loading disc…</div>
      </div>
    );
  }

  if (!romPresent) {
    return (
      <div className="grid h-full place-items-center bg-black p-10 text-center text-white">
        <div className="max-w-md">
          <div className="mb-3 text-xs uppercase tracking-[0.3em] opacity-60">
            No disc inserted
          </div>
          <h2 className="mb-4 text-2xl font-semibold">
            Please insert a Game Disc.
          </h2>
          <p className="text-sm opacity-70">
            Drop your ROM at{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">
              public/roms/game.gba
            </code>{" "}
            and refresh. Optional savestates can be added later at{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">public/roms/game.ss0</code>.
            Files in <code>/public/roms</code> are gitignored.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black">
      <EmuConfig containerId={containerId} />
      <div id={containerId} className="absolute inset-0" />
      <Script
        src="https://cdn.emulatorjs.org/stable/data/loader.js"
        strategy="afterInteractive"
      />
      <EmuTips />
    </div>
  );
}

function EmuConfig({ containerId }: { containerId: string }) {
  const set = useRef(false);
  useEffect(() => {
    if (set.current) return;
    set.current = true;
    window.EJS_player = `#${containerId}`;
    window.EJS_core = CORE;
    window.EJS_gameUrl = ROM_URL;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    if (SAVESTATE_URL) {
      window.EJS_loadStateURL = SAVESTATE_URL;
    }
    window.EJS_startOnLoaded = true;
    window.EJS_color = "#5ab0ff";
    window.EJS_gameName = "Disc Channel";
  }, [containerId]);
  return null;
}

function EmuTips() {
  return (
    <div className="pointer-events-none absolute left-4 top-4 rounded bg-black/60 px-3 py-2 text-xs text-white/80">
      Keyboard: arrows = D-pad · Z/X = B/A · A/S = L/R · Enter = Start · Shift =
      Select
    </div>
  );
}
