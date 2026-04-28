# Wii Asset Research + Integration Map

This project already supports missing assets gracefully. Use this doc to replace placeholders with higher-fidelity assets.

## 1) Audio (SFX + BGM)

Drop files into `public/sounds/` using exact names listed in:

- `lib/audio/sounds.ts`
- `public/sounds/README.md`

Research links:

- Community Wii BIOS/UI sounds: https://www.sounds-resource.com/wii/systembioswii/sound/21664/

## 2) Channel tile art (replace current inline glyphs)

Current tiles use manifest-level `preview.icon` values (`disc`, `mii`, `music`, `media`) and render vector glyphs.

Code path:

- `lib/channels/manifests/*.ts` (each channel's `preview`)
- `components/os/ChannelTile.tsx` (preview rendering)

Research links:

- Wii Menu sprite/icon sheets: https://www.spriters-resource.com/wii/wiimenu/

Recommended approach:

1. Export per-channel PNG/WebP art to `public/assets/wii/channels/<slug>/preview.png`.
2. Extend preview schema to support image URLs where needed.
3. Keep color-gradient fallback for missing files.

## 3) Cursor fidelity

Current cursor is inline SVG:

- `components/os/WiiCursor.tsx`

Planned swap:

1. Add `public/assets/wii/cursor/open.png` and `public/assets/wii/cursor/closed.png`.
2. Replace SVG rendering with state-based `<img>` swap (`open`, `hover`, `closed`).
3. Keep existing motion/spring behavior.

## 4) System font

Wii system UI uses Rodin NTLG (commercial). Reference:

- https://niwanetwork.org/wiki/List_of_Nintendo_system_fonts

Practical plan:

1. If properly licensed, self-host Rodin variant in `public/fonts/` and wire via `next/font/local`.
2. Otherwise pick a free fallback with similar proportions/weight and tune `letter-spacing` + sizes in `app/globals.css`.

## 5) Legal hygiene

- Use only assets you have rights to redistribute.
- Keep this repo committed with placeholders/fallbacks; keep private dumps local when needed.
