export type DsCartridgeKind = "nds" | "gba";

export type DsCartridgeLabelPalette = {
  background: string;
  foreground: string;
  accent: string;
};

export type DsNativeAppId =
  | "portfolio"
  | "project-archive"
  | "field-notes"
  | "motion-studies"
  | "interface-museum"
  | "contact-card"
  | "after-hours"
  | "advance-portfolio"
  | "color-lab"
  | "soundboard"
  | "pixel-garden"
  | "type-rider"
  | "night-drive"
  | "tiny-tools";

export type DsCartridgeLaunch =
  | { type: "native"; appId: DsNativeAppId; display: "dual" | "top-only" }
  | { type: "rom"; system: "nds" | "gba"; romAssetId: string };

export type DsCartridgeDefinition<Kind extends DsCartridgeKind> = {
  id: string;
  kind: Kind;
  title: string;
  shortTitle: string;
  description: string;
  appId: DsNativeAppId;
  launch: DsCartridgeLaunch;
  label: DsCartridgeLabelPalette;
};

/**
 * Slot-1 titles are deliberately kept separate from Slot-2 titles. Besides
 * making the two libraries easy to render independently, the literal `kind`
 * prevents a GBA cartridge from being inserted into the NDS slot at compile
 * time or through the runtime lookup helpers below.
 */
export const NDS_CARTRIDGES = [
  {
    id: "flick-owens-portfolio",
    kind: "nds",
    title: "Flick Owens Portfolio",
    shortTitle: "FLICK OWENS",
    description: "The portfolio cartridge currently represented by the DS menu.",
    appId: "portfolio",
    launch: { type: "native", appId: "portfolio", display: "dual" },
    label: {
      background: "#ece9df",
      foreground: "#18171a",
      accent: "#9e1b2b",
    },
  },
  {
    id: "project-archive-ds",
    kind: "nds",
    title: "Project Archive DS",
    shortTitle: "PROJECT ARCHIVE",
    description: "A compact catalogue of selected product and identity work.",
    appId: "project-archive",
    launch: { type: "native", appId: "project-archive", display: "dual" },
    label: {
      background: "#202329",
      foreground: "#f3f1ea",
      accent: "#e04b58",
    },
  },
  {
    id: "field-notes-ds",
    kind: "nds",
    title: "Field Notes DS",
    shortTitle: "FIELD NOTES",
    description: "Process notes, sketches, and experiments from the studio.",
    appId: "field-notes",
    launch: { type: "native", appId: "field-notes", display: "top-only" },
    label: {
      background: "#d9d1bc",
      foreground: "#24201b",
      accent: "#54736a",
    },
  },
  {
    id: "motion-studies-ds",
    kind: "nds",
    title: "Motion Studies DS",
    shortTitle: "MOTION STUDIES",
    description: "Interaction tests, transitions, and small kinetic systems.",
    appId: "motion-studies",
    launch: { type: "native", appId: "motion-studies", display: "dual" },
    label: {
      background: "#dce8ef",
      foreground: "#172630",
      accent: "#247ba0",
    },
  },
  {
    id: "interface-museum-ds",
    kind: "nds",
    title: "Interface Museum DS",
    shortTitle: "INTERFACE MUSEUM",
    description: "A playable cabinet of menus, cursors, and interaction details.",
    appId: "interface-museum",
    launch: { type: "native", appId: "interface-museum", display: "dual" },
    label: {
      background: "#e8dfd0",
      foreground: "#30261d",
      accent: "#c56c39",
    },
  },
  {
    id: "contact-card-ds",
    kind: "nds",
    title: "Contact Card DS",
    shortTitle: "CONTACT CARD",
    description: "A pocket-sized route to collaborations, commissions, and hello.",
    appId: "contact-card",
    launch: { type: "native", appId: "contact-card", display: "top-only" },
    label: {
      background: "#efece5",
      foreground: "#201a1c",
      accent: "#9e1b2b",
    },
  },
  {
    id: "after-hours-ds",
    kind: "nds",
    title: "After Hours DS",
    shortTitle: "AFTER HOURS",
    description: "Late-night prototypes, strange tools, and unfinished favorites.",
    appId: "after-hours",
    launch: { type: "native", appId: "after-hours", display: "dual" },
    label: {
      background: "#171923",
      foreground: "#f4ead8",
      accent: "#e0a43a",
    },
  },
] as const satisfies readonly DsCartridgeDefinition<"nds">[];

export const GBA_CARTRIDGES = [
  {
    id: "flick-owens-advance",
    kind: "gba",
    title: "Flick Owens Advance",
    shortTitle: "FLICK ADVANCE",
    description: "Reserved for the first Slot-2 application experience.",
    appId: "advance-portfolio",
    launch: { type: "native", appId: "advance-portfolio", display: "top-only" },
    label: {
      background: "#29262b",
      foreground: "#f4eee7",
      accent: "#d21f3c",
    },
  },
  {
    id: "color-lab-advance",
    kind: "gba",
    title: "Color Lab Advance",
    shortTitle: "COLOR LAB",
    description: "A small playable palette and material study.",
    appId: "color-lab",
    launch: { type: "native", appId: "color-lab", display: "top-only" },
    label: {
      background: "#f1c34c",
      foreground: "#1b1b20",
      accent: "#4267a9",
    },
  },
  {
    id: "soundboard-advance",
    kind: "gba",
    title: "Soundboard Advance",
    shortTitle: "SOUNDBOARD",
    description: "An eight-bit sound and interface experiment.",
    appId: "soundboard",
    launch: { type: "native", appId: "soundboard", display: "top-only" },
    label: {
      background: "#ddd8e8",
      foreground: "#24202d",
      accent: "#7955a6",
    },
  },
  {
    id: "pixel-garden-advance",
    kind: "gba",
    title: "Pixel Garden Advance",
    shortTitle: "PIXEL GARDEN",
    description: "Grow a tiny garden one eight-bit tile at a time.",
    appId: "pixel-garden",
    launch: { type: "native", appId: "pixel-garden", display: "top-only" },
    label: {
      background: "#dfe9c8",
      foreground: "#21301d",
      accent: "#4f7b45",
    },
  },
  {
    id: "type-rider-advance",
    kind: "gba",
    title: "Type Rider Advance",
    shortTitle: "TYPE RIDER",
    description: "A compact typographic obstacle course for the upper screen.",
    appId: "type-rider",
    launch: { type: "native", appId: "type-rider", display: "top-only" },
    label: {
      background: "#f0e7d6",
      foreground: "#211d1c",
      accent: "#de563b",
    },
  },
  {
    id: "night-drive-advance",
    kind: "gba",
    title: "Night Drive Advance",
    shortTitle: "NIGHT DRIVE",
    description: "A neon road study built from gradients, rhythm, and speed.",
    appId: "night-drive",
    launch: { type: "native", appId: "night-drive", display: "top-only" },
    label: {
      background: "#15162a",
      foreground: "#f6edf9",
      accent: "#e6408f",
    },
  },
  {
    id: "tiny-tools-advance",
    kind: "gba",
    title: "Tiny Tools Advance",
    shortTitle: "TINY TOOLS",
    description: "Small utilities and playful generators for everyday making.",
    appId: "tiny-tools",
    launch: { type: "native", appId: "tiny-tools", display: "top-only" },
    label: {
      background: "#dce5e8",
      foreground: "#182226",
      accent: "#25839a",
    },
  },
] as const satisfies readonly DsCartridgeDefinition<"gba">[];

export type NdsCartridge = (typeof NDS_CARTRIDGES)[number];
export type GbaCartridge = (typeof GBA_CARTRIDGES)[number];
export type DsCartridge = NdsCartridge | GbaCartridge;
export type NdsCartridgeId = NdsCartridge["id"];
export type GbaCartridgeId = GbaCartridge["id"];
export type DsCartridgeId = NdsCartridgeId | GbaCartridgeId;

export type DsCartridgeIdFor<Kind extends DsCartridgeKind> = Kind extends "nds"
  ? NdsCartridgeId
  : GbaCartridgeId;

export type DsCartridgeFor<Kind extends DsCartridgeKind> = Kind extends "nds"
  ? NdsCartridge
  : GbaCartridge;

export const DEFAULT_NDS_CARTRIDGE_ID: NdsCartridgeId = "flick-owens-portfolio";
export const DEFAULT_GBA_CARTRIDGE_ID: GbaCartridgeId = "flick-owens-advance";

const NDS_CARTRIDGE_BY_ID = new Map<NdsCartridgeId, NdsCartridge>(
  NDS_CARTRIDGES.map((cartridge) => [cartridge.id, cartridge]),
);
const GBA_CARTRIDGE_BY_ID = new Map<GbaCartridgeId, GbaCartridge>(
  GBA_CARTRIDGES.map((cartridge) => [cartridge.id, cartridge]),
);

export function cartridgesForKind<Kind extends DsCartridgeKind>(
  kind: Kind,
): readonly DsCartridgeFor<Kind>[] {
  return (kind === "nds" ? NDS_CARTRIDGES : GBA_CARTRIDGES) as unknown as readonly DsCartridgeFor<Kind>[];
}

export function cartridgeForKind<Kind extends DsCartridgeKind>(
  kind: Kind,
  id: string,
): DsCartridgeFor<Kind> | null {
  const cartridge = kind === "nds"
    ? NDS_CARTRIDGE_BY_ID.get(id as NdsCartridgeId)
    : GBA_CARTRIDGE_BY_ID.get(id as GbaCartridgeId);
  return (cartridge ?? null) as DsCartridgeFor<Kind> | null;
}

export function isCartridgeForKind<Kind extends DsCartridgeKind>(
  kind: Kind,
  id: string,
): id is DsCartridgeIdFor<Kind> {
  return cartridgeForKind(kind, id) !== null;
}

export function launchForCartridge(cartridge: DsCartridge | null): DsCartridgeLaunch | null {
  return cartridge?.launch ?? null;
}
