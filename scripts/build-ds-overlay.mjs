#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "assets/ds/overlays.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const args = new Set(process.argv.slice(2));
const shouldDownload = args.has("--download") || args.has("--import");
const rawPath = resolve(root, "assets/ds/raw/overlays/nintendo-ds-overlay-animated-light.png");
const outputPath = resolve(root, manifest.finalPath);

const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

if (!existsSync(rawPath) || shouldDownload) {
  const response = await fetch(manifest.directSource);
  if (!response.ok) throw new Error(`Overlay download failed (${response.status}): ${manifest.directSource}`);
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, Buffer.from(await response.arrayBuffer()));
}

await mkdir(dirname(outputPath), { recursive: true });
await sharp(rawPath)
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(outputPath);

manifest.sourceSha256 = await digest(rawPath);
manifest.finalSha256 = await digest(outputPath);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built ${manifest.finalPath} from the public LaunchBox overlay preview.`);
