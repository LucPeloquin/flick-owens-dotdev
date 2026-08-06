#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "assets/ds/motion.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const shouldDownload = process.argv.includes("--download");

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function ensureSource(entry) {
  const rawPath = resolve(root, entry.rawPath);
  if (!existsSync(rawPath) || shouldDownload) {
    const response = await fetch(entry.sourceUrl);
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${entry.sourceUrl}`);
    await mkdir(dirname(rawPath), { recursive: true });
    await writeFile(rawPath, Buffer.from(await response.arrayBuffer()));
  }
  return { rawPath, buffer: await readFile(rawPath) };
}

async function buildAtlas(entry, frameLimit = null) {
  const { rawPath, buffer } = await ensureSource(entry);
  const sourceMetadata = await sharp(buffer, { animated: true }).metadata();
  if (!sourceMetadata.pages || !sourceMetadata.pageHeight || !sourceMetadata.width || !sourceMetadata.height) {
    throw new Error(`${entry.id}: source is not an animated raster`);
  }
  const pageHeight = sourceMetadata.pageHeight;
  const frameCount = frameLimit ?? sourceMetadata.pages;
  const strip = await sharp(buffer, { animated: true }).png().toBuffer();
  const columns = 8;
  const rows = Math.ceil(frameCount / columns);
  const atlasWidth = sourceMetadata.width * columns;
  const atlasHeight = pageHeight * rows;
  const layers = [];
  const delays = (sourceMetadata.delay ?? []).slice(0, frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameBuffer = await sharp(strip)
      .extract({ left: 0, top: frame * pageHeight, width: sourceMetadata.width, height: pageHeight })
      .png()
      .toBuffer();
    layers.push({ input: frameBuffer, left: (frame % columns) * sourceMetadata.width, top: Math.floor(frame / columns) * pageHeight });
  }
  const atlas = await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(layers).png({ compressionLevel: 9, palette: true }).toBuffer();
  const output = resolve(root, entry.output);
  const timingOutput = resolve(root, entry.timingOutput);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, atlas);
  await writeFile(timingOutput, `${JSON.stringify({
    id: entry.id,
    revision: manifest.revision,
    width: sourceMetadata.width,
    height: pageHeight,
    columns,
    rows,
    frameCount,
    delays,
    totalDurationMs: delays.reduce((sum, delay) => sum + delay, 0),
    sourceSha256: digest(buffer),
    atlasSha256: digest(atlas),
    finalFrame: frameCount - 1,
  }, null, 2)}\n`);
  return { entry: entry.id, rawPath, frames: frameCount, atlasBytes: atlas.length };
}

const results = [];
results.push(await buildAtlas(manifest.sources.splash, 111));
results.push(await buildAtlas(manifest.sources.health));
for (const sprite of manifest.sprites) {
  const { buffer } = await ensureSource(sprite);
  const output = resolve(root, sprite.output);
  await mkdir(dirname(output), { recursive: true });
  const sourceMetadata = await sharp(buffer).metadata();
  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < raw.data.length; index += 4) {
    if (raw.data[index] === 255 && raw.data[index + 1] === 0 && raw.data[index + 2] === 255) raw.data[index + 3] = 0;
  }
  const curated = await sharp(raw.data, {
    raw: { width: sourceMetadata.width, height: sourceMetadata.height, channels: 4 },
  }).png({ compressionLevel: 9, palette: true }).toBuffer();
  await writeFile(output, curated);
  sprite.sha256 = digest(curated);
  results.push({ entry: sprite.id, bytes: curated.length });
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
