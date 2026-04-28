"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { mail, type Letter } from "@/content/mail";
import { getAudio } from "@/lib/audio/engine";

export default function MailPage() {
  const sorted = useMemo(
    () => [...mail].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [],
  );
  const [selected, setSelected] = useState<Letter | null>(sorted[0] ?? null);

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl grid-cols-[320px_1fr] gap-4 px-6 pb-40 pt-10">
      <aside className="overflow-hidden rounded-2xl bg-white/10 backdrop-blur">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">
            Inbox
          </div>
          <Link
            href="/"
            data-wii-interactive
            onClick={() => getAudio().play("back")}
            className="rounded-full border border-white/30 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/80"
          >
            Wii Menu
          </Link>
        </header>
        <ul className="max-h-[70vh] overflow-auto no-scrollbar">
          {sorted.map((letter) => (
            <li key={letter.id}>
              <button
                data-wii-interactive
                onClick={() => {
                  setSelected(letter);
                  getAudio().play("tink");
                }}
                className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/5 ${
                  selected?.id === letter.id ? "bg-white/10" : ""
                }`}
              >
                <Envelope unread={letter.unread ?? false} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        letter.unread ? "font-semibold text-white" : "text-white/80"
                      }`}
                    >
                      {letter.from}
                    </span>
                    <span className="shrink-0 text-[10px] text-white/50">
                      {new Date(letter.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="truncate text-xs text-white/60">
                    {letter.subject}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="overflow-hidden rounded-2xl bg-white text-black shadow-2xl">
        {selected ? (
          <article className="flex h-full flex-col">
            <header className="border-b border-black/10 px-8 py-6">
              <div className="text-xs uppercase tracking-[0.3em] text-black/40">
                From {selected.from}
              </div>
              <h1 className="mt-1 text-2xl font-semibold">{selected.subject}</h1>
              <div className="mt-1 text-xs text-black/50">
                {new Date(selected.date).toLocaleString()}
              </div>
            </header>
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 overflow-auto whitespace-pre-wrap px-8 py-6 text-sm leading-relaxed text-black/80"
            >
              {selected.body}
            </motion.div>
            {selected.egg && (
              <footer className="border-t border-black/10 bg-amber-50 px-8 py-3 text-xs text-amber-800">
                ⭐ You found an easter egg.
              </footer>
            )}
          </article>
        ) : (
          <div className="grid h-full place-items-center text-black/50">
            No mail.
          </div>
        )}
      </main>
    </div>
  );
}

function Envelope({ unread }: { unread: boolean }) {
  return (
    <motion.div
      animate={unread ? { y: [0, -2, 0] } : {}}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className="grid h-10 w-12 shrink-0 place-items-center rounded border border-white/20 bg-white/10"
    >
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
        <rect x="1" y="1" width="22" height="14" rx="1.5" stroke="white" strokeWidth="1.5" />
        <path d="M1 2 L12 10 L23 2" stroke="white" strokeWidth="1.5" fill="none" />
        {unread && <circle cx="20" cy="3" r="3" fill="#ff4d4d" />}
      </svg>
    </motion.div>
  );
}
