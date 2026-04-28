"use client";

import { useEffect } from "react";
import { WiiCursor } from "./WiiCursor";
import { ClockBadge } from "./ClockBadge";
import { WiiNumberBadge } from "./WiiNumberBadge";
import { BottomButtons } from "./BottomButtons";
import { HomeButtonOverlay } from "./HomeButtonOverlay";
import { Splash } from "./Splash";
import { BubbleField } from "./BubbleField";
import { VolumeControl } from "./VolumeControl";
import { useOS } from "@/lib/store/os";
import { getAudio } from "@/lib/audio/engine";

export function OSShell({ children }: { children: React.ReactNode }) {
  const muted = useOS((s) => s.muted);
  const volume = useOS((s) => s.volume);

  useEffect(() => {
    getAudio().setMuted(muted);
  }, [muted]);

  useEffect(() => {
    getAudio().setVolume(volume);
  }, [volume]);

  return (
    <>
      <Splash />
      <div className="os-surface relative min-h-screen">
        <BubbleField />
        <div className="relative z-10">{children}</div>
        <WiiNumberBadge />
        <ClockBadge />
        <VolumeControl />
        <BottomButtons />
      </div>
      <WiiCursor />
      <HomeButtonOverlay />
    </>
  );
}
