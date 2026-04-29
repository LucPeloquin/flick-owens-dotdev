# flick-owens.dev

Shit I like, presented as a pixel-faithful Nintendo Wii home menu.

## Running

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Click the Health & Safety splash to unlock
audio, then click a channel tile to zoom into it. Press `H` or `Esc` to
open the HOME menu from anywhere.

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
app/                Routes (home, channel/[slug], settings, mail)
components/os/      OS chrome: cursor, clock, buttons, frames
components/channels Per-channel UIs
lib/channels/       Channel registry + manifest type
lib/audio/          Howler-backed engine
lib/store/os.ts     Zustand OS state
content/            Editable data: mii, media, settings, mail
public/             Static assets
```

## Out of scope

- Wii / GameCube emulation — no viable browser runtime.
- Server / auth / databases — the site is a single-user, static-exportable SPA.
```
