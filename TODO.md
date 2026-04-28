# TODO

Running list for flick-owens.dev. Tick off as you go; add freely.

## Asset drop-ins

- [ ] Wii menu SFX rips into `public/sounds/` (filenames in `lib/audio/sounds.ts`)
- [ ] Wii Menu BGM loop → `public/sounds/bgm-menu.mp3`
- [ ] Mii Channel BGM → `public/sounds/bgm-mii.mp3`
- [ ] Settings / Mail BGM loops
- [ ] Replace SVG cursor with authentic hand-pointer PNGs (open + closed)
- [ ] Replace inline SVG channel glyphs with real ripped channel art
- [ ] Source the Wii's system font (RodinWii / Rodin NTLG) or a close free match
- [ ] Channel "preview strip" animations (looping mp4s) for tiles that had them

## Disc Channel

- [x] Drop legal GBA ROM at `public/roms/game.gba`
- [ ] Create a savestate at the desired spawn point → `public/roms/game.ss0`
- [ ] Pick a second ROM (NDS) and prove the core-switch via a second channel
- [x] Wire HOME overlay to actually pause/resume the emulator
- [ ] Polish the keyboard-controls tooltip (Wii-help styling, auto-hide)
- [ ] Mobile: add on-screen D-pad / buttons overlay (EmulatorJS supports this)

## .MP3 Channel

- [ ] Populate real `public/music/playlist.json` with the Top 100
- [ ] Upload MP3 files (or move to R2 / S3 if the bundle grows large)
- [ ] Album-art pipeline — either embed in MP3s or reference per-track in the manifest
- [ ] Visualizer (bars / waveform) to replace the plain cover-art block
- [ ] Shuffle + repeat buttons
- [ ] Persist last-played track / position in localStorage

## Mii Channel

- [ ] Replace SVG Mii with a rigged model that matches Flick's real Mii
- [ ] Add a "Mii parade" of friends across the bottom
- [ ] Voice clip / squeak on pose change
- [ ] Read Mii data from a `.mii` QR-style export instead of `content/mii.ts`

## Media Channel

- [x] Swap placeholder YouTube ID for a real latest video/profile source
- [x] Replace TikTok placeholder with a real profile source
- [ ] Decide: keep Tumblr link-out, or embed an iframe of the blog
- [ ] (Later) ISR route that auto-pulls latest post IDs from each platform
- [ ] Add an Instagram / X tab if scope expands

## OS / fidelity polish

- [x] Tune zoom-in / zoom-out spring to match the real Wii timing (View Transitions)
- [x] Bubble background (iconic drifting blue bubbles)
- [x] Mute/unmute button in the OS chrome
- [x] Respect `prefers-reduced-motion`
- [x] Cursor-driven parallax on the bubble field
- [ ] Real Wii clock styling (weather + date + time stack)
- [ ] "Disc slot" glow at bottom-left like the real menu
- [ ] Wii remote pairing animation as a hidden easter egg

## Settings

- [ ] Flesh out Wii Settings 4 (internet) with a fake connection-test animation
- [ ] Working parental-control PIN gate on a bogus channel
- [ ] Add the classic "Error has occurred" blue screen as an egg
- [ ] IR calibration minigame (actual interactive step, not just a popup)

## Mail

- [ ] Date-stamp logic: real "today at 9:42 AM" like the Wii
- [ ] Outgoing mail composer (just a local-only form)
- [ ] Hidden special letters that unlock on specific dates (birthday, Oct 31)
- [ ] Mii sender avatars next to each letter

## Future channels (just ideas)

- [ ] Photo Channel — gallery of things I've shot
- [ ] Everybody Votes Channel — poll-of-the-week
- [ ] Internet Channel — Opera-styled mini browser linking to bookmarks
- [ ] Weather Channel — rigged to show my current city
- [ ] News Channel — curated RSS feed
- [ ] Shop Channel — "store" of things I recommend
- [ ] Check Mii Out Channel — friends' Miis with links

## Deploy

- [ ] Choose host (Vercel vs Cloudflare Pages vs DO App Platform)
- [ ] Custom domain + TLS
- [ ] Object storage decision for MP3s if local hosting is too fat
- [ ] CDN for EmulatorJS assets (currently hitting emulatorjs.org CDN)
- [ ] Lighthouse pass — LCP under 3s; lazy-load sound files

## Bugs / known issues

- [ ] (add as they come up)
