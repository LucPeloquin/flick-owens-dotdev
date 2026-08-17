import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifestPath = path.join(root, "assets/ds/cartridges.json");
const publicRomDir = path.join(root, "public/roms");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cartridges)) {
  throw new Error("assets/ds/cartridges.json must use schemaVersion 1 and a cartridges array");
}

const ids = new Set();
const declaredPaths = new Set();
const text = (bytes, start, length) => new TextDecoder("ascii").decode(bytes.slice(start, start + length)).replace(/\0+$/, "").trim();
const validateNdsHeader = (bytes, entry) => {
  if (bytes.length < 0x200) throw new Error(`NDS ROM is shorter than its header: ${entry.id}`);
  const arm9Offset = bytes.readUInt32LE(0x20);
  const arm9Size = bytes.readUInt32LE(0x2c);
  const arm7Offset = bytes.readUInt32LE(0x30);
  const arm7Size = bytes.readUInt32LE(0x3c);
  if (arm9Offset < 0x200 || arm9Offset + arm9Size > bytes.length || arm7Offset < 0x200 || arm7Offset + arm7Size > bytes.length) {
    throw new Error(`NDS executable bounds are invalid: ${entry.id}`);
  }
  const identity = entry.header;
  if (text(bytes, 0, 12) !== identity.title || text(bytes, 0x0c, 4) !== identity.code) {
    throw new Error(`NDS header identity does not match the manifest: ${entry.id}`);
  }
};
const validateGbaHeader = (bytes, entry) => {
  if (bytes.length < 0xc0) throw new Error(`GBA ROM is shorter than its header: ${entry.id}`);
  const identity = entry.header;
  if (text(bytes, 0xa0, 12) !== identity.title || text(bytes, 0xac, 4) !== identity.code) {
    throw new Error(`GBA header identity does not match the manifest: ${entry.id}`);
  }
  let checksum = 0;
  for (let offset = 0xa0; offset <= 0xbc; offset += 1) checksum = (checksum - bytes[offset]) & 0xff;
  checksum = (checksum - 0x19) & 0xff;
  if (checksum !== bytes[0xbd]) throw new Error(`GBA header checksum is invalid: ${entry.id}`);
};
for (const entry of manifest.cartridges) {
  if (!entry || typeof entry !== "object") throw new Error("ROM manifest entries must be objects");
  for (const key of ["id", "system", "title", "rom", "provenance"]) {
    if (!(key in entry)) throw new Error(`ROM manifest entry is missing ${key}`);
  }
  if (ids.has(entry.id)) throw new Error(`Duplicate ROM id: ${entry.id}`);
  ids.add(entry.id);
  if (entry.system !== "nds" && entry.system !== "gba") throw new Error(`Invalid ROM system for ${entry.id}`);
  if (!/^[-a-z0-9]+$/.test(entry.id)) throw new Error(`ROM id must be URL-safe: ${entry.id}`);
  if (!entry.rom || !/^[a-f0-9]{64}\.(nds|gba)$/.test(entry.rom.path)) throw new Error(`ROM ${entry.id} must use a content-addressed SHA-256 filename`);
  if (entry.rom.path.includes("..") || path.isAbsolute(entry.rom.path)) throw new Error(`ROM path traversal for ${entry.id}`);
  if (!Number.isInteger(entry.rom.bytes) || entry.rom.bytes <= 0) throw new Error(`Invalid ROM byte length for ${entry.id}`);
  if (!/^[a-f0-9]{64}$/.test(entry.rom.sha256)) throw new Error(`Invalid ROM SHA-256 for ${entry.id}`);
  if (entry.rom.path.split(".")[0] !== entry.rom.sha256) throw new Error(`ROM filename/hash mismatch for ${entry.id}`);
  if (entry.rom.path.endsWith(".nds") !== (entry.system === "nds")) throw new Error(`ROM extension/system mismatch for ${entry.id}`);
  if (entry.rom.path.endsWith(".gba") !== (entry.system === "gba")) throw new Error(`ROM extension/system mismatch for ${entry.id}`);
  if (!Array.isArray(entry.provenance.authors) || entry.provenance.authors.length === 0 || !entry.provenance.redistributionAllowed || !entry.provenance.license || !entry.provenance.sourceUrl) {
    throw new Error(`ROM ${entry.id} needs authors, license, sourceUrl, and redistributionAllowed=true`);
  }
  if (!entry.header || typeof entry.header.title !== "string" || typeof entry.header.code !== "string") throw new Error(`ROM ${entry.id} needs a declared header title and code`);
  declaredPaths.add(entry.rom.path);
}

const files = await readdir(publicRomDir, { withFileTypes: true });
for (const file of files) {
  if (file.name === ".gitkeep" || file.name === "README.md") continue;
  const fullPath = path.join(publicRomDir, file.name);
  const stat = await lstat(fullPath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`ROM directory contains non-file: ${file.name}`);
  if (!/\.(nds|gba)$/i.test(file.name)) throw new Error(`Unexpected file in public/roms: ${file.name}`);
  if (!declaredPaths.has(file.name)) throw new Error(`Undeclared ROM in public/roms: ${file.name}`);
  const bytes = await readFile(fullPath);
  const entry = manifest.cartridges.find((candidate) => candidate.rom.path === file.name);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== entry.rom.bytes || hash !== entry.rom.sha256) throw new Error(`ROM hash/length mismatch: ${file.name}`);
  if (entry.system === "nds") validateNdsHeader(bytes, entry);
  else validateGbaHeader(bytes, entry);
}

console.log(`DS ROM manifest OK: ${manifest.cartridges.length} declared, ${files.filter((file) => /\.(nds|gba)$/i.test(file.name)).length} payloads`);
