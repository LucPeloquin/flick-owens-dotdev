// Map of SFX/BGM logical names -> public asset paths.
// Drop community rips into /public/sounds/ matching these filenames.
// If a file is missing at runtime, the engine silently no-ops.

export const SFX = {
  tink: "/sounds/workshop/select-short.wav",
  back: "/sounds/workshop/select-short.wav",
  select: "/sounds/workshop/select-short.wav",
  zoom: "/sounds/workshop/select-short.wav",
  unzoom: "/sounds/workshop/select-short.wav",
  hover: "/sounds/workshop/select-short.wav",
  "disc-insert": "/sounds/disc-insert.mp3",
  "home-open": "/sounds/home-open.mp3",
  "home-close": "/sounds/home-close.mp3",
  "mii-pose": "/sounds/mii-pose.mp3",
} as const;

export const BGM = {
  menu: "/sounds/workshop/wiihome.mp3",
  mii: "/sounds/bgm-mii.mp3",
  settings: "/sounds/bgm-settings.mp3",
  mail: "/sounds/bgm-mail.mp3",
} as const;

export type SfxName = keyof typeof SFX;
export type BgmName = keyof typeof BGM;
