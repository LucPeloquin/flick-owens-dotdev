#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "assets/ds/crops.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

for (const [id, region] of Object.entries(manifest.regions)) {
  const source = resolve(root, region.source);
  const output = resolve(root, region.output);
  await mkdir(dirname(output), { recursive: true });
  await sharp(source)
    .extract({ left: region.x, top: region.y, width: region.width, height: region.height })
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);
  const metadata = await sharp(output).metadata();
  if (metadata.width !== region.width || metadata.height !== region.height) {
    throw new Error(`${id}: expected ${region.width}x${region.height}, got ${metadata.width}x${metadata.height}`);
  }
  region.sha256 = createHash("sha256").update(await readFile(output)).digest("hex");
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built and verified ${Object.keys(manifest.regions).length} DS crop assets.`);
