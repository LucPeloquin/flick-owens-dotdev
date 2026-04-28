// Map of SFX/BGM logical names -> public asset paths.
// Drop community rips into /public/sounds/ matching these filenames.
// If a file is missing at runtime, the engine silently no-ops.

export const SFX = {
  tink: "/sounds/tink.mp3",
  back: "/sounds/back.mp3",
  select: "/sounds/select.mp3",
  zoom: "/sounds/zoom.mp3",
  unzoom: "/sounds/unzoom.mp3",
  hover: "/sounds/hover.mp3",
  "disc-insert": "/sounds/disc-insert.mp3",
  "home-open": "/sounds/home-open.mp3",
  "home-close": "/sounds/home-close.mp3",
  "mii-pose": "/sounds/mii-pose.mp3",
} as const;

export const BGM = {
  menu: "/sounds/bgm-menu.mp3",
  mii: "/sounds/bgm-mii.mp3",
  settings: "/sounds/bgm-settings.mp3",
  mail: "/sounds/bgm-mail.mp3",
} as const;

export type SfxName = keyof typeof SFX;
export type BgmName = keyof typeof BGM;
