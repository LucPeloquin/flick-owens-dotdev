import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const assetPath = path.join(root, "public/assets/ds/model/ds-lite-crimson.glb");
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
  "slot1_anchor",
  "slot1_prompt_anchor",
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
const promptAnchorsAreDistinct = !sameTranslation(
  nodeByName.get("slot1_prompt_anchor")?.getTranslation(),
  nodeByName.get("slot2_prompt_anchor")?.getTranslation(),
);
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
  ...(slot1AnchorOnBase ? [] : ["slot1_anchor must be attached directly to base"]),
  ...(names.has("slot1_cartridge") ? ["legacy Slot-1 stub must be removed"] : []),
  ...(slot2AnchorOnBase ? [] : ["slot2_anchor must be attached directly to base"]),
  ...(slot2CoverOnAnchor ? [] : ["slot2_cover must be attached directly to slot2_anchor"]),
  ...(slot1PromptOnBase ? [] : ["slot1_prompt_anchor must be attached directly to base"]),
  ...(slot2PromptOnBase ? [] : ["slot2_prompt_anchor must be attached directly to base"]),
  ...(legacyAnchorOnBase ? [] : ["cartridge_anchor must remain attached directly to base"]),
  ...(legacyAnchorMatchesSlot1 ? [] : ["legacy cartridge_anchor must remain at the Slot-1 rest position"]),
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
  lidAttachedToHinge,
  screenTopOnLid,
  screenBottomOnBase,
  slot1AnchorOnBase,
  slot1CartridgeRemoved: !names.has("slot1_cartridge"),
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
