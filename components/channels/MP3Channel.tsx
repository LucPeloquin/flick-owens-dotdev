"use client";

import { useEffect, useRef, useState } from "react";
import { useOS } from "@/lib/store/os";
import { getAudio } from "@/lib/audio/engine";

interface Track {
  title: string;
  artist: string;
  album?: string;
  src: string;
  coverArt?: string;
  duration?: number;
}

interface Playlist {
  title: string;
  description?: string;
  tracks: Track[];
}

export default function MP3Channel() {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setBgmSuppressed = useOS((s) => s.setBgmSuppressed);

  useEffect(() => {
    fetch("/music/playlist.json")
      .then((r) => r.json())
      .then(setPlaylist)
      .catch(() => setPlaylist({ title: "Unavailable", tracks: [] }));
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      if (!playlist || playlist.tracks.length === 0) return;
      setIndex((i) => (i + 1) % playlist.tracks.length);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [playlist]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playlist) return;
    const nextSrc = playlist.tracks[index]?.src;
    audio.src = nextSrc ?? "";
    if (!nextSrc) {
      audio.pause();
      return;
    }
    if (playing) audio.play().catch(() => setPlaying(false));
  }, [index, playlist, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => setPlaying(false));
      setBgmSuppressed(true);
      getAudio().suppressBgm(true);
    } else {
      audio.pause();
      setBgmSuppressed(false);
      getAudio().suppressBgm(false);
    }
  }, [playing, setBgmSuppressed]);

  useEffect(() => {
    return () => {
      setBgmSuppressed(false);
      getAudio().suppressBgm(false);
    };
  }, [setBgmSuppressed]);

  if (!playlist) {
    return (
      <div className="grid h-full place-items-center bg-[#0f2447] text-white">
        Loading playlist…
      </div>
    );
  }

  const track = playlist.tracks[index];
  const hasTracks = playlist.tracks.length > 0;

  return (
    <div className="grid h-full grid-cols-[1fr_360px] gap-4 bg-gradient-to-b from-[#0f2447] to-[#061430] p-6 text-white">
      <div className="flex flex-col items-center justify-center gap-6 rounded-xl bg-white/5 p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-white/50">
          {playlist.title}
        </div>
        <div
          className="aspect-square w-64 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#1e3a8a] shadow-2xl"
          style={
            track?.coverArt
              ? {
                  backgroundImage: `url(${track.coverArt})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
        <div className="text-center">
          <div className="text-2xl font-semibold">
            {track?.title ?? "—"}
          </div>
          <div className="text-sm text-white/60">{track?.artist ?? ""}</div>
        </div>
        <div className="w-full max-w-md">
          <input
            data-wii-interactive
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={progress}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = v;
              setProgress(v);
            }}
            className="w-full accent-[#3b82f6]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-white/50">
            <span>{fmtTime(progress)}</span>
            <span>{fmtTime(duration || track?.duration || 0)}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Btn
            disabled={!hasTracks}
            onClick={() => {
              if (!hasTracks) return;
              setIndex((i) => (i - 1 + playlist.tracks.length) % playlist.tracks.length);
            }}
          >
            ◀◀
          </Btn>
          <Btn primary disabled={!hasTracks} onClick={() => setPlaying((p) => !p)}>
            {playing ? "❚❚" : "▶"}
          </Btn>
          <Btn
            disabled={!hasTracks}
            onClick={() => {
              if (!hasTracks) return;
              setIndex((i) => (i + 1) % playlist.tracks.length);
            }}
          >
            ▶▶
          </Btn>
        </div>
      </div>

      <aside className="overflow-auto rounded-xl bg-white/5 p-4 no-scrollbar">
        <div className="mb-3 text-xs uppercase tracking-[0.3em] text-white/50">
          Tracks ({playlist.tracks.length})
        </div>
        <ul className="space-y-1">
          {playlist.tracks.map((t, i) => (
            <li key={i}>
              <button
                data-wii-interactive
                onClick={() => {
                  setIndex(i);
                  setPlaying(true);
                  getAudio().play("select");
                }}
                className={`flex w-full items-baseline gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  i === index ? "bg-white/20 text-white" : "hover:bg-white/10"
                }`}
              >
                <span className="w-6 text-right text-xs text-white/50">
                  {i + 1}
                </span>
                <span className="flex-1 truncate">
                  {t.title}
                  <span className="ml-2 text-white/50">{t.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      data-wii-interactive
      onClick={onClick}
      disabled={disabled}
      className={`grid h-12 w-12 place-items-center rounded-full text-lg shadow-lg transition-transform hover:-translate-y-[1px] ${
        primary
          ? "h-16 w-16 bg-white text-[#0f2447] text-xl"
          : "bg-white/10 hover:bg-white/20"
      } ${disabled ? "cursor-not-allowed opacity-40 hover:translate-y-0" : ""}`}
    >
      {children}
    </button>
  );
}

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
