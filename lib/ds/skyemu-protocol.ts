import type { DsControlId } from "./firmware";
import type { DsRomSystem } from "./roms";

export type SkyEmuFrame = {
  system: DsRomSystem;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  sequence: number;
};

export type SkyEmuWorkerRequest =
  | { type: "load"; system: DsRomSystem; romUrl: string; romSha256: string; buildHash: string }
  | { type: "press"; control: DsControlId }
  | { type: "release"; control: DsControlId }
  | { type: "release-all" }
  | { type: "touch"; x: number; y: number; pressed: boolean }
  | { type: "restore-save"; buffer: ArrayBuffer; romSha256: string; buildHash: string }
  | { type: "reset" }
  | { type: "export-state" }
  | { type: "import-state"; buffer: ArrayBuffer; romSha256: string; buildHash: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "flush-save" }
  | { type: "unload" };

export type SkyEmuWorkerResponse =
  | { type: "ready"; system: DsRomSystem; buildHash: string }
  | { type: "frame"; frame: SkyEmuFrame }
  | { type: "audio"; buffer: ArrayBuffer }
  | { type: "state"; buffer: ArrayBuffer; romSha256: string; buildHash: string }
  | { type: "save"; buffer: ArrayBuffer; romSha256: string; buildHash: string }
  | { type: "error"; message: string };
