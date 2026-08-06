# flick-owens.dev

An interactive portfolio presented as an original gray Nintendo DS firmware
interface: two exact 256×192 screens, the health/safety boot sequence, authentic
menu sprites and sound effects, a transparent LaunchBox Nintendo DS hardware
overlay, and a maintained Wii archive kept at `/wii`.

## Running

```bash
npm install
npm run dev
npm test
```

Open <http://localhost:3000>. Press the physical **POWER** button to unlock the
firmware boot sequence and audio; hold it for 700 ms to power off. Use the
touch screen, wheel, swipe/drag, arrow keys, A/Enter, B/Escape, or the physical
controls rendered around the device. The
firmware owns `/`; the placeholder cartridge is deliberately not wired to the
portfolio modules yet. The legacy Wii experience starts at `/wii` and is not
loaded by the homepage.

## DS asset pipeline

The tracked source manifest is `assets/ds/sources.json`, with deterministic crop
coordinates in `assets/ds/crops.json`. Source archives live in the ignored
`assets/ds/raw/` cache.

```bash
npm run assets:ds:check
npm run assets:ds:crops
npm run assets:ds:motion
npm run assets:ds:overlay
npm run assets:ds:import
```

See [`THIRD_PARTY_ASSETS.md`](./THIRD_PARTY_ASSETS.md) for provenance and the
stock BIOS, sound archive, and LaunchBox overlay references. The overlay source
record lives in [`assets/ds/overlays.json`](./assets/ds/overlays.json); its raw
PNG remains ignored and the browser ships an alpha-preserving WebP derivative.

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
- **ROM** → `public/roms/game.gba` (+ optional `game.ss0` savestate).
  `public/roms/` is gitignored.
- **MP3s** → `public/music/` with a manifest in `public/music/playlist.json`.
  Individual audio files are gitignored.

## Structure

```
  app/                Routes (DS firmware + portfolio apps + /wii legacy namespace)
components/ds/      Original DS shell, firmware state machine, and screen modules
components/dsi/     Preserved portfolio application screens for direct routes
components/os/      OS chrome: cursor, clock, buttons, frames
components/channels Per-channel UIs
lib/channels/       Channel registry + manifest type
lib/audio/          Howler-backed engine
lib/store/os.ts     Zustand OS state
content/            Editable portfolio and legacy Wii data
assets/ds/          Reproducible DS source manifest, crops, and import script
public/             Static assets
```

## Out of scope

- Wii / GameCube emulation — no viable browser runtime.
- Server / auth / databases — the site is a single-user, static-exportable SPA.
