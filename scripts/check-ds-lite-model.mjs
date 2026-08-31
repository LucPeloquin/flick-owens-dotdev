import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getBounds, NodeIO } from "@gltf-transform/core";
import * as THREE from "three";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const assetPath = path.join(root, "public/assets/ds/model/ds-lite-crimson.glb");
const dimensionsPath = path.join(root, "assets/ds/model/ds-lite-dimensions.json");
const dimensions = JSON.parse(readFileSync(dimensionsPath, "utf8"));
const requiredNodes = [
  "device_root",
  "base",
  "hinge",
  "lid",
  "screen_top",
  "screen_bottom",
  "screen_top_surface",
  "screen_bottom_surface",
  "power_switch",
  "slot1_opening",
  "slot1_installed_lip",
  "slot1_installed_face",
  "slot1_anchor",
  "slot1_prompt_anchor",
  "slot2_opening",
  "slot2_anchor",
  "slot2_cover",
  "slot2_prompt_anchor",
  "cartridge_anchor",
  "button_a",
  "button_b",
  "button_x",
  "button_y",
  "button_dpad",
  "button_l",
  "button_r",
  "button_start",
  "button_select",
];

if (!existsSync(assetPath)) {
  console.log("DS Lite GLB is not installed yet; the procedural preview remains active.");
  process.exit(0);
}

const document = await new NodeIO().read(assetPath);
const sceneNodes = document.getRoot().listNodes();
const nodeByName = new Map(sceneNodes.map((node) => [node.getName(), node]));
const names = new Set(sceneNodes.map((node) => node.getName()).filter(Boolean));
const legacySlot1Fragments = [
  "Cube.033",
  "Cube.033_Cartao_0",
  "Cube.035",
  "Cube.035_Material_0",
].filter((name) => names.has(name));
const missing = requiredNodes.filter((name) => !names.has(name));
const openAnimation = document.getRoot().listAnimations().find((animation) => animation.getName() === "Open");
const animations = document.getRoot().listAnimations().map((animation) => animation.getName());
const hasAncestor = (node, ancestorName) => {
  for (let current = node; current; current = current.getParentNode()) {
    if (current.getName() === ancestorName) return true;
  }
  return false;
};
const lidAttachedToHinge = nodeByName.get("lid")?.getParentNode()?.getName() === "hinge";
const screenTopOnLid = hasAncestor(nodeByName.get("screen_top"), "lid");
const screenBottomOnBase = hasAncestor(nodeByName.get("screen_bottom"), "base") && !hasAncestor(nodeByName.get("screen_bottom"), "lid");
const slot1OpeningOnShell = nodeByName.get("slot1_opening")?.getParentNode()?.getName() === "Cube";
const slot1InstalledLipOnShell = nodeByName.get("slot1_installed_lip")?.getParentNode()?.getName() === "Cube";
const slot1InstalledFaceOnShell = nodeByName.get("slot1_installed_face")?.getParentNode()?.getName() === "Cube";
const slot2OpeningOnShell = nodeByName.get("slot2_opening")?.getParentNode()?.getName() === "Cube";
const slot1AnchorOnBase = nodeByName.get("slot1_anchor")?.getParentNode()?.getName() === "base";
const slot2AnchorOnBase = nodeByName.get("slot2_anchor")?.getParentNode()?.getName() === "base";
const slot2CoverOnAnchor = nodeByName.get("slot2_cover")?.getParentNode()?.getName() === "slot2_anchor";
const slot1PromptOnBase = nodeByName.get("slot1_prompt_anchor")?.getParentNode()?.getName() === "base";
const slot2PromptOnBase = nodeByName.get("slot2_prompt_anchor")?.getParentNode()?.getName() === "base";
const legacyAnchorOnBase = nodeByName.get("cartridge_anchor")?.getParentNode()?.getName() === "base";
const sameTranslation = (left, right) => Boolean(left && right && left.every((value, index) => Math.abs(value - right[index]) < 1e-6));
const legacyAnchorMatchesSlot1 = sameTranslation(
  nodeByName.get("cartridge_anchor")?.getTranslation(),
  nodeByName.get("slot1_anchor")?.getTranslation(),
);
const legacyAnchorRotationMatchesSlot1 = sameTranslation(
  nodeByName.get("cartridge_anchor")?.getRotation(),
  nodeByName.get("slot1_anchor")?.getRotation(),
);
const promptAnchorsAreDistinct = !sameTranslation(
  nodeByName.get("slot1_prompt_anchor")?.getTranslation(),
  nodeByName.get("slot2_prompt_anchor")?.getTranslation(),
);
const scene = document.getRoot().listScenes()[0];
const sceneBounds = scene ? getBounds(scene) : null;
const sceneWidth = sceneBounds ? sceneBounds.max[0] - sceneBounds.min[0] : 0;
const modelScaleIsCalibrated = Math.abs(sceneWidth - dimensions.calibration.modelSceneWidthUnits) < 0.001;
const readVectorMetadata = (nodeName, key, expected) => {
  const value = nodeByName.get(nodeName)?.getExtras()?.[key];
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => Math.abs(entry - expected[index]) < 0.01);
};
const openingGeometryMatches = (nodeName, expectedMm) => {
  const node = nodeByName.get(nodeName);
  const positions = node?.getMesh()?.listPrimitives()[0]?.getAttribute("POSITION")?.getArray();
  if (!node || !positions) return false;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  const worldScale = new THREE.Vector3();
  new THREE.Matrix4().fromArray(node.getWorldMatrix()).decompose(
    new THREE.Vector3(),
    new THREE.Quaternion(),
    worldScale,
  );
  const actualMm = [
    (max[0] - min[0]) * worldScale.x / dimensions.calibration.sceneUnitsPerMm,
    (max[2] - min[2]) * worldScale.z / dimensions.calibration.sceneUnitsPerMm,
  ];
  return actualMm.every((value, index) => Math.abs(value - expectedMm[index]) < 0.02);
};
const geometryEnvelopeMatches = (nodeName, expectedMm) => {
  const node = nodeByName.get(nodeName);
  const positions = node?.getMesh()?.listPrimitives()[0]?.getAttribute("POSITION")?.getArray();
  if (!node || !positions) return false;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  const worldScale = new THREE.Vector3();
  new THREE.Matrix4().fromArray(node.getWorldMatrix()).decompose(
    new THREE.Vector3(),
    new THREE.Quaternion(),
    worldScale,
  );
  const actualMm = min.map((value, axis) => (
    (max[axis] - value) * worldScale.getComponent(axis) / dimensions.calibration.sceneUnitsPerMm
  ));
  return actualMm.every((value, index) => Math.abs(value - expectedMm[index]) < 0.02);
};
const slot1OpeningAccurate = slot1OpeningOnShell
  && readVectorMetadata("slot1_opening", "openingMm", dimensions.cartridges.nds.slotOpeningMm)
  && readVectorMetadata("slot1_opening", "fitsBodyMm", dimensions.cartridges.nds.insertionBodyMm)
  && openingGeometryMatches("slot1_opening", dimensions.cartridges.nds.slotOpeningMm)
  && nodeByName.get("slot1_anchor")?.getExtras()?.ejectionAxis === "+Y";
const slot1InstalledLipAccurate = slot1InstalledLipOnShell
  && readVectorMetadata("slot1_installed_lip", "dimensionsMm", [
    dimensions.cartridges.nds.insertionBodyMm[0],
    dimensions.cartridges.nds.seatedProtrusionMm,
    dimensions.cartridges.nds.insertionBodyMm[2],
  ])
  && nodeByName.get("slot1_installed_lip")?.getExtras()?.fillsOpeningNode === "slot1_opening"
  && geometryEnvelopeMatches("slot1_installed_lip", [
    dimensions.cartridges.nds.insertionBodyMm[0],
    dimensions.cartridges.nds.seatedProtrusionMm,
    dimensions.cartridges.nds.insertionBodyMm[2],
  ]);
const slot1InstalledFaceAccurate = slot1InstalledFaceOnShell
  && readVectorMetadata("slot1_installed_face", "dimensionsMm", [
    dimensions.cartridges.nds.insertionBodyMm[0],
    dimensions.slotCavityDepthMm,
    0.12,
  ])
  && nodeByName.get("slot1_installed_face")?.getExtras()?.fillsOpeningNode === "slot1_opening"
  && nodeByName.get("slot1_installed_face")?.getExtras()?.renderOffsetMm === 0.12
  && geometryEnvelopeMatches("slot1_installed_face", [
    dimensions.cartridges.nds.insertionBodyMm[0],
    dimensions.slotCavityDepthMm,
    0.12,
  ]);
const slot2OpeningAccurate = slot2OpeningOnShell
  && readVectorMetadata("slot2_opening", "openingMm", dimensions.cartridges.gba.slotOpeningMm)
  && readVectorMetadata("slot2_opening", "fitsBodyMm", dimensions.cartridges.gba.insertionBodyMm)
  && openingGeometryMatches("slot2_opening", dimensions.cartridges.gba.slotOpeningMm)
  && nodeByName.get("slot2_anchor")?.getExtras()?.ejectionAxis === "-Y";
const screenSurfaceUvsNormalized = ["screen_top_surface", "screen_bottom_surface"].every((name) => {
  const primitive = nodeByName.get(name)?.getMesh()?.listPrimitives()[0];
  const values = primitive?.getAttribute("TEXCOORD_0")?.getArray();
  return Boolean(values && values.length > 0 && Array.from(values).every((value) => value >= -1e-6 && value <= 1 + 1e-6));
});
const triangles = sceneNodes.reduce((sum, node) => {
  const mesh = node.getMesh();
  if (!mesh) return sum;
  return sum + mesh.listPrimitives().reduce((meshSum, primitive) => {
    const indices = primitive.getIndices();
    const positions = primitive.getAttribute("POSITION");
    return meshSum + Math.floor((indices?.getCount() ?? positions?.getCount() ?? 0) / 3);
  }, 0);
}, 0);
const transferBytes = statSync(assetPath).size;
const failures = [
  ...missing.map((name) => `missing node: ${name}`),
  ...(lidAttachedToHinge ? [] : ["lid must be attached directly to hinge"]),
  ...(screenTopOnLid ? [] : ["screen_top must stay on the hinged lid"]),
  ...(screenBottomOnBase ? [] : ["screen_bottom must stay on the base"]),
  ...(modelScaleIsCalibrated ? [] : [`console width must remain calibrated to ${dimensions.calibration.consoleWidthMm} mm`]),
  ...(slot1OpeningAccurate ? [] : ["Slot-1 opening geometry or fit metadata is not dimensionally accurate"]),
  ...(slot1InstalledLipAccurate ? [] : ["installed Slot-1 push lip must fill the opening with the cartridge's measured cross-section"]),
  ...(slot1InstalledFaceAccurate ? [] : ["installed Slot-1 face must cover the source shell where the real mouth reveals the card"]),
  ...(slot2OpeningAccurate ? [] : ["Slot-2 opening geometry or fit metadata is not dimensionally accurate"]),
  ...(slot1AnchorOnBase ? [] : ["slot1_anchor must be attached directly to base"]),
  ...(names.has("slot1_cartridge") ? ["legacy Slot-1 stub must be removed"] : []),
  ...(legacySlot1Fragments.length === 0 ? [] : [`legacy Slot-1 fragments must be removed: ${legacySlot1Fragments.join(", ")}`]),
  ...(slot2AnchorOnBase ? [] : ["slot2_anchor must be attached directly to base"]),
  ...(slot2CoverOnAnchor ? [] : ["slot2_cover must be attached directly to slot2_anchor"]),
  ...(slot1PromptOnBase ? [] : ["slot1_prompt_anchor must be attached directly to base"]),
  ...(slot2PromptOnBase ? [] : ["slot2_prompt_anchor must be attached directly to base"]),
  ...(legacyAnchorOnBase ? [] : ["cartridge_anchor must remain attached directly to base"]),
  ...(legacyAnchorMatchesSlot1 ? [] : ["legacy cartridge_anchor must remain at the Slot-1 rest position"]),
  ...(legacyAnchorRotationMatchesSlot1 ? [] : ["legacy cartridge_anchor must share the Slot-1 orientation"]),
  ...(promptAnchorsAreDistinct ? [] : ["Slot-1 and Slot-2 prompt anchors must be distinct"]),
  ...(screenSurfaceUvsNormalized ? [] : ["screen surfaces must expose normalized 0-1 UVs"]),
  ...(openAnimation ? [] : ["missing Open animation"]),
  ...(openAnimation?.listChannels().some((channel) => channel.getTargetNode()?.getName() === "hinge" && channel.getTargetPath() === "rotation")
    ? []
    : ["Open animation must target hinge rotation"]),
  ...(triangles <= 50_000 ? [] : [`triangle budget exceeded: ${triangles}`]),
  ...(transferBytes <= 3 * 1024 * 1024 ? [] : [`transfer budget exceeded: ${transferBytes} bytes`]),
];

console.log(JSON.stringify({
  assetPath,
  triangles,
  transferBytes,
  animations,
  missing,
  sceneWidth,
  consoleWidthMm: dimensions.calibration.consoleWidthMm,
  modelScaleIsCalibrated,
  lidAttachedToHinge,
  screenTopOnLid,
  screenBottomOnBase,
  slot1OpeningAccurate,
  slot1InstalledLipAccurate,
  slot1InstalledFaceAccurate,
  slot1AnchorOnBase,
  slot1CartridgeRemoved: !names.has("slot1_cartridge"),
  legacySlot1FragmentsRemoved: legacySlot1Fragments.length === 0,
  slot2OpeningAccurate,
  slot2AnchorOnBase,
  slot2CoverOnAnchor,
  slot1PromptOnBase,
  slot2PromptOnBase,
  legacyAnchorOnBase,
  legacyAnchorMatchesSlot1,
  promptAnchorsAreDistinct,
  screenSurfaceUvsNormalized,
  openTargetsHinge: Boolean(openAnimation?.listChannels().some((channel) => channel.getTargetNode()?.getName() === "hinge" && channel.getTargetPath() === "rotation")),
}, null, 2));
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
