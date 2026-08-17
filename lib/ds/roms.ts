import manifest from "@/assets/ds/cartridges.json";

export type DsRomSystem = "nds" | "gba";

export type DsRomManifestEntry = {
  id: string;
  system: DsRomSystem;
  title: string;
  rom: {
    path: string;
    bytes: number;
    sha256: string;
    extension: "nds" | "gba";
  };
  header: {
    title: string;
    code: string;
  };
  provenance: {
    authors: string[];
    revision?: string;
    license: string;
    sourceUrl: string;
    redistributionAllowed: boolean;
    modifications?: string;
  };
};

type DsRomManifestDocument = {
  schemaVersion: 1;
  skyEmuBuild: string;
  cartridges: readonly DsRomManifestEntry[];
};

export const DS_ROM_MANIFEST = manifest as DsRomManifestDocument;

export function romForAssetId(assetId: string): DsRomManifestEntry | null {
  return DS_ROM_MANIFEST.cartridges.find((entry) => entry.id === assetId) ?? null;
}

export function romUrl(entry: DsRomManifestEntry): string {
  return `/roms/${encodeURIComponent(entry.rom.path)}`;
}
