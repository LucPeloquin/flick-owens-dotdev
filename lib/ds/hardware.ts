import {
  DEFAULT_GBA_CARTRIDGE_ID,
  DEFAULT_NDS_CARTRIDGE_ID,
  isCartridgeForKind,
  type DsCartridgeKind,
  type GbaCartridgeId,
  type NdsCartridgeId,
} from "./cartridges";

export type DsHardwarePose = "open" | "closing" | "closed" | "opening";
export type DsHardwareMode = "idle" | "ejecting" | "library" | "inserting";

export type DsInstalledCartridges = {
  nds: NdsCartridgeId | null;
  gba: GbaCartridgeId | null;
};

export type DsPendingCartridge =
  | { slot: "nds"; cartridgeId: NdsCartridgeId }
  | { slot: "gba"; cartridgeId: GbaCartridgeId };

export type DsRemovedCartridge = DsPendingCartridge;

export type DsHardwareState = {
  powered: boolean;
  pose: DsHardwarePose;
  mode: DsHardwareMode;
  activeSlot: DsCartridgeKind | null;
  /** The detached cartridge remains addressable while the 3D library is open. */
  removedCartridge: DsRemovedCartridge | null;
  pendingCartridge: DsPendingCartridge | null;
  cartridges: DsInstalledCartridges;
  /** The production GLB contains a Slot-2 dust cover, not a GBA game. */
  slot2CoverPresent: boolean;
  /**
   * Every animation request receives a new token. Completion actions carrying
   * an older token are ignored, making interrupted close/eject/insert motions
   * safe even when their callbacks arrive later.
   */
  motionToken: number;
};

export type DsHardwareAction =
  | { type: "set-powered"; powered: boolean }
  | { type: "request-close" }
  | { type: "close-complete"; token: number }
  | { type: "request-open" }
  | { type: "open-complete"; token: number }
  | { type: "request-eject"; slot: DsCartridgeKind }
  | { type: "eject-complete"; token: number }
  | { type: "preview-cartridge"; slot: "nds"; cartridgeId: NdsCartridgeId }
  | { type: "preview-cartridge"; slot: "gba"; cartridgeId: GbaCartridgeId }
  | { type: "select-cartridge"; slot: "nds"; cartridgeId: NdsCartridgeId }
  | { type: "select-cartridge"; slot: "gba"; cartridgeId: GbaCartridgeId }
  | { type: "insert-complete"; token: number }
  | { type: "cancel-library" }
  | { type: "restore-installed"; cartridges: DsInstalledCartridges }
  | { type: "reset" };

export const initialDsHardwareState: DsHardwareState = {
  powered: false,
  pose: "open",
  mode: "idle",
  activeSlot: null,
  removedCartridge: null,
  pendingCartridge: null,
  cartridges: {
    nds: DEFAULT_NDS_CARTRIDGE_ID,
    gba: DEFAULT_GBA_CARTRIDGE_ID,
  },
  slot2CoverPresent: false,
  motionToken: 0,
};

function nextMotionToken(state: DsHardwareState): number {
  return state.motionToken + 1;
}

function hasRemovableSlotContent(state: DsHardwareState, slot: DsCartridgeKind): boolean {
  if (slot === "nds") return state.cartridges.nds !== null;
  return state.cartridges.gba !== null || state.slot2CoverPresent;
}

function isMatchingCompletion(
  state: DsHardwareState,
  token: number,
  mode: DsHardwareMode,
): boolean {
  return !state.powered && state.motionToken === token && state.mode === mode;
}

export function reduceDsHardware(
  state: DsHardwareState,
  action: DsHardwareAction,
): DsHardwareState {
  switch (action.type) {
    case "set-powered": {
      if (state.powered === action.powered) return state;
      if (!action.powered) return { ...state, powered: false };

      // Powering on invalidates any service animation or open library. The
      // visual layer can use the incremented token to abandon its old tween.
      return {
        ...state,
        powered: true,
        pose: state.pose === "closing"
          ? "open"
          : state.pose === "opening"
            ? "closed"
            : state.pose,
        mode: "idle",
        activeSlot: null,
        pendingCartridge: null,
        motionToken: nextMotionToken(state),
      };
    }
    case "request-close":
      if (state.powered || state.pose !== "open" || state.mode !== "idle") return state;
      return { ...state, pose: "closing", motionToken: nextMotionToken(state) };
    case "close-complete":
      if (state.powered || state.pose !== "closing" || state.motionToken !== action.token) return state;
      return { ...state, pose: "closed" };
    case "request-open":
      if (state.pose !== "closed" || state.mode !== "idle") return state;
      return { ...state, pose: "opening", motionToken: nextMotionToken(state) };
    case "open-complete":
      if (state.pose !== "opening" || state.motionToken !== action.token) return state;
      return { ...state, pose: "open" };
    case "request-eject":
      if (
        state.powered
        || state.pose !== "closed"
        || state.mode !== "idle"
      ) return state;
      if (!hasRemovableSlotContent(state, action.slot)) {
        return {
          ...state,
          mode: "library",
          activeSlot: action.slot,
          removedCartridge: action.slot === "nds"
            ? { slot: "nds", cartridgeId: DEFAULT_NDS_CARTRIDGE_ID }
            : { slot: "gba", cartridgeId: DEFAULT_GBA_CARTRIDGE_ID },
          pendingCartridge: null,
        };
      }
      return {
        ...state,
        mode: "ejecting",
        activeSlot: action.slot,
        removedCartridge: null,
        pendingCartridge: null,
        motionToken: nextMotionToken(state),
      };
    case "eject-complete": {
      if (!isMatchingCompletion(state, action.token, "ejecting") || !state.activeSlot) return state;
      const cartridges = { ...state.cartridges };
      let slot2CoverPresent = state.slot2CoverPresent;
      let removedCartridge: DsRemovedCartridge | null = null;
      if (state.activeSlot === "nds") {
        if (cartridges.nds !== null) removedCartridge = { slot: "nds", cartridgeId: cartridges.nds };
        cartridges.nds = null;
      } else if (cartridges.gba !== null) {
        removedCartridge = { slot: "gba", cartridgeId: cartridges.gba };
        cartridges.gba = null;
      } else {
        slot2CoverPresent = false;
      }
      return {
        ...state,
        mode: "library",
        cartridges,
        slot2CoverPresent,
        removedCartridge,
      };
    }
    case "select-cartridge":
      if (
        state.powered
        || state.pose !== "closed"
        || state.mode !== "library"
        || state.activeSlot !== action.slot
        || !isCartridgeForKind(action.slot, action.cartridgeId)
      ) return state;
      return {
        ...state,
        mode: "inserting",
        pendingCartridge: action.slot === "nds"
          ? { slot: "nds", cartridgeId: action.cartridgeId }
          : { slot: "gba", cartridgeId: action.cartridgeId },
        motionToken: nextMotionToken(state),
      };
    case "preview-cartridge":
      if (
        state.powered
        || state.pose !== "closed"
        || state.mode !== "library"
        || state.activeSlot !== action.slot
        || !isCartridgeForKind(action.slot, action.cartridgeId)
      ) return state;
      return {
        ...state,
        removedCartridge: action.slot === "nds"
          ? { slot: "nds", cartridgeId: action.cartridgeId }
          : { slot: "gba", cartridgeId: action.cartridgeId },
      };
    case "insert-complete": {
      if (!isMatchingCompletion(state, action.token, "inserting") || !state.pendingCartridge) return state;
      const cartridges = { ...state.cartridges };
      if (state.pendingCartridge.slot === "nds") {
        cartridges.nds = state.pendingCartridge.cartridgeId;
      } else {
        cartridges.gba = state.pendingCartridge.cartridgeId;
      }
      return {
        ...state,
        mode: "idle",
        activeSlot: null,
        pendingCartridge: null,
        removedCartridge: null,
        cartridges,
        slot2CoverPresent: state.pendingCartridge.slot === "gba" ? false : state.slot2CoverPresent,
      };
    }
    case "cancel-library":
      if (state.mode !== "library") return state;
      return {
        ...state,
        mode: "idle",
        activeSlot: null,
        pendingCartridge: null,
        removedCartridge: null,
        motionToken: nextMotionToken(state),
      };
    case "restore-installed":
      return {
        ...state,
        cartridges: action.cartridges,
      };
    case "reset":
      return initialDsHardwareState;
    default:
      return state;
  }
}
