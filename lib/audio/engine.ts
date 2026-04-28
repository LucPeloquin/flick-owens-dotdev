"use client";

import { Howl, Howler } from "howler";
import { SFX, BGM, type SfxName, type BgmName } from "./sounds";

type Cache = Map<string, Howl>;

class AudioEngine {
  private sfxCache: Cache = new Map();
  private bgm: Howl | null = null;
  private bgmName: BgmName | null = null;
  private bgmVolume = 0.35;
  private sfxVolume = 0.9;
  private muted = false;
  private unlocked = false;

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    Howler.mute(this.muted);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    Howler.mute(muted);
  }

  setVolume(v: number) {
    Howler.volume(Math.max(0, Math.min(1, v)));
  }

  play(name: SfxName, opts?: { volume?: number }) {
    if (!this.unlocked) return;
    const src = SFX[name];
    let howl = this.sfxCache.get(src);
    if (!howl) {
      howl = new Howl({ src: [src], volume: this.sfxVolume, preload: true });
      this.sfxCache.set(src, howl);
    }
    howl.volume(opts?.volume ?? this.sfxVolume);
    try {
      howl.play();
    } catch {
      // Missing file — ignore so the UI keeps working pre-asset-drop.
    }
  }

  setBgm(name: BgmName | null, opts?: { volume?: number; loop?: boolean }) {
    if (!this.unlocked) return;
    if (this.bgmName === name) {
      if (opts?.volume !== undefined && this.bgm) this.bgm.volume(opts.volume);
      return;
    }
    if (this.bgm) {
      const old = this.bgm;
      old.fade(old.volume(), 0, 400);
      setTimeout(() => old.stop(), 450);
    }
    this.bgmName = name;
    if (!name) {
      this.bgm = null;
      return;
    }
    this.bgm = new Howl({
      src: [BGM[name]],
      loop: opts?.loop ?? true,
      volume: 0,
      html5: true,
    });
    const target = opts?.volume ?? this.bgmVolume;
    try {
      this.bgm.play();
      this.bgm.fade(0, target, 600);
    } catch {
      // Missing file — silent.
    }
  }

  suppressBgm(suppress: boolean) {
    if (!this.bgm) return;
    this.bgm.fade(this.bgm.volume(), suppress ? 0 : this.bgmVolume, 400);
  }
}

let engine: AudioEngine | null = null;

export function getAudio(): AudioEngine {
  if (typeof window === "undefined") {
    return {
      unlock() {},
      setMuted() {},
      setVolume() {},
      play() {},
      setBgm() {},
      suppressBgm() {},
    } as unknown as AudioEngine;
  }
  if (!engine) engine = new AudioEngine();
  return engine;
}
