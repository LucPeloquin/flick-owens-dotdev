# Original DS asset provenance

The root firmware uses a curated set of community-preserved original Nintendo DS menu graphics, bitmap-font source, system icons, and sound effects. The deployed files are curated crops/transcodes; source page URLs, direct downloads, uploader attribution, dimensions, transformations, and checksums are recorded in [`assets/ds/sources.json`](./assets/ds/sources.json). Crop coordinates and output hashes are recorded in [`assets/ds/crops.json`](./assets/ds/crops.json).

Primary visual source: the [System BIOS (DS) archive](https://www.spriters-resource.com/ds_dsi/systembiosds/) on The Spriters Resource. The implementation uses the public Menu, System Menu/PictoChat, System Font, DS Game Icons, Wireless Play Icons, Placeholder Icons, and Nintendo WFC Config Transfer pages. Sound effects come from the [original DS system sound archive](https://sounds.spriters-resource.com/ds_dsi/systembiosds/), including the menu, Download Play, settings, and PictoChat banks.

Spriters Resource pages are the visual source of truth for the firmware V1; the original menu sheet supplies exact 256×192 top and bottom compositions, and the System Menu sheet supplies the health/safety panel and secondary system UI. The matching red physical shell is rendered in CSS for the firmware handoff, while the replayable inspection layer uses a lazy GLB WebGL renderer with a CSS-only fallback.

Boot motion and menu-state sprites are pinned to [TWiLight Menu++ commit `67676b7`](https://github.com/DS-Homebrew/TWiLightMenu/tree/67676b7e751dbf50fbe7b73d41894f54606d05fe). The reproducible records for `ds.gif`, the English health-warning GIF, their source hashes, frame delays, atlas hashes, and keyed menu sprites live in [`assets/ds/motion.json`](./assets/ds/motion.json); the raw GIFs remain in the ignored `assets/ds/raw/boot/` cache.

The manifest is importable from either a manually downloaded/extracted checkout or directly from GitHub. The raw cache is intentionally gitignored:

```bash
# Verify the curated files committed under public/
npm run assets:ds:check

# Rebuild deterministic 256×192 crops from the source sheets
npm run assets:ds:crops
npm run assets:ds:motion

# Download the public source images/archives into the ignored raw cache and import them
npm run assets:ds:import
```

The import step extracts the WAV banks, transcodes compatible effects to AAC m4a, and keeps unsupported SWAR-derived samples as WAV. Every deployed derivative and raw archive is checked against its SHA-256 before it can be accepted into the bundle; source hashes are retained where the bytes necessarily change.

The raw cache is intentionally gitignored. Only the source PNGs needed to reproduce the crops, the curated crop outputs, the font atlas, and selected compressed audio are shipped.

## DS Lite opening model

The homepage now presents a replayable Crimson Red/Black DS Lite inspection layer on every load. The normalized candidate is shipped at `public/assets/ds/model/ds-lite-crimson.glb`; it preserves the required node contract and a clamped `Open` hinge clip, while the 2D fallback remains available for WebGL/model failures. The provenance and budget record is [`assets/ds/model/ds-lite.source.json`](./assets/ds/model/ds-lite.source.json).

The production source is Thi3d’s [Nintendo DS Lite model](https://sketchfab.com/3d-models/nintendo-ds-lite-91addaf07dca4b0baa8219888c684431), listed as CC Attribution with one authored animation and 37,848 faces. The checked-in derived candidate recolors the exterior, removes unrelated props and source demo text, normalizes the hinge and named anchors, and authors a closed-on-bottom pose that opens around the same physical hinge barrel to a 170-degree visible endpoint. Both source and derived SHA-256 values are recorded in the manifest. Credit Thi3d and the modifications under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

If that hierarchy cannot be cleaned safely, the [marcovarriale2005 model](https://sketchfab.com/3d-models/nintendo-ds-lite-328016f7b7214762b92ae3b92f276cb1) is a CC-BY fallback that needs hinge rigging and substantial decimation. The [Superhive DS Lite](https://superhivemarket.com/products/nintendo-ds-lite-3d-model) and [TurboSquid DS Lite](https://www.turbosquid.com/3d-models/nintendo-ds-lite-3d-model/302584) remain visual/mechanical benchmarks only: their licenses do not permit shipping an extractable website GLB without the applicable written permission. The official [DS Lite manual](https://www.nintendo.com/eu/media/downloads/support_1/nintendo_ds_lite/NDSLite_Manual_UK_DE_FR.pdf) is the hardware reference; this site presents the control as an upward spring-loaded flick for both on and off so the browser interaction stays consistent.

## LaunchBox overlay

The LaunchBox frame is retained as an archived provenance record only; the
homepage firmware now uses the responsive Crimson Red/Black DS Lite CSS shell
described above.

The hardware layer also uses the public full-resolution light frame from the [Nintendo DS Overlay Animated 1.1.1 page](https://forums.launchbox-app.com/files/file/4903-nintendo-ds-overlay-animated/) by `andersonlino`. The page describes a 1920×1080 RetroArch top/bottom overlay and identifies the source as edited community imagery. The public CDN preview is recorded in [`assets/ds/overlays.json`](./assets/ds/overlays.json); it is preserved in the ignored `assets/ds/raw/overlays/` cache and delivered as the alpha-preserving `public/assets/ds/overlays/nintendo-ds-overlay-animated-light.webp` derivative. The downloadable ZIP is account-gated, so no claim is made that the preview contains the package's animation config or additional frames.

## User-provided firmware references

The portfolio cartridge label/icon and the Download Play host-list composition are cropped from the two reference images supplied in the implementation request. Their source paths, logical crop rectangles, derived output dimensions, transformations, and SHA-256 values are recorded in [`assets/ds/references.json`](./assets/ds/references.json). The clean Download Play derivative removes only the baked third-row selection corners so the live host cursor can move between rows.

## Removable accessories and runtime

`public/assets/ds/model/ds-lite-accessories.glb` is an untextured, procedural
accessory bundle (582 triangles, 41 KB) with full-size blank DS and GBA
cartridges plus an original DS Lite stylus. The cartridge proportions and
contact rhythm follow the [DS cartridge patent](https://patents.justia.com/patent/20090305792)
and the stylus envelope follows the [CC-BY Wikimedia stylus reference](https://commons.wikimedia.org/wiki/File:DS_Lite_stylus.jpg).
The cartridge references are CC BY 4.0; the Wikimedia stylus reference is CC BY 2.5.
The blank cartridge silhouettes are adaptation references for
[littlengvfx's CC-BY DS card](https://sketchfab.com/3d-models/nintendo-ds-cartridge-preset-01e161c3e7c24b40888fdf94ad003501)
and [Vxcl's CC-BY GBA card](https://sketchfab.com/3d-models/gameboy-advance-cartridge-38c1e6702e5d4f21af1d0930689b1d10);
all supplied textures, labels, logos, and wordmarks were removed. The
procedural stylus has no third-party mesh or texture.

Curated ROM metadata is tracked separately in [`assets/ds/cartridges.json`](./assets/ds/cartridges.json).
Payloads are intentionally absent from the repository and are rejected from
`public/roms/` unless a manifest entry proves hash, dimensions, provenance,
and redistribution permission. The private local Pokémon Sapphire dump that
was previously under `public/roms/` was moved to ignored `private/roms/` and
is not a production asset. The SkyEmu v5 worker now has an owned libretro C ABI
(`scripts/skyemu-host-adapter.c`) and a pinned-source build command
(`npm run runtime:skyemu:build`). The local provisioned adapter remains ignored
as a generated binary; its `build.json` records the exact v5 source commit,
Emscripten compiler, and artifact hash. No proprietary Nintendo BIOS or
firmware is bundled.
Nintendo trade-dress and trademark review remains separate from creator
licenses.

The ROM gate also requires a content-addressed SHA-256 filename, matching byte
length and digest, a declared title/game code, valid NDS executable bounds or
GBA header checksum, and non-empty author/license/source/redistribution fields.
This is deliberately stricter than a file extension check: a local dump cannot
become a public cartridge merely by being copied into the static asset folder.
