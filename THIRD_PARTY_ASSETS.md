# Original DS asset provenance

The root firmware uses a curated set of community-preserved original Nintendo DS menu graphics, bitmap-font source, system icons, and sound effects. The deployed files are curated crops/transcodes; source page URLs, direct downloads, uploader attribution, dimensions, transformations, and checksums are recorded in [`assets/ds/sources.json`](./assets/ds/sources.json). Crop coordinates and output hashes are recorded in [`assets/ds/crops.json`](./assets/ds/crops.json).

Primary visual source: the [System BIOS (DS) archive](https://www.spriters-resource.com/ds_dsi/systembiosds/) on The Spriters Resource. The implementation uses the public Menu, System Menu/PictoChat, System Font, DS Game Icons, Wireless Play Icons, Placeholder Icons, and Nintendo WFC Config Transfer pages. Sound effects come from the [original DS system sound archive](https://sounds.spriters-resource.com/ds_dsi/systembiosds/), including the menu, Download Play, settings, and PictoChat banks.

Spriters Resource pages are the visual source of truth for V1; the original menu sheet supplies exact 256×192 top and bottom compositions, and the System Menu sheet supplies the health/safety panel and secondary system UI. The physical enclosure is a CSS reconstruction and does not ship a model or WebGL dependency.

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

## LaunchBox overlay

The hardware layer also uses the public full-resolution light frame from the [Nintendo DS Overlay Animated 1.1.1 page](https://forums.launchbox-app.com/files/file/4903-nintendo-ds-overlay-animated/) by `andersonlino`. The page describes a 1920×1080 RetroArch top/bottom overlay and identifies the source as edited community imagery. The public CDN preview is recorded in [`assets/ds/overlays.json`](./assets/ds/overlays.json); it is preserved in the ignored `assets/ds/raw/overlays/` cache and delivered as the alpha-preserving `public/assets/ds/overlays/nintendo-ds-overlay-animated-light.webp` derivative. The downloadable ZIP is account-gated, so no claim is made that the preview contains the package's animation config or additional frames.

## User-provided firmware references

The portfolio cartridge label/icon and the Download Play host-list composition are cropped from the two reference images supplied in the implementation request. Their source paths, logical crop rectangles, derived output dimensions, transformations, and SHA-256 values are recorded in [`assets/ds/references.json`](./assets/ds/references.json). The clean Download Play derivative removes only the baked third-row selection corners so the live host cursor can move between rows.
