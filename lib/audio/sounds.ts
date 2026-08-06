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
  "dsi-select": "/sounds/dsi/select.m4a",
  "dsi-switch": "/sounds/dsi/switch.m4a",
  "dsi-launch": "/sounds/dsi/launch.m4a",
  "dsi-back": "/sounds/dsi/back.m4a",
  "dsi-wrong": "/sounds/dsi/wrong.m4a",
  "ds-startup": "/sounds/ds/menu/firmware-startup.m4a",
  "ds-select": "/sounds/ds/menu/firmware-select.m4a",
  "ds-confirm": "/sounds/ds/menu/firmware-confirm.m4a",
  "ds-shutdown": "/sounds/ds/menu/firmware-shutdown.m4a",
  "ds-hover": "/sounds/ds/menu/firmware-hover.m4a",
  "ds-invalid": "/sounds/ds/menu/firmware-invalid.m4a",
  "ds-downloadplay-searching": "/sounds/ds/menu/firmware-downloadplay_searching.m4a",
  "ds-settings-increase": "/sounds/ds/menu/firmware-settings_increase.m4a",
} as const;

export const BGM = {
  menu: "/sounds/workshop/wiihome.mp3",
  mii: "/sounds/bgm-mii.mp3",
  settings: "/sounds/bgm-settings.mp3",
  mail: "/sounds/bgm-mail.mp3",
  "dsi-menu": "/sounds/dsi/menu.m4a",
} as const;

export type SfxName = keyof typeof SFX;
export type BgmName = keyof typeof BGM;
