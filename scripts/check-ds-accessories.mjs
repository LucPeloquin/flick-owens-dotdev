import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { getBounds, NodeIO } from "@gltf-transform/core";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "public/assets/ds/model/ds-lite-accessories.glb");
const dimensionsPath = path.join(root, "assets/ds/model/ds-lite-dimensions.json");
const spec = JSON.parse(readFileSync(dimensionsPath, "utf8"));
const info = await stat(file);
if (info.size > 250 * 1024) throw new Error(`Accessory GLB exceeds 250 KB: ${info.size}`);
const document = await new NodeIO().read(file);
const names = new Set(document.getRoot().listNodes().map((node) => node.getName()));
for (const required of ["nds_cartridge", "nds_label_panel", "gba_cartridge", "gba_label_panel"]) {
  if (!names.has(required)) throw new Error(`Accessory GLB is missing ${required}`);
}
if (document.getRoot().listTextures().length > 0) throw new Error("Accessory GLB must remain untextured");
const nodeByName = new Map(document.getRoot().listNodes().map((node) => [node.getName(), node]));
const metadataDimensions = (name, key, expected) => {
  const value = nodeByName.get(name)?.getExtras()?.[key];
  if (!Array.isArray(value) || value.length !== expected.length || value.some((entry, index) => Math.abs(entry - expected[index]) > 0.01)) {
    throw new Error(`${name} ${key} must be ${expected.join("×")} mm`);
  }
};
metadataDimensions("nds_cartridge", "dimensionsMm", spec.cartridges.nds.envelopeMm);
metadataDimensions("nds_cartridge", "insertionBodyMm", spec.cartridges.nds.insertionBodyMm);
metadataDimensions("nds_cartridge", "labelMm", spec.cartridges.nds.labelMm);
metadataDimensions("gba_cartridge", "dimensionsMm", spec.cartridges.gba.envelopeMm);
metadataDimensions("gba_cartridge", "insertionBodyMm", spec.cartridges.gba.insertionBodyMm);
for (const [name, cartridge] of [["nds_cartridge", spec.cartridges.nds], ["gba_cartridge", spec.cartridges.gba]]) {
  const extras = nodeByName.get(name)?.getExtras();
  if (extras?.labelFace !== "-Z" || extras?.contactFace !== "+Z") {
    throw new Error(`${name} must face its label toward the documented bottom of the DS Lite`);
  }
  if (extras?.gripEdge !== "+Y" || extras?.contactEdge !== "-Y") {
    throw new Error(`${name} must use +Y as the exposed grip edge and -Y as the contact edge`);
  }
  if (Math.abs((extras?.seatedProtrusionMm ?? Infinity) - cartridge.seatedProtrusionMm) > 0.01) {
    throw new Error(`${name} has incorrect seated protrusion metadata`);
  }
}
for (const name of ["nds_label_panel", "gba_label_panel"]) {
  const primitives = nodeByName.get(name)?.getMesh()?.listPrimitives() ?? [];
  if (primitives.length !== 1 || !primitives[0].getAttribute("TEXCOORD_0")) {
    throw new Error(`${name} must expose one UV-mapped presentation face`);
  }
}
const gbaEnvelope = nodeByName.get("gba_cartridge")?.getExtras()?.maximumGripEnvelopeMm;
if (!Array.isArray(gbaEnvelope) || gbaEnvelope.some((entry, index) => Math.abs(entry - spec.cartridges.gba.envelopeMm[index]) > 0.01)) {
  throw new Error("GBA cartridge is missing accurate grip envelope metadata");
}
const assertGeometryEnvelope = (name, expectedMm) => {
  const node = nodeByName.get(name);
  if (!node) throw new Error(`Missing ${name}`);
  const bounds = getBounds(node);
  const actualMm = bounds.max.map((value, index) => (
    value - bounds.min[index]
  ) / spec.calibration.sceneUnitsPerMm);
  if (actualMm.some((value, index) => Math.abs(value - expectedMm[index]) > 0.02)) {
    throw new Error(`${name} geometry is ${actualMm.map((value) => value.toFixed(3)).join("×")} mm; expected ${expectedMm.join("×")} mm`);
  }
};
assertGeometryEnvelope("nds_cartridge", spec.cartridges.nds.envelopeMm);
assertGeometryEnvelope("gba_cartridge", spec.cartridges.gba.envelopeMm);
const ndsLabelBounds = getBounds(nodeByName.get("nds_label_panel"));
const ndsLabelMm = [
  (ndsLabelBounds.max[0] - ndsLabelBounds.min[0]) / spec.calibration.sceneUnitsPerMm,
  (ndsLabelBounds.max[1] - ndsLabelBounds.min[1]) / spec.calibration.sceneUnitsPerMm,
];
if (ndsLabelMm.some((value, index) => Math.abs(value - spec.cartridges.nds.labelMm[index]) > 0.02)) {
  throw new Error(`DS label panel is ${ndsLabelMm.map((value) => value.toFixed(3)).join("×")} mm; expected ${spec.cartridges.nds.labelMm.join("×")} mm`);
}
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
