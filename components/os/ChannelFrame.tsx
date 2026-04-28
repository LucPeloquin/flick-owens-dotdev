"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ChannelManifestMeta } from "@/lib/channels/types";
import { useOS } from "@/lib/store/os";
import { getAudio } from "@/lib/audio/engine";
import { withViewTransition } from "@/lib/transitions";

export function ChannelFrame({
  channel,
  children,
}: {
  channel: ChannelManifestMeta;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const setActiveSlug = useOS((s) => s.setActiveSlug);

  useEffect(() => {
    setActiveSlug(channel.slug);
    return () => setActiveSlug(null);
  }, [channel.slug, setActiveSlug]);

  const accent = channel.accent ?? "#2a6ac8";
  const vtName = `channel-${channel.slug}`;

  const backToMenu = () => {
    getAudio().play("back");
    withViewTransition(() => router.push("/"));
  };

  return (
    <div
      className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pt-6 pb-40"
      style={{ viewTransitionName: vtName }}
    >
      <div
        className="relative flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] outline outline-4 outline-white/90"
        style={{ borderTop: `6px solid ${accent}` }}
      >
        <header className="flex items-center justify-between border-b border-black/10 bg-white/60 px-6 py-3 backdrop-blur">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-black/50">
              Channel
            </div>
            <div className="text-lg font-semibold text-black/80">
              {channel.title}
            </div>
          </div>
          <button
            data-wii-interactive
            onClick={backToMenu}
            className="rounded-full border border-black/10 bg-white px-5 py-2 text-xs uppercase tracking-[0.25em] text-black/70 shadow hover:-translate-y-[1px]"
          >
            Wii Menu
          </button>
        </header>
        <div className="relative h-[calc(100vh-240px)] overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
