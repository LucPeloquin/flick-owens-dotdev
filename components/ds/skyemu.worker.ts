/// <reference lib="webworker" />

import type { SkyEmuWorkerRequest, SkyEmuWorkerResponse } from "@/lib/ds/skyemu-protocol";

declare const self: DedicatedWorkerGlobalScope;

type SkyEmuModule = {
  HEAPU8: Uint8Array;
  _malloc: (bytes: number) => number;
  _free: (pointer: number) => void;
  _skyemu_init: () => number;
  _skyemu_load: (rom: number, bytes: number, path: number) => number;
  _skyemu_step: () => void;
  _skyemu_reset: () => void;
  _skyemu_unload: () => void;
  _skyemu_set_button: (control: number, pressed: number) => void;
  _skyemu_set_touch: (x: number, y: number, pressed: number) => void;
  _skyemu_frame_ptr: () => number;
  _skyemu_frame_width: () => number;
  _skyemu_frame_height: () => number;
  _skyemu_frame_bytes: () => number;
  _skyemu_audio_ptr: () => number;
  _skyemu_audio_frames: () => number;
  _skyemu_save_ptr: () => number;
  _skyemu_save_bytes: () => number;
  _skyemu_state_bytes: () => number;
  _skyemu_state_write: (pointer: number, bytes: number) => number;
  _skyemu_state_read: (pointer: number, bytes: number) => number;
};

type SkyEmuFactory = (options?: { locateFile?: (file: string) => string }) => Promise<SkyEmuModule>;

const CONTROL_IDS: Record<string, number> = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  l: 4,
  r: 5,
  "dpad-up": 6,
  "dpad-down": 7,
  "dpad-left": 8,
  "dpad-right": 9,
  select: 10,
  start: 11,
};

let modulePromise: Promise<SkyEmuModule> | null = null;
let runtimeModule: SkyEmuModule | null = null;
let running = false;
let paused = false;
let generation = 0;
let romSha256 = "";
let buildHash = "";

function post(response: SkyEmuWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(response, transfer);
}

function flushSave() {
  if (!runtimeModule) return;
  const bytes = runtimeModule._skyemu_save_bytes();
  const pointer = runtimeModule._skyemu_save_ptr();
  if (bytes <= 0 || !pointer) return;
  const save = copyBytes(runtimeModule, pointer, bytes);
  post({ type: "save", buffer: save, romSha256, buildHash }, [save]);
}

function exportState() {
  if (!runtimeModule) return;
  const bytes = runtimeModule._skyemu_state_bytes();
  if (bytes <= 0) return;
  const pointer = runtimeModule._malloc(bytes);
  if (!pointer || !runtimeModule._skyemu_state_write(pointer, bytes)) {
    if (pointer) runtimeModule._free(pointer);
    return;
  }
  const state = copyBytes(runtimeModule, pointer, bytes);
  runtimeModule._free(pointer);
  post({ type: "state", buffer: state, romSha256, buildHash }, [state]);
}

async function getModule(): Promise<SkyEmuModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      // webpackIgnore keeps the generated Emscripten module an explicit,
      // same-origin provisioned asset rather than pulling mutable code into
      // the Next bundle. The build script emits this exact path.
      // @ts-expect-error This generated Emscripten module is provisioned at
      // build/deploy time and intentionally is not part of the Next module graph.
      const loaded = await import(/* webpackIgnore: true */ "/emulator/skyemu-v5/skyemu.js") as unknown as { default?: SkyEmuFactory };
      const factory = loaded.default;
      if (!factory) throw new Error("SkyEmu adapter module has no Emscripten factory export.");
      return factory({ locateFile: (file) => `/emulator/skyemu-v5/${file}` });
    })();
  }
  return modulePromise;
}

function writeCString(runtime: SkyEmuModule, value: string): { pointer: number; bytes: number } {
  const encoded = new TextEncoder().encode(`${value}\0`);
  const pointer = runtime._malloc(encoded.byteLength);
  runtime.HEAPU8.set(encoded, pointer);
  return { pointer, bytes: encoded.byteLength };
}

function copyBytes(runtime: SkyEmuModule, pointer: number, bytes: number): ArrayBuffer {
  return runtime.HEAPU8.slice(pointer, pointer + bytes).buffer;
}

async function frameLoop(loopGeneration: number) {
  while (running && !paused && loopGeneration === generation && runtimeModule) {
    runtimeModule._skyemu_step();
    const frameBytes = runtimeModule._skyemu_frame_bytes();
    if (frameBytes > 0) {
      const frame = copyBytes(runtimeModule, runtimeModule._skyemu_frame_ptr(), frameBytes);
      post({
        type: "frame",
        frame: {
          system: runtimeModule._skyemu_frame_height() > 200 ? "nds" : "gba",
          width: runtimeModule._skyemu_frame_width(),
          height: runtimeModule._skyemu_frame_height(),
          buffer: frame,
          sequence: performance.now(),
        },
      }, [frame]);
    }
    const audioFrames = runtimeModule._skyemu_audio_frames();
    if (audioFrames > 0) {
      const audio = copyBytes(runtimeModule, runtimeModule._skyemu_audio_ptr(), audioFrames * 2 * 2);
      post({ type: "audio", buffer: audio }, [audio]);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
}

async function loadRom(request: Extract<SkyEmuWorkerRequest, { type: "load" }>) {
  generation += 1;
  const loadGeneration = generation;
  running = false;
  paused = false;
  if (runtimeModule) runtimeModule._skyemu_unload();
  const runtime = await getModule();
  if (loadGeneration !== generation) return;
  runtimeModule = runtime;
  if (!runtime._skyemu_init()) throw new Error("SkyEmu adapter initialization failed.");
  const bytes = new Uint8Array(await (await fetch(request.romUrl, { cache: "no-store" })).arrayBuffer());
  const romPointer = runtime._malloc(bytes.byteLength);
  runtime.HEAPU8.set(bytes, romPointer);
  const path = writeCString(runtime, request.system === "nds" ? "cartridge.nds" : "cartridge.gba");
  const loaded = runtime._skyemu_load(romPointer, bytes.byteLength, path.pointer);
  runtime._free(romPointer);
  runtime._free(path.pointer);
  if (!loaded) throw new Error("SkyEmu could not load this verified cartridge.");
  romSha256 = request.romSha256;
  buildHash = request.buildHash;
  running = true;
  post({ type: "ready", system: request.system, buildHash });
  void frameLoop(loadGeneration);
}

async function unload() {
  generation += 1;
  running = false;
  if (runtimeModule) {
    flushSave();
    runtimeModule._skyemu_unload();
  }
}

self.onmessage = (event: MessageEvent<SkyEmuWorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.type === "load") await loadRom(request);
      else if (request.type === "unload") await unload();
      else if (request.type === "flush-save") flushSave();
      else if (request.type === "pause") paused = true;
      else if (request.type === "resume") {
        paused = false;
        if (runtimeModule && running) void frameLoop(generation);
      } else if (request.type === "reset") runtimeModule?._skyemu_reset();
      else if (request.type === "export-state") exportState();
      else if (request.type === "import-state" && runtimeModule && request.romSha256 === romSha256 && request.buildHash === buildHash) {
        const bytes = runtimeModule._skyemu_state_bytes();
        const source = new Uint8Array(request.buffer);
        if (bytes > 0 && source.byteLength === bytes) {
          const pointer = runtimeModule._malloc(bytes);
          runtimeModule.HEAPU8.set(source, pointer);
          runtimeModule._skyemu_state_read(pointer, bytes);
          runtimeModule._free(pointer);
        }
      }
      else if (request.type === "release-all" && runtimeModule) {
        for (const control of Object.values(CONTROL_IDS)) runtimeModule._skyemu_set_button(control, 0);
        runtimeModule._skyemu_set_touch(0, 0, 0);
      } else if (request.type === "press" || request.type === "release") {
        const control = CONTROL_IDS[request.control];
        if (runtimeModule && control !== undefined) runtimeModule._skyemu_set_button(control, request.type === "press" ? 1 : 0);
      } else if (request.type === "touch" && runtimeModule) {
        runtimeModule._skyemu_set_touch(Math.round(request.x), Math.round(request.y), request.pressed ? 1 : 0);
      } else if (request.type === "restore-save" && runtimeModule && request.romSha256 === romSha256 && request.buildHash === buildHash) {
        const pointer = runtimeModule._skyemu_save_ptr();
        const capacity = runtimeModule._skyemu_save_bytes();
        if (pointer && capacity > 0) runtimeModule.HEAPU8.set(new Uint8Array(request.buffer).slice(0, capacity), pointer);
      }
    } catch (reason: unknown) {
      running = false;
      post({
        type: "error",
        message: reason instanceof Error
          ? reason.message
          : "SkyEmu v5 runtime failed to initialize.",
      });
    }
  })();
};
