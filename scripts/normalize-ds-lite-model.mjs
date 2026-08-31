import { mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import * as THREE from "three";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sourcePath = path.join(root, "assets/ds/model/ds-lite.source.glb");
const outputPath = path.join(root, "public/assets/ds/model/ds-lite-crimson.glb");
const dimensionsPath = path.join(root, "assets/ds/model/ds-lite-dimensions.json");
const dimensions = JSON.parse(readFileSync(dimensionsPath, "utf8"));
const OPENING_SECONDS = 0.65;

if (!existsSync(sourcePath)) {
  throw new Error(`Missing source GLB: ${sourcePath}`);
}

mkdirSync(path.dirname(outputPath), { recursive: true });

const document = await new NodeIO().read(sourcePath);
const rootNode = document.getRoot();
const nodes = new Map(rootNode.listNodes().map((node) => [node.getName(), node]));
const geometryBuffer = rootNode.listBuffers()[0] ?? document.createBuffer("NormalizedGeometryBuffer");
const LID_CLOSED_Y_OFFSET = 0;
const LID_CLOSED_Z_OFFSET = 0;
// The source's canonical open pose already stands above the deck. In local
// hinge coordinates, folding that pose onto the bottom shell is a quarter turn;
// the visible clamshell action still flips the outer face through 180° to the
// inner-screen pose.
const CLOSED_HINGE_RADIANS = Math.PI / 2;
// The downloaded model's authored open pose sits about 92° above the deck.
// Continue the same hinge rotation by roughly 82° so the screen planes finish
// around 170° open, leaving the small real-hardware tilt the DS Lite has.
const OPEN_HINGE_RADIANS = -82 * Math.PI / 180;

const requireNode = (name) => {
  const node = nodes.get(name);
  if (!node) throw new Error(`The source GLB is missing the expected node: ${name}`);
  return node;
};

const createMeshNode = (name, positions, indices, material, parent) => {
  const position = document.createAccessor(`${name}_POSITION`, geometryBuffer)
    .setType("VEC3")
    .setArray(new Float32Array(positions));
  const index = document.createAccessor(`${name}_INDEX`, geometryBuffer)
    .setType("SCALAR")
    .setArray(new Uint32Array(indices));
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", position)
    .setIndices(index)
    .setMaterial(material);
  const mesh = document.createMesh(name).addPrimitive(primitive);
  const node = document.createNode(name).setMesh(mesh);
  parent.addChild(node);
  return node;
};

const createCubeNode = (name, size, center, material, parent) => {
  const [sx, sy, sz] = size.map((value) => value / 2);
  const [cx, cy, cz] = center;
  const positions = [
    cx-sx,cy-sy,cz-sz, cx+sx,cy-sy,cz-sz, cx+sx,cy+sy,cz-sz, cx-sx,cy+sy,cz-sz,
    cx-sx,cy-sy,cz+sz, cx+sx,cy-sy,cz+sz, cx+sx,cy+sy,cz+sz, cx-sx,cy+sy,cz+sz,
  ];
  const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3];
  return createMeshNode(name, positions, indices, material, parent);
};

requireNode("Sketchfab_model").setName("device_root");
const base = requireNode("RootNode").setName("base");
const lidMesh = requireNode("Cube.045").setName("lid_mesh");
requireNode("Cube.048").setName("screen_top");
requireNode("Cube.047").setName("screen_bottom");
requireNode("Sphere.008").setName("power_switch");
// Promote the authored control meshes to the stable semantic names consumed
// by the runtime. The legacy names are intentionally not part of the
// production contract; they were only useful while auditing the download.
const semanticButtonSources = {
  button_a: "Cylinder.004",
  button_b: "Cylinder.001",
  button_x: "Cylinder.003",
  button_y: "Cylinder.002",
  button_dpad: "Cube.006",
};
for (const [semanticName, sourceName] of Object.entries(semanticButtonSources)) {
  requireNode(sourceName).setName(semanticName);
}
// The source asset has no separate meshes for shoulders/start/select. Keep
// their semantic anchors in the contract so keyboard/DOM controls and a
// future higher-detail model can share the same names without another schema
// migration.
for (const semanticName of ["button_l", "button_r", "button_start", "button_select"]) {
  const semanticNode = document.createNode(semanticName)
    .setExtras({ semanticControl: semanticName.replace("button_", "") })
    .setTranslation([0, 0, 0]);
  base.addChild(semanticNode);
}
const slot1CartridgeSource = requireNode("Cube.033");
const slot1CartridgeFragmentSource = requireNode("Cube.035");
const slot2CoverSource = requireNode("Cube.015");
const lowerShell = requireNode("Cube");
const lowerShellSurface = requireNode("Cube_Material_0");
const topScreenSurface = nodes.get("Cube.048_Tela_0");
const bottomScreenSurface = nodes.get("Cube.047_Tela_0");
topScreenSurface?.setName("screen_top_surface");
bottomScreenSurface?.setName("screen_bottom_surface");

// The downloaded GLB packs these two faces into an atlas. ROM framebuffers
// need a stable 0–1 surface so pointer UVs and DataTextures map directly to
// the rendered screen instead of sampling unrelated chrome.
function normalizeScreenUv(node, label) {
  const primitive = node?.getMesh()?.listPrimitives()[0];
  const positions = primitive?.getAttribute("POSITION")?.getArray();
  if (!primitive || !positions) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    maxX = Math.max(maxX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    maxY = Math.max(maxY, positions[index + 1]);
  }
  const uv = [];
  for (let index = 0; index < positions.length; index += 3) {
    uv.push((positions[index] - minX) / Math.max(1e-6, maxX - minX));
    uv.push((positions[index + 1] - minY) / Math.max(1e-6, maxY - minY));
  }
  primitive.setAttribute("TEXCOORD_0", document.createAccessor(`${label}_UV`).setType("VEC2").setArray(new Float32Array(uv)));
}
normalizeScreenUv(topScreenSurface, "ScreenTopSurface");
normalizeScreenUv(bottomScreenSurface, "ScreenBottomSurface");

// The source is exported in an already-open pose. The lid helper's origin is
// the actual hinge center, in the source RootNode's unscaled space; the
// Sketchfab wrapper scales it to a compact ~3.2-unit-wide device at runtime.
// Keep the authored hinge orientation so the local X axis is the real
// left-to-right hinge barrel. The closed pose then becomes a true 180° fold
// around the hardware joint instead of a detached screen translation.
const sourceHinge = requireNode("Sphere.003");
const hingePivot = sourceHinge.getTranslation();
const hingeRotation = sourceHinge.getRotation();

const relativeMatrix = (node, ancestor) => {
  const chain = [];
  let current = node;
  while (current && current !== ancestor) {
    chain.unshift(current);
    current = current.getParentNode();
  }
  if (current !== ancestor) throw new Error(`Could not resolve ${node.getName()} relative to ${ancestor.getName()}`);
  return chain.reduce(
    (matrix, item) => matrix.multiply(new THREE.Matrix4().fromArray(item.getMatrix())),
    new THREE.Matrix4(),
  );
};

const hinge = document
  .createNode("hinge")
  .setTranslation(hingePivot)
  .setRotation(hingeRotation);
const lid = document.createNode("lid").setTranslation([0, LID_CLOSED_Y_OFFSET, LID_CLOSED_Z_OFFSET]);
base.addChild(hinge);
hinge.addChild(lid);

// Preserve the authored open pose after inserting the hinge pivot. Only the
// upper-shell subtree changes parents; the source hinge barrel remains fixed
// on the base. Use the complete source matrix here because the upper shell was
// nested under a scaled/rotated Sketchfab helper in the download.
const sourceLidMatrix = relativeMatrix(lidMesh, base);
lidMesh.getParentNode()?.removeChild(lidMesh);
const hingeMatrix = new THREE.Matrix4().compose(
  new THREE.Vector3(...hingePivot),
  new THREE.Quaternion(...hingeRotation),
  new THREE.Vector3(1, 1, 1),
);
const lidLocalMatrix = hingeMatrix.invert().multiply(sourceLidMatrix);
lidMesh.setMatrix(lidLocalMatrix.toArray());
lid.addChild(lidMesh);

const addAnchor = (name, translation, parent = base) => {
  const anchor = document.createNode(name).setTranslation([...translation]);
  parent.addChild(anchor);
  return anchor;
};

const placeRemovableAtAnchor = (source, anchor, removableName) => {
  const parent = source.getParentNode();
  if (parent !== base) throw new Error(`${source.getName()} must be a direct child of base before normalization`);

  // Keep the source dust cover in its authored pose while moving it under the
  // new mouth-centered anchor. The runtime hides this legacy cover whenever a
  // full GBA accessory is present, but the normalized node contract retains it.
  const sourceMatrix = new THREE.Matrix4().fromArray(source.getMatrix());
  const anchorMatrix = new THREE.Matrix4().fromArray(anchor.getMatrix());
  const localMatrix = anchorMatrix.clone().invert().multiply(sourceMatrix);
  parent.removeChild(source);
  source
    .setName(removableName)
    .setMatrix(localMatrix.toArray());
  anchor.addChild(source);
  return source;
};

// Calibrate all hardware geometry from Nintendo's official 133 mm DS Lite
// width. The source lower-shell mesh is the widest console surface and is
// therefore the stable local basis for the two cartridge mouths.
const shellPositions = lowerShellSurface.getMesh()?.listPrimitives()[0]
  ?.getAttribute("POSITION")?.getArray();
if (!shellPositions) throw new Error("The lower shell is missing position data");
let shellMinY = Infinity;
let shellMaxY = -Infinity;
for (let index = 0; index < shellPositions.length; index += 3) {
  shellMinY = Math.min(shellMinY, shellPositions[index + 1]);
  shellMaxY = Math.max(shellMaxY, shellPositions[index + 1]);
}
const shellWorldScale = new THREE.Vector3();
new THREE.Matrix4().fromArray(lowerShell.getWorldMatrix()).decompose(
  new THREE.Vector3(),
  new THREE.Quaternion(),
  shellWorldScale,
);
const shellLocalUnitsPerMm = dimensions.calibration.sceneUnitsPerMm / shellWorldScale.x;
const shellMm = (value) => value * shellLocalUnitsPerMm;
const slotCavity = document
  .createMaterial("SlotCavity")
  .setBaseColorFactor([0.004, 0.005, 0.007, 1])
  .setRoughnessFactor(0.82)
  .setMetallicFactor(0);
const installedCardEdge = document
  .createMaterial("InstalledGameCardEdge")
  .setBaseColorFactor([0.045, 0.05, 0.055, 1])
  .setRoughnessFactor(0.62)
  .setMetallicFactor(0.02);
const cavityDepth = shellMm(dimensions.slotCavityDepthMm);
const surfaceOverlap = shellMm(0.08);
const slot1Center = [0, shellMaxY - cavityDepth / 2 + surfaceOverlap, -0.0526380835811172];
const slot2Center = [0, shellMinY + cavityDepth / 2 - surfaceOverlap, 0];
const slot1Opening = createCubeNode(
  "slot1_opening",
  [shellMm(dimensions.cartridges.nds.slotOpeningMm[0]), cavityDepth, shellMm(dimensions.cartridges.nds.slotOpeningMm[1])],
  [0, 0, 0],
  slotCavity,
  lowerShell,
).setTranslation(slot1Center).setExtras({
  openingMm: dimensions.cartridges.nds.slotOpeningMm,
  clearancePerSideMm: dimensions.slotClearancePerSideMm,
  fitsBodyMm: dimensions.cartridges.nds.insertionBodyMm,
  derivedTolerance: true,
});
const slot2Opening = createCubeNode(
  "slot2_opening",
  [shellMm(dimensions.cartridges.gba.slotOpeningMm[0]), cavityDepth, shellMm(dimensions.cartridges.gba.slotOpeningMm[1])],
  [0, 0, 0],
  slotCavity,
  lowerShell,
).setTranslation(slot2Center).setExtras({
  openingMm: dimensions.cartridges.gba.slotOpeningMm,
  clearancePerSideMm: dimensions.slotClearancePerSideMm,
  fitsBodyMm: dimensions.cartridges.gba.insertionBodyMm,
  derivedTolerance: true,
});

// The source shell is not boolean-cut at SLOT-1, so the seated accessory is
// depth-occluded even though its complete 33 mm body is correctly aligned.
// Author the real 0.8 mm exposed push lip directly over the mouth: it uses the
// measured 33 x 3.8 mm cartridge cross-section and overlaps the shell by only
// 0.08 mm to avoid a floating seam.
const slot1InstalledLipDepth = shellMm(dimensions.cartridges.nds.seatedProtrusionMm);
createCubeNode(
  "slot1_installed_lip",
  [
    shellMm(dimensions.cartridges.nds.insertionBodyMm[0]),
    slot1InstalledLipDepth,
    shellMm(dimensions.cartridges.nds.insertionBodyMm[2]),
  ],
  [0, 0, 0],
  installedCardEdge,
  lowerShell,
).setTranslation([
  0,
  shellMaxY + slot1InstalledLipDepth / 2 - surfaceOverlap,
  slot1Center[2],
]).setExtras({
  dimensionsMm: [
    dimensions.cartridges.nds.insertionBodyMm[0],
    dimensions.cartridges.nds.seatedProtrusionMm,
    dimensions.cartridges.nds.insertionBodyMm[2],
  ],
  fillsOpeningNode: slot1Opening.getName(),
  visualRole: "installed-cartridge-push-lip",
});
// Mirror the part of the cartridge face that a real shell cutout would reveal
// through the 2 mm visual cavity. This thin surface follows the label side of
// the measured 3.8 mm card envelope, with a 0.12 mm render offset that clears
// the source shell's uncut surface; it does not change the cartridge size.
const installedFaceThickness = shellMm(0.12);
const installedFaceRenderOffset = shellMm(0.12);
createCubeNode(
  "slot1_installed_face",
  [
    shellMm(dimensions.cartridges.nds.insertionBodyMm[0]),
    cavityDepth,
    installedFaceThickness,
  ],
  [0, 0, 0],
  installedCardEdge,
  lowerShell,
).setTranslation([
  0,
  slot1Center[1],
  slot1Center[2]
    - shellMm(dimensions.cartridges.nds.insertionBodyMm[2] / 2)
    - installedFaceThickness / 2
    - installedFaceRenderOffset,
]).setExtras({
  dimensionsMm: [
    dimensions.cartridges.nds.insertionBodyMm[0],
    dimensions.slotCavityDepthMm,
    0.12,
  ],
  renderOffsetMm: 0.12,
  fillsOpeningNode: slot1Opening.getName(),
  visualRole: "installed-cartridge-visible-face",
});

const shellMatrix = new THREE.Matrix4().fromArray(lowerShell.getMatrix());
const shellRotation = [...lowerShell.getRotation()];
const shellPointInBase = ([x, y, z]) => new THREE.Vector3(x, y, z)
  .applyMatrix4(shellMatrix)
  .toArray();
const createSlotAnchor = (name, shellPoint, extras) => {
  const anchor = document.createNode(name)
    .setTranslation(shellPointInBase(shellPoint))
    .setRotation(shellRotation)
    .setExtras(extras);
  base.addChild(anchor);
  return anchor;
};
const slot1Anchor = createSlotAnchor("slot1_anchor", [0, shellMaxY, slot1Center[2]], {
  openingNode: slot1Opening.getName(),
  openingMm: dimensions.cartridges.nds.slotOpeningMm,
  insertionBodyMm: dimensions.cartridges.nds.insertionBodyMm,
  ejectionAxis: "+Y",
});
const slot2Anchor = createSlotAnchor("slot2_anchor", [0, shellMinY, slot2Center[2]], {
  openingNode: slot2Opening.getName(),
  openingMm: dimensions.cartridges.gba.slotOpeningMm,
  insertionBodyMm: dimensions.cartridges.gba.insertionBodyMm,
  ejectionAxis: "-Y",
});

const disposeNodeTree = (source) => {
  const descendants = [];
  source.traverse((node) => descendants.push(node));
  source.getParentNode()?.removeChild(source);
  for (const node of descendants.reverse()) {
    node.getMesh()?.dispose();
    node.dispose();
  }
};

// Slot-1's tiny source mesh is only an exposed stub, not a full game card.
// Remove it entirely; the calibrated accessory bundle owns the removable card.
disposeNodeTree(slot1CartridgeSource);
// Cube.035 is a narrow grip fragment authored as a separate object inside the
// original Slot-1 placeholder. Keeping it after removing Cube.033 leaves a
// small black bar protruding from one side of the otherwise-correct opening.
disposeNodeTree(slot1CartridgeFragmentSource);
placeRemovableAtAnchor(slot2CoverSource, slot2Anchor, "slot2_cover");

// The prompt points sit just outside the exposed rear/front edges in base-local
// coordinates. They are empty markers for the pulsing affordances and larger
// accessible hit targets; moving the removable nodes never moves the prompts.
addAnchor("slot1_prompt_anchor", shellPointInBase([0, shellMaxY + shellMm(10), slot1Center[2]]));
addAnchor("slot2_prompt_anchor", shellPointInBase([0, shellMinY - shellMm(12), slot2Center[2]]));

// Preserve the original generic anchor for future consumers while defining
// all new work against the explicit Slot-1/Slot-2 contract above.
const legacyCartridgeAnchor = document.createNode("cartridge_anchor")
  .setTranslation([...slot1Anchor.getTranslation()])
  .setRotation([...slot1Anchor.getRotation()])
  .setExtras({ aliasOf: "slot1_anchor" });
base.addChild(legacyCartridgeAnchor);

// The source includes a decorative wrist strap unrelated to the console.
const strap = nodes.get("Cube.024");
if (strap) {
  strap.getParentNode()?.removeChild(strap);
  strap.dispose();
}
for (const textNode of rootNode.listNodes().filter((node) => node.getName().startsWith("Text"))) {
  if (!textNode) continue;
  textNode.getParentNode()?.removeChild(textNode);
  textNode.dispose();
}

// Give the outer shell a crimson material while keeping the interior,
// controls, screens, and lettering on their original graphite materials.
const crimson = document
  .createMaterial("CrimsonShell")
  .setBaseColorFactor([0.34, 0.012, 0.035, 1])
  .setRoughnessFactor(0.36)
  .setMetallicFactor(0.08);
const screenBlack = document
  .createMaterial("ScreenBlack")
  .setBaseColorFactor([0.012, 0.016, 0.02, 1])
  .setRoughnessFactor(0.28)
  .setMetallicFactor(0);
const outerShellNodes = [
  "Cube",
  "Cube.004",
  "Cube.005",
  "Cube.015",
  "Cube.020",
  "Cube.039",
  "Sphere.003_Material_0",
  "Cube.045_Material.001_0",
];
const preservedSlotMaterials = new Set([
  "slot1_opening",
  "slot1_installed_lip",
  "slot1_installed_face",
  "slot2_opening",
]);
for (const name of outerShellNodes) {
  const node = nodes.get(name);
  node?.traverse((descendant) => {
    if (preservedSlotMaterials.has(descendant.getName())) return;
    const mesh = descendant.getMesh();
    if (!mesh) return;
    for (const primitive of mesh.listPrimitives()) primitive.setMaterial(crimson);
  });
}
for (const name of ["Cube.047_Tela_0", "Cube.048_Tela_0"]) {
  const node = nodes.get(name);
  if (!node?.getMesh()) continue;
  for (const primitive of node.getMesh().listPrimitives()) primitive.setMaterial(screenBlack);
}
crimson.setDoubleSided(true);

// The downloaded file contains a Sketchfab demo animation for unrelated
// controls. Replace it with the single, deterministic clamshell clip used by
// the intro state machine.
for (const animation of rootNode.listAnimations()) animation.dispose();
const times = document
  .createAccessor("OpenTimes")
  .setType("SCALAR")
  .setArray(new Float32Array([0, OPENING_SECONDS]));
const hingeAxis = new THREE.Vector3(1, 0, 0);
const openQuaternion = new THREE.Quaternion(...hingeRotation).multiply(
  new THREE.Quaternion().setFromAxisAngle(hingeAxis, OPEN_HINGE_RADIANS),
);
const closedQuaternion = new THREE.Quaternion(...hingeRotation).multiply(
  new THREE.Quaternion().setFromAxisAngle(hingeAxis, CLOSED_HINGE_RADIANS),
);
const rotations = document
  .createAccessor("OpenRotations")
  .setType("VEC4")
  .setArray(new Float32Array([
    closedQuaternion.x,
    closedQuaternion.y,
    closedQuaternion.z,
    closedQuaternion.w,
    openQuaternion.x,
    openQuaternion.y,
    openQuaternion.z,
    openQuaternion.w,
  ]));
const lidTranslations = document
  .createAccessor("OpenLidTranslations")
  .setType("VEC3")
  .setArray(new Float32Array([0, LID_CLOSED_Y_OFFSET, LID_CLOSED_Z_OFFSET, 0, 0, 0]));
const sampler = document
  .createAnimationSampler("OpenSampler")
  .setInput(times)
  .setOutput(rotations)
  .setInterpolation("LINEAR");
const channel = document
  .createAnimationChannel("OpenChannel")
  .setTargetNode(hinge)
  .setTargetPath("rotation")
  .setSampler(sampler);
const lidSampler = document
  .createAnimationSampler("OpenLidSampler")
  .setInput(times)
  .setOutput(lidTranslations)
  .setInterpolation("LINEAR");
const lidChannel = document
  .createAnimationChannel("OpenLidChannel")
  .setTargetNode(lid)
  .setTargetPath("translation")
  .setSampler(lidSampler);
const open = document.createAnimation("Open");
open.addSampler(sampler).addSampler(lidSampler).addChannel(channel).addChannel(lidChannel);

await new NodeIO().write(outputPath, document);
console.log(JSON.stringify({ sourcePath, outputPath, animation: "Open", durationMs: OPENING_SECONDS * 1000 }, null, 2));
