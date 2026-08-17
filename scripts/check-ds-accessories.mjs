import { stat } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "public/assets/ds/model/ds-lite-accessories.glb");
const info = await stat(file);
if (info.size > 250 * 1024) throw new Error(`Accessory GLB exceeds 250 KB: ${info.size}`);
const document = await new NodeIO().read(file);
const names = new Set(document.getRoot().listNodes().map((node) => node.getName()));
for (const required of ["nds_cartridge", "nds_label_panel", "gba_cartridge", "gba_label_panel", "ds_lite_stylus", "stylus_retention_nib"]) {
  if (!names.has(required)) throw new Error(`Accessory GLB is missing ${required}`);
}
if (document.getRoot().listTextures().length > 0) throw new Error("Accessory GLB must remain untextured");
const nodeByName = new Map(document.getRoot().listNodes().map((node) => [node.getName(), node]));
const dimensions = (name, expected) => {
  const value = nodeByName.get(name)?.getExtras()?.dimensionsMm;
  if (!Array.isArray(value) || value.length !== expected.length || value.some((entry, index) => Math.abs(entry - expected[index]) > 0.01)) {
    throw new Error(`${name} dimensions must be ${expected.join("×")} mm`);
  }
};
dimensions("nds_cartridge", [33, 35, 3.8]);
dimensions("gba_cartridge", [57, 35, 8]);
dimensions("ds_lite_stylus", [87, 5]);
const gbaEnvelope = nodeByName.get("gba_cartridge")?.getExtras()?.maximumGripEnvelopeMm;
if (!Array.isArray(gbaEnvelope) || gbaEnvelope.length !== 3) throw new Error("GBA cartridge is missing its grip envelope metadata");
const contactCount = [...names].filter((name) => /^nds_contact_\d+$/.test(name)).length;
if (contactCount !== 17) throw new Error(`DS cartridge must have 17 rear contacts, found ${contactCount}`);
let triangles = 0;
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices();
    triangles += indices ? indices.getCount() / 3 : 0;
  }
}
if (triangles > 5000) throw new Error(`Accessory GLB exceeds 5,000 triangles: ${triangles}`);
console.log(`DS accessories OK: ${triangles} triangles, ${info.size} bytes`);
