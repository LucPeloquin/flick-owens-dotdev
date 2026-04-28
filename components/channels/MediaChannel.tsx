"use client";

import { useState } from "react";
import { media, type MediaEntry } from "@/content/media";
import { getAudio } from "@/lib/audio/engine";

export default function MediaChannel() {
  const [active, setActive] = useState<MediaEntry>(media[0]);

  return (
    <div className="grid h-full grid-cols-[260px_1fr] gap-4 bg-[radial-gradient(ellipse_at_top,_#fff1e0,_#ffd7a8)] p-6">
      <aside className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.3em] text-black/50">
          Platforms
        </div>
        {media.map((m) => (
          <button
            key={m.platform}
            data-wii-interactive
            onClick={() => {
              setActive(m);
              getAudio().play("tink");
            }}
            className={`group flex flex-col items-start gap-1 rounded-xl border-2 bg-white/70 p-4 text-left shadow transition-transform hover:-translate-y-[1px] ${
              active.platform === m.platform
                ? "border-[#c2410c]"
                : "border-transparent"
            }`}
          >
            <span className="text-xs uppercase tracking-[0.2em] text-black/40">
              {m.label}
            </span>
            <span className="text-lg font-semibold text-black/80">
              {m.handle}
            </span>
          </button>
        ))}
      </aside>

      <section className="flex flex-col overflow-hidden rounded-xl bg-white shadow">
        <header className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-black/40">
              Latest on {active.label}
            </div>
            <div className="font-semibold text-black/80">{active.handle}</div>
          </div>
          <a
            href={active.profileUrl}
            target="_blank"
            rel="noreferrer"
            data-wii-interactive
            className="rounded-full bg-[#c2410c] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white"
          >
            Open profile ↗
          </a>
        </header>
        <div className="relative flex-1 bg-black">
          <Embed entry={active} />
        </div>
      </section>
    </div>
  );
}

function Embed({ entry }: { entry: MediaEntry }) {
  if ((entry.platform === "youtube" || entry.platform === "tiktok") && !entry.embedUrl) {
    return (
      <div className="grid h-full place-items-center bg-black p-10 text-center text-white">
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.3em] opacity-60">
            Latest embed pending
          </div>
          <div className="mb-4 text-lg">
            Open the profile to view the latest post.
          </div>
          <a
            href={entry.latestUrl}
            target="_blank"
            rel="noreferrer"
            data-wii-interactive
            className="rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-black"
          >
            Open {entry.label} ↗
          </a>
        </div>
      </div>
    );
  }

  if (entry.platform === "youtube") {
    return (
      <iframe
        src={entry.embedUrl}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }
  if (entry.platform === "tiktok") {
    return (
      <iframe
        src={entry.embedUrl}
        className="h-full w-full bg-black"
        allow="autoplay; encrypted-media; fullscreen"
      />
    );
  }
  // Tumblr doesn't expose a simple embed for an entire blog — show a friendly link card.
  return (
    <div className="grid h-full place-items-center bg-[#35465c] p-10 text-center text-white">
      <div>
        <div className="mb-2 text-xs uppercase tracking-[0.3em] opacity-60">
          Tumblr embed
        </div>
        <div className="mb-4 text-lg">
          Visit the blog to browse the latest posts.
        </div>
        <a
          href={entry.latestUrl}
          target="_blank"
          rel="noreferrer"
          data-wii-interactive
          className="rounded-full bg-white px-6 py-3 text-xs uppercase tracking-[0.2em] text-[#35465c]"
        >
          Open Tumblr ↗
        </a>
      </div>
    </div>
  );
}
