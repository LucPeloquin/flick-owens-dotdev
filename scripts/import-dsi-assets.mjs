#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "assets/dsi/sources.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const args = new Set(process.argv.slice(2));
const shouldDownload = args.has("--download");
const shouldImport = args.has("--import") || shouldDownload;
const sourceRootArg = process.argv.find((arg) => arg.startsWith("--source-root="))?.slice(14);
const sourceRoot = resolve(root, sourceRootArg ?? process.env.DSI_RAW_ROOT ?? "assets/dsi/raw");

function sourcePathFor(asset) {
  if (asset.sourcePath) return asset.sourcePath;
  const marker = asset.revision ? `/blob/${asset.revision}/` : null;
  const pathname = decodeURIComponent(new URL(asset.source).pathname);
  const sourcePath = marker ? pathname.split(marker)[1] : pathname.split("/").at(-1);
  if (!sourcePath) throw new Error(`${asset.id}: unable to derive source path from ${asset.source}`);
  return sourcePath;
}

function safeSourcePath(sourcePath) {
  const normalized = resolve(sourceRoot, sourcePath);
  const rel = relative(sourceRoot, normalized);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Refusing source path outside raw cache: ${sourcePath}`);
  }
  return normalized;
}

async function downloadSources() {
  for (const asset of manifest) {
    if (asset.category === "model") continue;
    const sourcePath = sourcePathFor(asset);
    const target = safeSourcePath(sourcePath);
    if (existsSync(target)) continue;

    const source = asset.source.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/");
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${asset.id}: download failed (${response.status}) ${source}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    console.log(`Downloaded ${asset.id} -> ${sourcePath}`);
  }
}

async function importAsset(asset) {
  if (asset.category === "model") return;
  const sourcePath = sourcePathFor(asset);
  const source = safeSourcePath(sourcePath);
  if (!existsSync(source)) {
    throw new Error(`${asset.id}: missing source ${sourcePath} in ${sourceRoot}`);
  }

  const destination = resolve(root, asset.derivedPath);
  await mkdir(dirname(destination), { recursive: true });
  if (asset.transform?.startsWith("sips")) {
    await execFileAsync("sips", ["-s", "format", "png", source, "--out", destination]);
  } else if (asset.transform?.startsWith("afconvert")) {
    await execFileAsync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", source, destination]);
  } else {
    await copyFile(source, destination);
  }
}

async function verifyAssets() {
  const failures = [];
  for (const asset of manifest) {
    const absolutePath = resolve(root, asset.derivedPath);
    if (!existsSync(absolutePath)) {
      failures.push(`${asset.id}: missing ${asset.derivedPath}`);
      continue;
    }

    const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
    if (digest !== asset.sha256) {
      failures.push(`${asset.id}: checksum ${digest} does not match ${asset.sha256}`);
    }
  }

  if (failures.length > 0) {
    console.error("DSi asset verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Verified ${manifest.length} DSi assets.`);
  }
}

try {
  if (shouldDownload) await downloadSources();
  if (shouldImport) {
    for (const asset of manifest) await importAsset(asset);
    console.log(`Imported ${manifest.filter((asset) => asset.category !== "model").length} source assets from ${sourceRoot}.`);
  }
  await verifyAssets();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
