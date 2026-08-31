import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const outputPath = path.join(root, "public/assets/ds/model/ds-lite-accessories.glb");
const dimensionsPath = path.join(root, "assets/ds/model/ds-lite-dimensions.json");
const dimensions = JSON.parse(readFileSync(dimensionsPath, "utf8"));
const mm = (value) => value * dimensions.calibration.sceneUnitsPerMm;
mkdirSync(path.dirname(outputPath), { recursive: true });

const doc = new Document();
const buffer = doc.createBuffer("AccessoryBuffer");
const scene = doc.createScene("AccessoryScene");
const materials = {
  graphite: doc.createMaterial("Graphite ABS").setBaseColorFactor([0.035, 0.04, 0.045, 1]).setRoughnessFactor(0.62),
  graphiteLight: doc.createMaterial("Graphite Edge").setBaseColorFactor([0.08, 0.085, 0.09, 1]).setRoughnessFactor(0.55),
  contact: doc.createMaterial("Contact Gold").setBaseColorFactor([0.52, 0.29, 0.08, 1]).setMetallicFactor(0.7).setRoughnessFactor(0.32),
};

function meshNode(name, positions, indices, material, parent, uvs = null) {
  const position = doc.createAccessor(`${name}_POSITION`, buffer).setType("VEC3").setArray(new Float32Array(positions));
  const index = doc.createAccessor(`${name}_INDEX`, buffer).setType("SCALAR").setArray(new Uint32Array(indices));
  const primitive = doc.createPrimitive().setAttribute("POSITION", position).setIndices(index).setMaterial(material);
  if (uvs) primitive.setAttribute("TEXCOORD_0", doc.createAccessor(`${name}_UV`, buffer).setType("VEC2").setArray(new Float32Array(uvs)));
  const mesh = doc.createMesh(name).addPrimitive(primitive);
  const node = doc.createNode(name).setMesh(mesh);
  parent.addChild(node);
  return node;
}

function cube(name, size, center, material, parent) {
  const [sx, sy, sz] = size.map((v) => v / 2);
  const [cx, cy, cz] = center;
  const positions = [
    cx-sx,cy-sy,cz-sz, cx+sx,cy-sy,cz-sz, cx+sx,cy+sy,cz-sz, cx-sx,cy+sy,cz-sz,
    cx-sx,cy-sy,cz+sz, cx+sx,cy-sy,cz+sz, cx+sx,cy+sy,cz+sz, cx-sx,cy+sy,cz+sz,
  ];
  const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3];
  return meshNode(name, positions, indices, material, parent);
}

function quad(name, size, center, material, parent) {
  const [sx, sy] = size.map((value) => value / 2);
  const [cx, cy, cz] = center;
  const positions = [
    cx - sx, cy - sy, cz,
    cx + sx, cy - sy, cz,
    cx + sx, cy + sy, cz,
    cx - sx, cy + sy, cz,
  ];
  // Clockwise winding makes the presentation face point toward local -Z,
  // matching the documented label face on both cartridge formats.
  const indices = [0, 2, 1, 0, 3, 2];
  // A -Z presentation face is viewed through a half-turn at runtime. Reverse
  // U in the authored surface so printed labels remain readable rather than
  // appearing mirrored when that face is presented to the camera.
  const uvs = [1, 0, 0, 0, 0, 1, 1, 1];
  return meshNode(name, positions, indices, material, parent, uvs);
}

function prism(name, outline, thickness, material, parent) {
  const halfThickness = thickness / 2;
  const positions = [
    ...outline.flatMap(([x, y]) => [x, y, halfThickness]),
    ...outline.flatMap(([x, y]) => [x, y, -halfThickness]),
  ];
  const indices = [];
  const count = outline.length;
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index, index + 1);
    indices.push(count, count + index + 1, count + index);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  return meshNode(name, positions, indices, material, parent);
}

function chamferedOutline(widthMm, heightMm, chamferMm) {
  const halfWidth = mm(widthMm / 2);
  const halfHeight = mm(heightMm / 2);
  const chamfer = mm(chamferMm);
  return [
    [-halfWidth + chamfer, -halfHeight],
    [halfWidth - chamfer, -halfHeight],
    [halfWidth, -halfHeight + chamfer],
    [halfWidth, halfHeight - chamfer],
    [halfWidth - chamfer, halfHeight],
    [-halfWidth + chamfer, halfHeight],
    [-halfWidth, halfHeight - chamfer],
    [-halfWidth, -halfHeight + chamfer],
  ];
}

function dsCartridgeOutline(widthMm, heightMm, keyedCornerChamferMm) {
  const halfWidth = mm(widthMm / 2);
  const halfHeight = mm(heightMm / 2);
  const corner = mm(0.8);
  const key = mm(keyedCornerChamferMm);
  return [
    [-halfWidth + corner, -halfHeight],
    [halfWidth - key, -halfHeight],
    [halfWidth, -halfHeight + key],
    [halfWidth, halfHeight - corner],
    [halfWidth - corner, halfHeight],
    [-halfWidth + corner, halfHeight],
    [-halfWidth, halfHeight - corner],
    [-halfWidth, -halfHeight + corner],
  ];
}

function dsCartridge(parent) {
  const rootNode = doc.createNode("nds_cartridge");
  const spec = dimensions.cartridges.nds;
  // The accessory GLB shares the normalized console's physical scale. The
  // renderer applies the same outer presentation scale to detached carts at
  // runtime, so 33 mm remains 33/133 of the DS Lite's official body width.
  rootNode.setExtras({
    dimensionsMm: spec.envelopeMm,
    insertionBodyMm: spec.insertionBodyMm,
    labelMm: spec.labelMm,
    seatedProtrusionMm: spec.seatedProtrusionMm,
    sceneUnitsPerMm: dimensions.calibration.sceneUnitsPerMm,
    gripEdge: "+Y",
    contactEdge: "-Y",
    labelFace: "-Z",
    contactFace: "+Z",
    sources: [dimensions.references.ndsCard, dimensions.references.ndsLabel, dimensions.references.ndsInsertion, dimensions.references.console],
  });
  parent.addChild(rootNode);

  prism("nds_shell_front", dsCartridgeOutline(33, 35, spec.keyedCornerChamferMm), mm(3.76), materials.graphite, rootNode);
  // Thin edge rails bring the physical envelope to exactly 3.8 mm without
  // allowing decorative face details to make the card thicker than spec.
  cube("nds_edge_left", [mm(0.6), mm(33.4), mm(3.8)], [mm(-16.2), 0, 0], materials.graphite, rootNode);
  cube("nds_edge_right", [mm(0.6), mm(30.6), mm(3.8)], [mm(16.2), mm(1.4), 0], materials.graphite, rootNode);
  // Complete the exposed +Y grip edge with a readable top cap. It replaces
  // no volume and stays inside the exact 33 x 35 x 3.8 mm envelope; the
  // slightly lighter ABS is only a shading break so the 3.8 mm edge does not
  // disappear against a dark SLOT-1 mouth or a head-on library view.
  cube("nds_grip_cap", [mm(31.4), mm(1.1), mm(3.8)], [0, mm(16.95), 0], materials.graphiteLight, rootNode);
  cube("nds_insertion_shoulder", [mm(28.3), mm(0.7), mm(3.8)], [mm(-1.55), mm(-17.15), 0], materials.graphiteLight, rootNode);
  cube("nds_label_recess", [mm(26.6), mm(31.1), mm(0.02)], [0, mm(0.2), mm(-1.89)], materials.graphiteLight, rootNode);
  quad("nds_label_panel", [mm(spec.labelMm[0]), mm(spec.labelMm[1])], [0, mm(0.2), mm(-1.9)], materials.graphiteLight, rootNode);
  cube("nds_contact_bay", [mm(27.2), mm(11.5), mm(0.04)], [0, mm(-5.9), mm(1.88)], materials.graphiteLight, rootNode);

  // A real DS card exposes 17 rear contacts. Their pitch is modeled inside
  // the measured envelope rather than protruding beyond the 3.8 mm shell.
  for (let i = 0; i < 17; i += 1) {
    const x = mm(-11.84 + i * 1.48);
    cube(`nds_contact_${String(i + 1).padStart(2, "0")}`, [mm(0.72), mm(9.1), mm(0.045)], [x, mm(-6.45), mm(1.8775)], materials.contact, rootNode);
    if (i < 16) {
      cube(`nds_contact_rib_${String(i + 1).padStart(2, "0")}`, [mm(0.24), mm(9.5), mm(0.05)], [x + mm(0.74), mm(-6.45), mm(1.875)], materials.graphite, rootNode);
    }
  }
  // Asymmetric side guides remain inside the 33 mm maximum width.
  cube("nds_latch_notch_left", [mm(1.25), mm(4.9), mm(0.42)], [mm(-15.72), mm(-10.7), 0], materials.graphiteLight, rootNode);
  cube("nds_latch_notch_right", [mm(0.9), mm(3.3), mm(0.42)], [mm(15.9), mm(-9.7), 0], materials.graphiteLight, rootNode);
  return rootNode;
}

function gbaCartridge(parent) {
  const rootNode = doc.createNode("gba_cartridge");
  const spec = dimensions.cartridges.gba;
  // Measured references differ because one describes the insertion body
  // (about 57 x 34 x 8 mm) while the other includes the wider, thicker finger
  // grip. Preserve both: the root bounds are the full 60 x 34 x 9 mm envelope
  // and Slot-2 is sized against the narrower insertion body.
  rootNode.setExtras({
    dimensionsMm: spec.envelopeMm,
    insertionBodyMm: spec.insertionBodyMm,
    seatedProtrusionMm: spec.seatedProtrusionMm,
    maximumGripEnvelopeMm: spec.envelopeMm,
    sceneUnitsPerMm: dimensions.calibration.sceneUnitsPerMm,
    gripEdge: "+Y",
    contactEdge: "-Y",
    labelFace: "-Z",
    contactFace: "+Z",
    sources: [
      dimensions.references.gbaBody,
      dimensions.references.gbaEnvelope,
      dimensions.references.gbaInsertion,
      dimensions.references.gbaProtrusion,
      dimensions.references.console,
    ],
  });
  parent.addChild(rootNode);
  prism("gba_shell_front", chamferedOutline(57, 34, 0.9), mm(8), materials.graphite, rootNode);
  // The 5.2 mm tall pull lip occupies the exposed +Y edge. Its 60 mm width
  // and 9 mm thickness define the cartridge's maximum external envelope.
  cube("gba_grip_lip", [mm(60), mm(5.2), mm(9)], [0, mm(14.4), 0], materials.graphiteLight, rootNode);
  quad("gba_label_panel", [mm(40.2), mm(21.8)], [0, mm(1.2), mm(-4.02)], materials.graphiteLight, rootNode);
  cube("gba_shell_seam", [mm(53.4), mm(0.6), mm(0.3)], [0, mm(-13.9), mm(3.85)], materials.graphiteLight, rootNode);
  cube("gba_contact_mouth", [mm(41), mm(1.7), mm(0.3)], [0, mm(-16.0), mm(3.85)], materials.contact, rootNode);
  return rootNode;
}

const rootNode = doc.createNode("ds_lite_accessories");
scene.addChild(rootNode);
dsCartridge(rootNode);
gbaCartridge(rootNode);

await new NodeIO().write(outputPath, doc);
console.log(JSON.stringify({ outputPath, trianglesBudget: 5000, bytesBudget: 250 * 1024 }, null, 2));
