# flick-owens.dev

An interactive portfolio presented as a Crimson Red/Black Nintendo DS Lite
firmware interface: a replayable rotatable 3D intro, a 2D power gesture,
two exact 256×192 screens, the health/safety boot sequence, authentic menu
sprites and sound effects, and a maintained Wii archive kept at `/wii`.

## Running

```bash
npm install
npm run dev
npm test
```

Open <http://localhost:3000>. On every load, inspect the floating closed DS Lite
and tap **OPEN CONSOLE**, then drag the 2D POWER helper upward (or press
ArrowUp, Enter, or Space). The firmware then unlocks audio; after the powered
session has been active for 15 seconds, flick the physical POWER control upward
again to power off. When the shell is closed and off, the two pulsing service dots
eject the Slot-1 and Slot-2 cartridges and open their separate NDS/GBA libraries;
choosing a title animates it back into the slot and updates the matching firmware
tile/app label. Use the touch screen, wheel, swipe/drag, arrow keys, A/Enter,
B/Escape, or the physical controls rendered around the device. The firmware owns
`/`; the legacy Wii experience starts at `/wii` and is not loaded by the homepage.

## DS asset pipeline

The tracked source manifest is `assets/ds/sources.json`, with deterministic crop
coordinates in `assets/ds/crops.json`. Source archives live in the ignored
`assets/ds/raw/` cache.

```bash
npm run assets:ds:check
npm run assets:ds:crops
npm run assets:ds:motion
npm run assets:ds:model:normalize
npm run assets:ds:model:check
npm run assets:ds:accessories:check
npm run assets:ds:roms:check
npm run runtime:skyemu:build # after provisioning vendor/skyemu-v5 and EMCC
npm run assets:ds:overlay
npm run assets:ds:import
```

See [`THIRD_PARTY_ASSETS.md`](./THIRD_PARTY_ASSETS.md) for provenance and the
stock BIOS, sound archive, and DS Lite model references. The model contract and
license record live in [`assets/ds/model/ds-lite.source.json`](./assets/ds/model/ds-lite.source.json).
The ROM worker and SkyEmu host ABI are present. After provisioning, generated
files under `public/emulator/skyemu-v5/` are ignored locally (and still ship
when present in a production build); `build.json` records the exact v5 source
commit, Emscripten compiler, and artifact hash. Review SkyEmu's GPL-3.0 license
and acknowledgements before deploying the generated adapter.

## Adding a new channel

The site is channel-driven. To add one:

1. Put art (optional) into `public/assets/wii/channels/<slug>/`.
2. Create `lib/channels/manifests/<slug>.ts` exporting a
   `ChannelManifest` (see existing manifests for shape).
3. Create `components/channels/<Slug>Channel.tsx` — any React component.
4. Import the manifest in `lib/channels/registry.ts` and add it to the
   `rawChannels` array.

The `slot` property on the manifest (0–11) places the tile on the 4×3 grid.

## Asset drop-ins

Everything below is optional — the site runs with missing assets, it just
falls back to colored gradients / silent audio.

- **Wii menu visuals** → `public/assets/wii/`. Current runtime textures are
  selected/direct or composed derivatives from
  <https://github.com/Alan-bur/WM4K>; see
  `public/assets/wii/source/wm4k/`.
- **Wii sound rips** → `public/sounds/` (filenames listed in
  `lib/audio/sounds.ts`: `tink.mp3`, `back.mp3`, `select.mp3`, `zoom.mp3`,
  `unzoom.mp3`, `hover.mp3`, `disc-insert.mp3`, `home-open.mp3`,
  `home-close.mp3`, `mii-pose.mp3`, plus `bgm-menu.mp3` etc.).
- **Channel icons** → `public/assets/wii/channels/<slug>/` — reference from
  the manifest's `preview`.
- **Curated ROMs** → declare a verified, redistributable payload in
  `assets/ds/cartridges.json` with a SHA-256 filename, header identity,
  authorship, and redistribution evidence, then run
  `npm run assets:ds:roms:check` before placing it under `public/roms/`.
  Private dumps belong in ignored `private/roms/`; no commercial ROM or
  Nintendo BIOS is shipped.
- **MP3s** → `public/music/` with a manifest in `public/music/playlist.json`.
  Individual audio files are gitignored.

## Structure

```
  app/                Routes (DS firmware + portfolio apps + /wii legacy namespace)
components/ds/      3D DS shell, firmware state machine, service library, and runtime bridge
components/dsi/     Preserved portfolio application screens for direct routes
components/os/      OS chrome: cursor, clock, buttons, frames
components/channels Per-channel UIs
lib/channels/       Channel registry + manifest type
lib/audio/          Howler-backed engine
lib/store/os.ts     Zustand OS state
content/            Editable portfolio and legacy Wii data
assets/ds/          Reproducible DS source/ROM metadata, crops, and model provenance
public/             Static assets
```

## Out of scope

- Wii / GameCube emulation — no viable browser runtime.
- Server / auth / databases — the site is a single-user, static-exportable SPA.
