import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sourceDir = process.env.SKYEMU_SOURCE ? path.resolve(process.env.SKYEMU_SOURCE) : path.join(root, "vendor/skyemu-v5");
const outputDir = path.join(root, "public/emulator/skyemu-v5");
const run = promisify(execFile);

try {
  await access(path.join(sourceDir, "src/libretro.c"));
} catch {
  throw new Error(`SkyEmu v5 source is not present at ${sourceDir}. Check out the pinned v5 source before building; no remote code is downloaded by this script.`);
}
if (!process.env.EMCC) {
  throw new Error("Set EMCC to a pinned Emscripten compiler before building the SkyEmu adapter.");
}

await mkdir(outputDir, { recursive: true });
const emcc = process.env.EMCC;
const sourceFiles = [
  path.join(sourceDir, "src/libretro.c"),
  path.join(sourceDir, "src/shared.c"),
  path.join(sourceDir, "src/localization.c"),
  path.join(root, "scripts/skyemu-host-adapter.c"),
];
const outputPath = path.join(outputDir, "skyemu.js");
const exportedFunctions = [
  "_malloc", "_free", "_skyemu_init", "_skyemu_load", "_skyemu_step", "_skyemu_reset", "_skyemu_unload",
  "_skyemu_set_button", "_skyemu_set_touch", "_skyemu_frame_ptr", "_skyemu_frame_width", "_skyemu_frame_height",
  "_skyemu_frame_bytes", "_skyemu_audio_ptr", "_skyemu_audio_frames", "_skyemu_save_ptr", "_skyemu_save_bytes",
  "_skyemu_state_bytes", "_skyemu_state_write", "_skyemu_state_read",
];
const args = [
  ...sourceFiles,
  "-I", path.join(sourceDir, "src"),
  "-O3",
  "-DSE_PLATFORM_WEB",
  '-DGIT_COMMIT_HASH="skyemu-v5"',
  "-sMODULARIZE=1",
  "-sEXPORT_ES6=1",
  "-sEXPORT_NAME=SkyEmuModule",
  "-sENVIRONMENT=worker",
  "-sALLOW_MEMORY_GROWTH=1",
  "-sNO_EXIT_RUNTIME=1",
  "-sFILESYSTEM=0",
  // The worker copies verified ROM/save/state bytes through the module's
  // typed heap view. Emscripten keeps HEAPU8 private unless it is explicitly
  // listed as a runtime export.
  '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]',
  `-sEXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions)}`,
  "-o", outputPath,
  "-lm",
];

console.log(`Building SkyEmu v5 adapter from ${sourceDir}`);
try {
  await run(emcc, args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
} catch (error) {
  const detail = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : String(error);
  throw new Error(`SkyEmu adapter compilation failed. Verify the pinned Emscripten toolchain and v5 checkout.\n${detail}`);
}

const jsBytes = await readFile(outputPath);
const wasmPath = path.join(outputDir, "skyemu.wasm");
const wasmBytes = await readFile(wasmPath);
const buildHash = crypto.createHash("sha256").update(jsBytes).update(wasmBytes).digest("hex");
let sourceCommit = "unknown";
try {
  const result = await run("git", ["-C", sourceDir, "rev-parse", "HEAD"], { cwd: root });
  sourceCommit = result.stdout.trim() || sourceCommit;
} catch {
  // A source directory supplied through SKYEMU_SOURCE may be an archive
  // rather than a checkout. Keep the build usable while making that fact
  // explicit in the generated provenance record.
}
let compilerVersion = "unknown";
try {
  const result = await run(emcc, ["--version"], { cwd: root });
  compilerVersion = result.stdout.split("\n", 1)[0].trim() || compilerVersion;
} catch {
  // The compile already succeeded; this is only optional build provenance.
}
await writeFile(path.join(outputDir, "build.json"), `${JSON.stringify({
  source: "SkyEmu",
  tag: "v5",
  sourceCommit,
  compiler: compilerVersion,
  buildHash,
}, null, 2)}\n`);
console.log(`SkyEmu adapter ready: ${outputPath} (${buildHash})`);
