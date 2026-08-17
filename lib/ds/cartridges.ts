export type DsCartridgeKind = "nds" | "gba";

export type DsCartridgeLabelPalette = {
  background: string;
  foreground: string;
  accent: string;
};

export type DsNativeAppId = "portfolio" | "project-archive" | "field-notes" | "advance-portfolio" | "color-lab" | "soundboard";

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
