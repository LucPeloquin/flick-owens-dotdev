#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "assets/ds/sources.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const overlayManifestPath = resolve(root, "assets/ds/overlays.json");
const overlayManifest = JSON.parse(await readFile(overlayManifestPath, "utf8"));
const args = new Set(process.argv.slice(2));
const rawRoot = resolve(root, process.env.DS_RAW_ROOT ?? "assets/ds/raw");

const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");

async function download(url, destination) {
  if (existsSync(destination)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function importRaster(asset) {
  const rawPath = resolve(rawRoot, "source", asset.originalFile);
  const destination = resolve(root, asset.derivedPath);
  await download(asset.downloadUrl, rawPath);
  await mkdir(dirname(destination), { recursive: true });
  if (!existsSync(destination)) await writeFile(destination, await readFile(rawPath));
  asset.sha256 = await digest(destination);
  asset.sourceSha256 = await digest(rawPath);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath ?? entry.path ?? directory, entry.name));
}

async function importArchive(archive) {
  const rawPath = resolve(root, archive.rawPath);
  const extractPath = resolve(rawRoot, "extracted", archive.id);
  await download(archive.downloadUrl, rawPath);
  await mkdir(extractPath, { recursive: true });
  if ((await readdir(extractPath)).length === 0) {
    await execFileAsync("unzip", ["-q", "-o", rawPath, "-d", extractPath]);
  }

  const outputDirectory = resolve(root, archive.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  for (const file of await listFiles(extractPath)) {
    if (extname(file).toLowerCase() !== ".wav") continue;
    const relativeName = relative(extractPath, file).replaceAll("/", "-").replaceAll("\\", "-");
    const outputPath = join(outputDirectory, relativeName.replace(/\.wav$/i, ".m4a"));
    if (!existsSync(outputPath)) {
      try {
        await execFileAsync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", file, outputPath]);
      } catch {
        const wavOutput = outputPath.replace(/\.m4a$/i, ".wav");
        await copyFile(file, wavOutput);
        console.warn(`Kept ${relativeName} as WAV because the source encoding cannot be transcoded by afconvert.`);
      }
    }
  }
  archive.sha256 = await digest(rawPath);
}

if (args.has("--download") || args.has("--import")) {
  for (const asset of manifest.assets) await importRaster(asset);
  for (const archive of manifest.archives) await importArchive(archive);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Imported ${manifest.assets.length} DS source images and ${manifest.archives.length} sound archives.`);
}

const failures = [];
for (const asset of manifest.assets) {
  const file = resolve(root, asset.derivedPath);
  if (!existsSync(file)) failures.push(`${asset.id}: missing ${asset.derivedPath}`);
  else if (asset.sha256 && asset.sha256 !== (await digest(file))) failures.push(`${asset.id}: checksum mismatch`);
}
for (const archive of manifest.archives) {
  const file = resolve(root, archive.rawPath);
  if (!existsSync(file)) {
    console.warn(`${archive.id}: raw archive is not cached; run npm run assets:ds:import to download it.`);
  } else if (archive.sha256 && archive.sha256 !== (await digest(file))) {
    failures.push(`${archive.id}: checksum mismatch`);
  }
}
const overlayFile = resolve(root, overlayManifest.finalPath);
if (!existsSync(overlayFile)) {
  failures.push(`${overlayManifest.id}: missing ${overlayManifest.finalPath}`);
} else if (overlayManifest.finalSha256 && overlayManifest.finalSha256 !== (await digest(overlayFile))) {
  failures.push(`${overlayManifest.id}: checksum mismatch`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified ${manifest.assets.length} DS images, ${manifest.archives.length} sound archives, and the LaunchBox overlay.`);
}
