import { mkdirSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const outputPath = path.join(root, "public/assets/ds/model/ds-lite-accessories.glb");
mkdirSync(path.dirname(outputPath), { recursive: true });

const doc = new Document();
const buffer = doc.createBuffer("AccessoryBuffer");
const scene = doc.createScene("AccessoryScene");
const materials = {
  graphite: doc.createMaterial("Graphite ABS").setBaseColorFactor([0.035, 0.04, 0.045, 1]).setRoughnessFactor(0.62),
  graphiteLight: doc.createMaterial("Graphite Edge").setBaseColorFactor([0.08, 0.085, 0.09, 1]).setRoughnessFactor(0.55),
  contact: doc.createMaterial("Contact Gold").setBaseColorFactor([0.52, 0.29, 0.08, 1]).setMetallicFactor(0.7).setRoughnessFactor(0.32),
  black: doc.createMaterial("Stylus Graphite").setBaseColorFactor([0.018, 0.02, 0.023, 1]).setRoughnessFactor(0.48),
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

function roundedBox(name, size, center, material, parent) {
  const node = cube(name, size, center, material, parent);
  node.setExtras({ rounded: true, bevelMm: 0.6 });
  return node;
}

function dsCartridge(parent) {
  const rootNode = doc.createNode("nds_cartridge");
  // Real Nintendo DS card: 33 x 35 x 3.8 mm. The accessory
  // geometry is authored in normalized scene units where
  // 1 unit ~= 37.7 mm (derived from the 62 mm LCD
  // spanning 1.643 world units), so the shell is
  // 0.876 x 0.928 x 0.101 units = 33 x 35 x 3.8 mm.
  rootNode.setExtras({ dimensionsMm: [33, 35, 3.8], source: "littlengvfx CC BY 4.0 adapted; blank geometry and labels removed" });
  parent.addChild(rootNode);
  roundedBox("nds_shell_front", [0.876, 0.928, 0.101], [0, 0, 0], materials.graphite, rootNode);
  roundedBox("nds_label_panel", [0.654, 0.523, 0.0065], [0, 0, 0.053], materials.graphiteLight, rootNode);
  // The back is intentionally exaggerated enough to read at web scale while
  // retaining the 17-contact rhythm of a real DS card.
  for (let i = 0; i < 17; i += 1) {
    const x = -0.305 + (i / 16) * 0.610;
    cube(`nds_contact_${String(i + 1).padStart(2, "0")}`, [0.0196, 0.240, 0.0086], [x, -0.175, -0.055], materials.contact, rootNode);
    if (i < 16) {
      cube(`nds_contact_rib_${String(i + 1).padStart(2, "0")}`, [0.0065, 0.251, 0.013], [x + 0.019, -0.175, -0.060], materials.graphiteLight, rootNode);
    }
  }
  cube("nds_contact_bay", [0.719, 0.305, 0.0086], [0, -0.163, -0.054], materials.graphiteLight, rootNode);
  // Small stepped shoulders stand in for the asymmetric latch notches and
  // insertion guide visible on a real DS card without adding a texture.
  cube("nds_latch_notch_left", [0.076, 0.131, 0.019], [-0.403, -0.283, 0], materials.graphiteLight, rootNode);
  cube("nds_latch_notch_right", [0.054, 0.087, 0.019], [0.408, -0.240, 0], materials.graphiteLight, rootNode);
  cube("nds_insertion_shoulder", [0.588, 0.038, 0.019], [0, 0.441, 0], materials.graphiteLight, rootNode);
  return rootNode;
}

function gbaCartridge(parent) {
  const rootNode = doc.createNode("gba_cartridge");
  // Real Game Boy Advance cartridge: 57 x 35 x 8 mm.
  // 1 unit ~= 37.7 mm, so the shell is
  // 1.511 x 0.928 x 0.212 units = 57 x 35 x 8 mm.
  rootNode.setExtras({ dimensionsMm: [57, 35, 8], maximumGripEnvelopeMm: [60, 35, 9], source: "Vxcl CC BY 4.0 adapted; Mario Kart artwork and branding removed" });
  parent.addChild(rootNode);
  roundedBox("gba_shell_front", [1.511, 0.928, 0.212], [0, 0, 0], materials.graphite, rootNode);
  roundedBox("gba_label_panel", [1.067, 0.577, 0.0087], [0, 0.033, 0.105], materials.graphiteLight, rootNode);
  cube("gba_grip_lip", [1.589, 0.142, 0.236], [0, 0.393, 0], materials.graphiteLight, rootNode);
  cube("gba_shell_seam", [1.415, 0.020, 0.013], [0, -0.393, 0.112], materials.graphiteLight, rootNode);
  cube("gba_contact_mouth", [1.089, 0.044, 0.013], [0, -0.425, -0.109], materials.contact, rootNode);
  return rootNode;
}

const rootNode = doc.createNode("ds_lite_accessories");
scene.addChild(rootNode);
dsCartridge(rootNode);
gbaCartridge(rootNode);

await new NodeIO().write(outputPath, doc);
console.log(JSON.stringify({ outputPath, trianglesBudget: 5000, bytesBudget: 250 * 1024 }, null, 2));
