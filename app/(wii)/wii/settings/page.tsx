"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { settingsPages, type SettingsEgg } from "@/content/settings";
import { getAudio } from "@/lib/audio/engine";

export default function SettingsPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const [popup, setPopup] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [crt, setCrt] = useState(false);

  const page = settingsPages[pageIndex];

  const fire = (egg: SettingsEgg) => {
    if (egg.kind === "message") {
      setPopup({ title: egg.title, body: egg.body });
    } else if (egg.kind === "sfx") {
      // @ts-expect-error — egg.sound is a string; engine ignores unknown names.
      getAudio().play(egg.sound);
      if (egg.title) setPopup({ title: egg.title, body: egg.body ?? "" });
    } else if (egg.kind === "toggle-crt") {
      setCrt((c) => !c);
      setPopup({ title: egg.title, body: egg.body ?? "" });
    } else if (egg.kind === "ir-calibration") {
      setPopup({ title: egg.title, body: egg.body ?? "" });
    } else if (egg.kind === "format") {
      setPopup({ title: egg.title, body: egg.body });
    }
  };

  return (
    <div className={`relative min-h-screen ${crt ? "crt" : ""}`}>
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-8 pb-40 pt-10 text-white">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] opacity-60">
              Wii System Settings
            </div>
            <h1 className="text-3xl font-light">{page.title}</h1>
          </div>
          <Link
            href="/"
            data-wii-interactive
            className="rounded-full border border-white/30 px-5 py-2 text-xs uppercase tracking-[0.25em] hover:bg-white/10"
            onClick={() => getAudio().play("back")}
          >
            Wii Menu
          </Link>
        </header>

        <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#14213d] to-[#061027] shadow-2xl">
          <ul className="divide-y divide-white/10">
            {page.rows.map((row) => (
              <li key={row.label}>
                <button
                  data-wii-interactive
                  onClick={() => {
                    getAudio().play("tink");
                    if (row.egg) fire(row.egg);
                  }}
                  className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-white/5"
                >
                  <span className="text-lg">{row.label}</span>
                  <span className="text-sm opacity-60">{row.value ?? "▸"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <nav className="mt-6 flex items-center justify-center gap-6">
          <PagerArrow
            direction="prev"
            disabled={pageIndex === 0}
            onClick={() => {
              setPageIndex((i) => Math.max(0, i - 1));
              getAudio().play("tink");
            }}
          />
          <div className="flex gap-2">
            {settingsPages.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setPageIndex(i);
                  getAudio().play("tink");
                }}
                className={`h-2 w-8 rounded-full transition-colors ${
                  i === pageIndex ? "bg-white" : "bg-white/30"
                }`}
                aria-label={`Settings page ${i + 1}`}
              />
            ))}
          </div>
          <PagerArrow
            direction="next"
            disabled={pageIndex === settingsPages.length - 1}
            onClick={() => {
              setPageIndex((i) => Math.min(settingsPages.length - 1, i + 1));
              getAudio().play("tink");
            }}
          />
        </nav>
      </div>

      <AnimatePresence>
        {popup && (
          <motion.div
            className="fixed inset-0 z-[8000] grid place-items-center bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPopup(null)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="max-w-md rounded-2xl border border-white/20 bg-white p-8 text-black shadow-2xl"
            >
              <div className="mb-2 text-xs uppercase tracking-[0.3em] text-black/50">
                Notice
              </div>
              <h2 className="mb-3 text-2xl font-semibold">{popup.title}</h2>
              <p className="text-sm text-black/70">{popup.body}</p>
              <div className="mt-6 text-right">
                <button
                  data-wii-interactive
                  onClick={() => setPopup(null)}
                  className="rounded-full bg-[#14213d] px-5 py-2 text-xs uppercase tracking-[0.25em] text-white"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .crt::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.12),
            rgba(0, 0, 0, 0.12) 1px,
            transparent 1px,
            transparent 3px
          );
          mix-blend-mode: multiply;
          z-index: 200;
        }
        .crt::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            ellipse at center,
            transparent 55%,
            rgba(0, 0, 0, 0.45) 100%
          );
          z-index: 201;
        }
      `}</style>
    </div>
  );
}

function PagerArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-wii-interactive
      onClick={onClick}
      disabled={disabled}
      className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-opacity disabled:opacity-30"
      aria-label={direction}
    >
      {direction === "prev" ? "◀" : "▶"}
    </button>
  );
}
