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
      <div className="gbp-channel">
        <div className="gbp-shell gbp-shell-loading">
          <div className="gbp-screen">
            <div className="grid h-full place-items-center text-sm text-[#d7e8ff]/70">
              Initializing Game Boy Player...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!romPresent) {
    return (
      <div className="gbp-channel">
        <div className="gbp-shell">
          <div className="gbp-status-rail">
            <span className="gbp-led gbp-led-warn" />
            <span>No cartridge detected</span>
          </div>
          <div className="gbp-screen">
            <div className="grid h-full place-items-center p-8 text-center text-[#d7e8ff]">
              <div className="max-w-md">
                <div className="mb-3 text-xs uppercase tracking-[0.3em] opacity-60">
                  Game Boy Player
                </div>
                <h2 className="mb-4 text-2xl font-semibold">
                  Insert a Game Pak.
                </h2>
                <p className="text-sm opacity-75">
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
          </div>
          <GameBoyPlayerChrome />
        </div>
      </div>
    );
  }

  return (
    <div className="gbp-channel">
      <EmuConfig containerId={containerId} />
      <div className="gbp-shell">
        <div className="gbp-status-rail">
          <span className="gbp-led" />
          <span>Game Pak loaded</span>
          <span className="gbp-status-divider" />
          <span>240 x 160 output</span>
        </div>
        <div className="gbp-screen">
          <div id={containerId} className="absolute inset-0" />
          <div className="gbp-glass" />
        </div>
        <GameBoyPlayerChrome />
      </div>
      <Script
        src="https://cdn.emulatorjs.org/stable/data/loader.js"
        strategy="afterInteractive"
      />
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
    window.EJS_gameName = "Game Boy Player";
  }, [containerId]);
  return null;
}

function GameBoyPlayerChrome() {
  return (
    <div className="gbp-chrome" aria-hidden>
      <div className="gbp-brand">
        <span className="gbp-cube-mark">
          <span />
        </span>
        <div>
          <div className="gbp-brand-kicker">GameCube Output</div>
          <div className="gbp-brand-title">Game Boy Player</div>
        </div>
      </div>
      <div className="gbp-port">
        <span>EXT</span>
        <span>HI-SPEED PORT</span>
      </div>
      <div className="gbp-controls">
        <span>Arrows D-pad</span>
        <span>Z/X B/A</span>
        <span>A/S L/R</span>
        <span>Enter Start</span>
        <span>Shift Select</span>
      </div>
    </div>
  );
}
