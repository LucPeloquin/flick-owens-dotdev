export type DsFirmwarePhase =
  | "off"
  | "powering-on"
  | "boot-logo"
  | "health-warning"
  | "touch-prompt"
  | "home"
  | "menu-transition"
  | "pictochat"
  | "download-play"
  | "settings"
  | "cartridge-placeholder"
  | "powering-off";

export type DsMenuTileId =
  | "cartridge"
  | "pictochat"
  | "download-play"
  | "gba"
  | "backlight"
  | "settings"
  | "alarm";

export type DsControlId =
  | "power"
  | "dpad-up"
  | "dpad-down"
  | "dpad-left"
  | "dpad-right"
  | "a"
  | "b"
  | "x"
  | "y"
  | "l"
  | "r"
  | "start"
  | "select"
  | "volume";

export type DsTransitionKind = "boot-fade" | "quick-menu" | "launch" | "return" | "shutdown";

export interface DsTransition {
  kind: DsTransitionKind;
  source: DsFirmwarePhase;
  destination: DsFirmwarePhase;
  startTime: number;
  selectedTile: DsMenuTileId | null;
}

export const DS_MENU_TILES: readonly DsMenuTileId[] = [
  "cartridge",
  "pictochat",
  "download-play",
  "gba",
  "backlight",
  "settings",
  "alarm",
];

export interface DsFirmwareState {
  phase: DsFirmwarePhase;
  selectedTile: number;
  backlight: boolean;
  muted: boolean;
  volume: number;
  transition: DsTransition | null;
}

export type DsFirmwareAction =
  | { type: "power-on"; skipBoot?: boolean; now?: number }
  | { type: "boot-next" }
  | { type: "touch"; now?: number }
  | { type: "select-delta"; delta: number }
  | { type: "select-tile"; index: number }
  | { type: "launch"; now?: number }
  | { type: "back"; now?: number }
  | { type: "transition-complete"; startTime?: number }
  | { type: "power-off-start"; now?: number }
  | { type: "power-off-complete"; startTime?: number }
  | { type: "set-backlight"; backlight: boolean }
  | { type: "set-muted"; muted: boolean }
  | { type: "set-volume"; volume: number }
  | { type: "hardware-press"; control: DsControlId };

export const initialDsFirmwareState: DsFirmwareState = {
  phase: "off",
  selectedTile: 0,
  backlight: true,
  muted: false,
  volume: 0.42,
  transition: null,
};

export function clampDsTile(index: number): number {
  return Math.max(0, Math.min(DS_MENU_TILES.length - 1, index));
}

export function selectedDsTile(state: DsFirmwareState): DsMenuTileId {
  return DS_MENU_TILES[clampDsTile(state.selectedTile)];
}

export function reduceDsFirmware(
  state: DsFirmwareState,
  action: DsFirmwareAction,
): DsFirmwareState {
  switch (action.type) {
    case "power-on": {
      if (state.phase !== "off") return state;
      const now = action.now ?? 0;
      if (action.skipBoot) {
        return {
          ...state,
          phase: "menu-transition",
          transition: {
            kind: "quick-menu",
            source: "off",
            destination: "home",
            startTime: now,
            selectedTile: selectedDsTile(state),
          },
        };
      }
      return {
        ...state,
        phase: "powering-on",
        transition: {
          kind: "boot-fade",
          source: "off",
          destination: "boot-logo",
          startTime: now,
          selectedTile: null,
        },
      };
    }
    case "boot-next":
      if (state.phase === "powering-on") return { ...state, phase: "boot-logo", transition: null };
      if (state.phase === "boot-logo") return { ...state, phase: "health-warning" };
      if (state.phase === "health-warning") return { ...state, phase: "touch-prompt" };
      return state;
    case "touch":
      if (state.phase !== "touch-prompt") return state;
      return {
        ...state,
        phase: "menu-transition",
        transition: {
          kind: "boot-fade",
          source: "touch-prompt",
          destination: "home",
          startTime: action.now ?? 0,
          selectedTile: selectedDsTile(state),
        },
      };
    case "select-delta":
      if (state.phase !== "home") return state;
      return { ...state, selectedTile: clampDsTile(state.selectedTile + action.delta) };
    case "select-tile":
      if (state.phase !== "home") return state;
      return { ...state, selectedTile: clampDsTile(action.index) };
    case "launch": {
      if (state.phase !== "home") return state;
      const tile = selectedDsTile(state);
      const destination = phaseForTile(tile);
      if (!destination || tile === "gba" || tile === "backlight" || tile === "alarm") return state;
      return {
        ...state,
        phase: "menu-transition",
        transition: {
          kind: "launch",
          source: "home",
          destination,
          startTime: action.now ?? 0,
          selectedTile: tile,
        },
      };
    }
    case "back":
      if (!["pictochat", "download-play", "settings", "cartridge-placeholder"].includes(state.phase)) return state;
      return {
        ...state,
        phase: "menu-transition",
        transition: {
          kind: "return",
          source: state.phase,
          destination: "home",
          startTime: action.now ?? 0,
          selectedTile: selectedDsTile(state),
        },
      };
    case "transition-complete":
      if (state.phase !== "menu-transition" || !state.transition) return state;
      if (action.startTime !== undefined && action.startTime !== state.transition.startTime) return state;
      return { ...state, phase: state.transition.destination, transition: null };
    case "power-off-start":
      if (state.phase === "off" || state.phase === "powering-off") return state;
      return {
        ...state,
        phase: "powering-off",
        transition: {
          kind: "shutdown",
          source: state.phase,
          destination: "off",
          startTime: action.now ?? 0,
          selectedTile: state.phase === "home" ? selectedDsTile(state) : null,
        },
      };
    case "power-off-complete":
      if (action.startTime !== undefined && state.transition?.startTime !== action.startTime) return state;
      return { ...state, phase: "off", transition: null };
    case "set-backlight":
      return { ...state, backlight: action.backlight };
    case "set-muted":
      return { ...state, muted: action.muted };
    case "set-volume":
      return { ...state, volume: Math.max(0, Math.min(1, action.volume)) };
    case "hardware-press":
      return state;
  }
}

export function phaseForTile(tile: DsMenuTileId): DsFirmwarePhase | null {
  if (tile === "cartridge") return "cartridge-placeholder";
  if (tile === "pictochat") return "pictochat";
  if (tile === "download-play") return "download-play";
  if (tile === "settings") return "settings";
  return null;
}

export function tileLabel(tile: DsMenuTileId): string {
  switch (tile) {
    case "cartridge":
      return "Flick Owens portfolio cartridge — coming soon";
    case "pictochat":
      return "PictoChat";
    case "download-play":
      return "DS Download Play";
    case "gba":
      return "Game Boy Advance slot — disabled";
    case "backlight":
      return "Backlight toggle";
    case "settings":
      return "Settings";
    case "alarm":
      return "Alarm — unavailable";
  }
}
