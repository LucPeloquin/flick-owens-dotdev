import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import * as THREE from "three";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const sourcePath = path.join(root, "assets/ds/model/ds-lite.source.glb");
const outputPath = path.join(root, "public/assets/ds/model/ds-lite-crimson.glb");
const OPENING_SECONDS = 0.65;

if (!existsSync(sourcePath)) {
  throw new Error(`Missing source GLB: ${sourcePath}`);
}

mkdirSync(path.dirname(outputPath), { recursive: true });

const document = await new NodeIO().read(sourcePath);
const rootNode = document.getRoot();
const nodes = new Map(rootNode.listNodes().map((node) => [node.getName(), node]));
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
const slot2CoverSource = requireNode("Cube.015");
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

const placeRemovableAtAnchor = (source, anchorName, removableName) => {
  const translation = [...source.getTranslation()];
  const rotation = [...source.getRotation()];
  const scale = [...source.getScale()];
  const parent = source.getParentNode();
  if (parent !== base) throw new Error(`${source.getName()} must be a direct child of base before normalization`);

  parent.removeChild(source);
  const anchor = document
    .createNode(anchorName)
    .setTranslation(translation)
    .setRotation(rotation)
    .setScale(scale);
  base.addChild(anchor);
  source
    .setName(removableName)
    .setTranslation([0, 0, 0])
    .setRotation([0, 0, 0, 1])
    .setScale([1, 1, 1]);
  anchor.addChild(source);
  return { anchor, translation };
};

// Slot-1's tiny source mesh is only an exposed stub, not a full game card.
// Remove it entirely; the accessory bundle owns the complete removable card.
const slot1Translation = [...slot1CartridgeSource.getTranslation()];
const slot1Rotation = [...slot1CartridgeSource.getRotation()];
const slot1Scale = [...slot1CartridgeSource.getScale()];
slot1CartridgeSource.getParentNode()?.removeChild(slot1CartridgeSource);
slot1CartridgeSource.getMesh()?.dispose();
slot1CartridgeSource.dispose();
const slot1Anchor = document.createNode("slot1_anchor")
  .setTranslation(slot1Translation)
  .setRotation(slot1Rotation)
  .setScale(slot1Scale);
base.addChild(slot1Anchor);
const slot1 = { translation: slot1Translation };
const slot2 = placeRemovableAtAnchor(slot2CoverSource, "slot2_anchor", "slot2_cover");

// The prompt points sit just outside the exposed rear/front edges in base-local
// coordinates. They are empty markers for the pulsing affordances and larger
// accessible hit targets; moving the removable nodes never moves the prompts.
addAnchor("slot1_prompt_anchor", [
  slot1.translation[0],
  slot1.translation[1] + 10,
  slot1.translation[2] - 10,
]);
addAnchor("slot2_prompt_anchor", [
  slot2.translation[0],
  slot2.translation[1] - 12,
  slot2.translation[2] + 34,
]);

// The source does not include a removable stylus mesh. This marker is placed
// at the right-rear holder so the accessory GLB can be mounted without
// changing the console mesh hierarchy.
const stylusAxisRotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
addAnchor("stylus_anchor", [184, -47, 52]).setRotation(stylusAxisRotation);
addAnchor("stylus_prompt_anchor", [184, -47, 63]).setRotation(stylusAxisRotation);

// Preserve the original generic anchor for future consumers while defining
// all new work against the explicit Slot-1/Slot-2 contract above.
addAnchor("cartridge_anchor", slot1.translation);

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
for (const name of outerShellNodes) {
  const node = nodes.get(name);
  node?.traverse((descendant) => {
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
