"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DsCartridgeLaunch } from "@/lib/ds/cartridges";
import type { DsControlId } from "@/lib/ds/firmware";
import { romForAssetId, romUrl } from "@/lib/ds/roms";
import type { SkyEmuFrame, SkyEmuWorkerRequest, SkyEmuWorkerResponse } from "@/lib/ds/skyemu-protocol";

export type SkyEmuRuntimeStatus = "idle" | "loading" | "ready" | "error";

export type SkyEmuRuntime = {
  status: SkyEmuRuntimeStatus;
  error: string | null;
  frame: SkyEmuFrame | null;
  press: (control: DsControlId) => void;
  release: (control: DsControlId) => void;
  releaseAll: () => void;
  touch: (x: number, y: number, pressed: boolean) => void;
  reset: () => void;
  exportState: () => void;
  importState: (buffer: ArrayBuffer) => void;
  stateError: string | null;
};

const SAVE_DB_NAME = "flick-ds-runtime";
const SAVE_STORE_NAME = "battery-saves";

type BatterySaveRecord = {
  key: string;
  buildHash: string;
  buffer: ArrayBuffer;
};

// SkyEmu emits interleaved signed 16-bit stereo at 48 kHz. Keeping the tiny
// queue in an AudioWorklet avoids tying emulation cadence to the React render
// loop and also works without SharedArrayBuffer/COOP headers.
const AUDIO_WORKLET_SOURCE = `
class DsSkyEmuAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.port.onmessage = (event) => {
      const samples = new Int16Array(event.data);
      for (let index = 0; index < samples.length; index += 1) this.queue.push(samples[index] / 32768);
      // Bound a stalled tab to roughly 250 ms of audio instead of allowing
      // unbounded memory growth when the browser throttles the worklet.
      const maxSamples = 48000 / 2;
      if (this.queue.length > maxSamples) this.queue.splice(0, this.queue.length - maxSamples);
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const left = output[0];
    const right = output[1] || output[0];
    for (let index = 0; index < left.length; index += 1) {
      left[index] = this.queue.length >= 2 ? this.queue.shift() : 0;
      right[index] = this.queue.length >= 1 ? this.queue.shift() : left[index];
    }
    return true;
  }
}
registerProcessor("ds-skyemu-audio", DsSkyEmuAudioProcessor);
`;

function openBatterySaveDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(SAVE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SAVE_STORE_NAME, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readBatterySave(key: string, buildHash: string): Promise<ArrayBuffer | null> {
  const db = await openBatterySaveDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(SAVE_STORE_NAME, "readonly").objectStore(SAVE_STORE_NAME).get(key);
    request.onsuccess = () => {
      const record = request.result as BatterySaveRecord | undefined;
      resolve(record?.buildHash === buildHash ? record.buffer : null);
    };
    request.onerror = () => resolve(null);
  });
}

async function writeBatterySave(key: string, buildHash: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openBatterySaveDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction(SAVE_STORE_NAME, "readwrite").objectStore(SAVE_STORE_NAME).put({ key, buildHash, buffer } satisfies BatterySaveRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export function DsRuntimeFrame({ frame, screen }: { frame: SkyEmuFrame; screen: "top" | "bottom" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    const width = frame.system === "gba" ? 240 : 256;
    const height = frame.system === "gba" ? 160 : 192;
    canvas.width = width;
    canvas.height = height;
    const source = new Uint8Array(frame.buffer);
    if (frame.system === "gba" && screen === "bottom") {
      context.fillStyle = "#030506";
      context.fillRect(0, 0, width, height);
      return;
    }
    const sourceHeight = frame.system === "gba" ? 160 : 384;
    const sourceY = frame.system === "gba" ? 0 : screen === "bottom" ? 192 : 0;
    // SkyEmu's libretro callback is XRGB8888. In a little-endian byte view
    // that is B,G,R,X, while ImageData requires R,G,B,A. Keep the DOM
    // fallback byte-for-byte equivalent to the DataTexture upload path.
    const rgba = new Uint8ClampedArray(frame.width * sourceHeight * 4);
    for (let index = 0; index < frame.width * sourceHeight; index += 1) {
      const sourceIndex = index * 4;
      const targetIndex = sourceIndex;
      rgba[targetIndex] = source[sourceIndex + 2] ?? 0;
      rgba[targetIndex + 1] = source[sourceIndex + 1] ?? 0;
      rgba[targetIndex + 2] = source[sourceIndex] ?? 0;
      rgba[targetIndex + 3] = 255;
    }
    const image = new ImageData(rgba, frame.width, sourceHeight);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.drawImage(canvasFromImage(image), 0, sourceY, frame.width, height, 0, 0, width, height);
  }, [frame, screen]);
  return <canvas ref={canvasRef} className="ds-runtime-frame" aria-label={`${screen} SkyEmu screen`} />;
}

function canvasFromImage(image: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  return canvas;
}

async function verifyRom(entry: NonNullable<ReturnType<typeof romForAssetId>>): Promise<{ objectUrl: string; buildHash: string }> {
  const response = await fetch(romUrl(entry), { cache: "no-store" });
  if (!response.ok) throw new Error(`ROM asset unavailable (${response.status})`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== entry.rom.bytes || hash !== entry.rom.sha256) throw new Error("ROM hash or byte length does not match its manifest");
  let buildHash = "skyemu-v5";
  try {
    const buildResponse = await fetch("/emulator/skyemu-v5/build.json", { cache: "no-store" });
    if (buildResponse.ok) {
      const build = await buildResponse.json() as { buildHash?: unknown };
      if (typeof build.buildHash === "string" && build.buildHash.length > 0) buildHash = build.buildHash;
    }
  } catch {
    // The worker will provide the actionable missing-adapter error when the
    // generated build record is absent; keep ROM verification deterministic.
  }
  return {
    objectUrl: URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })),
    buildHash,
  };
}

export function useSkyEmuRuntime(launch: DsCartridgeLaunch | null): SkyEmuRuntime {
  const workerRef = useRef<Worker | null>(null);
  const romObjectUrl = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioModuleUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<SkyEmuRuntimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<SkyEmuFrame | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const identityRef = useRef<{ system: "nds" | "gba"; romSha256: string; buildHash: string } | null>(null);

  const ensureAudio = useCallback(async () => {
    if (typeof window === "undefined" || !window.AudioContext) return;
    let context = audioContextRef.current;
    if (!context) {
      try {
        context = new window.AudioContext({ sampleRate: 48_000 });
      } catch {
        return;
      }
      audioContextRef.current = context;
      if (!context.audioWorklet) return;
      const sourceUrl = URL.createObjectURL(new Blob([AUDIO_WORKLET_SOURCE], { type: "text/javascript" }));
      audioModuleUrlRef.current = sourceUrl;
      try {
        await context.audioWorklet.addModule(sourceUrl);
        const node = new AudioWorkletNode(context, "ds-skyemu-audio", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        node.connect(context.destination);
        audioNodeRef.current = node;
      } catch {
        URL.revokeObjectURL(sourceUrl);
        audioModuleUrlRef.current = null;
        return;
      }
    }
    if (context.state === "suspended") await context.resume();
  }, []);

  const stopAudio = useCallback(() => {
    audioNodeRef.current?.disconnect();
    audioNodeRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) void context.close();
    if (audioModuleUrlRef.current) URL.revokeObjectURL(audioModuleUrlRef.current);
    audioModuleUrlRef.current = null;
  }, []);

  const send = useCallback((request: SkyEmuWorkerRequest) => workerRef.current?.postMessage(request), []);

  useEffect(() => {
    if (!launch || launch.type !== "rom") {
      workerRef.current?.postMessage({ type: "unload" } satisfies SkyEmuWorkerRequest);
      // The runtime is an external worker subscription; clear its UI state when
      // the subscription is torn down.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("idle");
      setError(null);
      setFrame(null);
      setStateError(null);
      identityRef.current = null;
      return;
    }
    const entry = romForAssetId(launch.romAssetId);
    if (!entry || entry.system !== launch.system) {
      setStatus("error");
      setError("This cartridge has no verified ROM manifest entry.");
      return;
    }
    const worker = new Worker(new URL("./skyemu.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setFrame(null);
    setStateError(null);
    worker.onmessage = (event: MessageEvent<SkyEmuWorkerResponse>) => {
      if (cancelled) return;
      if (event.data.type === "ready") {
        setStatus("ready");
        identityRef.current = { system: entry.system, romSha256: entry.rom.sha256, buildHash: event.data.buildHash };
        void ensureAudio();
        const key = `${entry.system}:${entry.rom.sha256}`;
        const readyBuildHash = event.data.buildHash;
        void readBatterySave(key, readyBuildHash).then((buffer) => {
          if (!buffer || cancelled) return;
          worker.postMessage({ type: "restore-save", buffer, romSha256: entry.rom.sha256, buildHash: readyBuildHash } satisfies SkyEmuWorkerRequest, [buffer]);
        });
      }
      if (event.data.type === "frame") setFrame(event.data.frame);
      if (event.data.type === "audio") audioNodeRef.current?.port.postMessage(event.data.buffer, [event.data.buffer]);
      if (event.data.type === "save") {
        void writeBatterySave(`${entry.system}:${event.data.romSha256}`, event.data.buildHash, event.data.buffer);
      }
      if (event.data.type === "state") {
        const identity = identityRef.current;
        if (!identity || identity.romSha256 !== event.data.romSha256 || identity.buildHash !== event.data.buildHash) {
          setStateError("This save state belongs to a different cartridge or SkyEmu build.");
        } else if (typeof window !== "undefined") {
          const payload = JSON.stringify({
            format: "flick-ds-savestate-v1",
            system: identity.system,
            romSha256: identity.romSha256,
            buildHash: identity.buildHash,
            state: Array.from(new Uint8Array(event.data.buffer)),
          });
          const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `${entry.id}.savestate.json`;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      }
      if (event.data.type === "error") {
        setStatus("error");
        setError(event.data.message);
        setFrame(null);
      }
    };
    worker.onerror = () => {
      if (!cancelled) {
        setStatus("error");
        setError("SkyEmu worker failed to start.");
      }
    };
    void verifyRom(entry).then(({ objectUrl, buildHash }) => {
      if (cancelled) { URL.revokeObjectURL(objectUrl); return; }
      romObjectUrl.current = objectUrl;
      worker.postMessage({ type: "load", system: entry.system, romUrl: objectUrl, romSha256: entry.rom.sha256, buildHash } satisfies SkyEmuWorkerRequest);
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setStatus("error");
        setError(reason instanceof Error ? reason.message : "Unable to verify ROM asset");
      }
    });
    return () => {
      cancelled = true;
      worker.postMessage({ type: "release-all" } satisfies SkyEmuWorkerRequest);
      worker.postMessage({ type: "unload" } satisfies SkyEmuWorkerRequest);
      // Give the worker one turn to flush its battery-save response before it
      // is terminated. A save is best-effort when the browser is closing.
      window.setTimeout(() => worker.terminate(), 40);
      workerRef.current = null;
      identityRef.current = null;
      if (romObjectUrl.current) URL.revokeObjectURL(romObjectUrl.current);
      romObjectUrl.current = null;
      stopAudio();
    };
  }, [ensureAudio, launch, stopAudio]);

  useEffect(() => {
    if (!launch || launch.type !== "rom") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        send({ type: "flush-save" });
        send({ type: "pause" });
      } else {
        send({ type: "resume" });
        void ensureAudio();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const saveTimer = window.setInterval(() => send({ type: "flush-save" }), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(saveTimer);
    };
  }, [ensureAudio, launch, send]);

  const exportState = useCallback(() => {
    setStateError(null);
    send({ type: "export-state" });
  }, [send]);

  const importState = useCallback((buffer: ArrayBuffer) => {
    const identity = identityRef.current;
    if (!identity) {
      setStateError("Start the cartridge before importing a save state.");
      return;
    }
    try {
      const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer))) as {
        format?: unknown;
        system?: unknown;
        romSha256?: unknown;
        buildHash?: unknown;
        state?: unknown;
      };
      if (parsed.format !== "flick-ds-savestate-v1" || parsed.system !== identity.system || parsed.romSha256 !== identity.romSha256 || parsed.buildHash !== identity.buildHash || !Array.isArray(parsed.state)) {
        throw new Error("Save state does not match this cartridge or SkyEmu build.");
      }
      const bytes = new Uint8Array(parsed.state.filter((value): value is number => typeof value === "number" && value >= 0 && value <= 255));
      send({ type: "import-state", buffer: bytes.buffer, romSha256: identity.romSha256, buildHash: identity.buildHash });
      setStateError(null);
    } catch (reason: unknown) {
      setStateError(reason instanceof Error ? reason.message : "Unable to import save state.");
    }
  }, [send]);

  return {
    status,
    error,
    frame,
    press: useCallback((control) => {
      void ensureAudio();
      send({ type: "press", control });
    }, [ensureAudio, send]),
    release: useCallback((control) => send({ type: "release", control }), [send]),
    releaseAll: useCallback(() => send({ type: "release-all" }), [send]),
    touch: useCallback((x, y, pressed) => {
      if (pressed) void ensureAudio();
      send({ type: "touch", x, y, pressed });
    }, [ensureAudio, send]),
    reset: useCallback(() => send({ type: "reset" }), [send]),
    exportState,
    importState,
    stateError,
  };
}
