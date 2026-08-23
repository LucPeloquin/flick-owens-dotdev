import { describe, expect, it } from "vitest";
import {
  GBA_CARTRIDGES,
  NDS_CARTRIDGES,
  cartridgeForKind,
  cartridgesForKind,
  isCartridgeForKind,
  type NdsCartridgeId,
} from "@/lib/ds/cartridges";
import {
  initialDsHardwareState,
  reduceDsHardware,
  type DsHardwareState,
} from "@/lib/ds/hardware";

function closeConsole(state: DsHardwareState = initialDsHardwareState): DsHardwareState {
  const closing = reduceDsHardware(state, { type: "request-close" });
  return reduceDsHardware(closing, { type: "close-complete", token: closing.motionToken });
}

describe("DS cartridge registries", () => {
  it("keeps NDS and GBA libraries separate and runtime-safe", () => {
    expect(NDS_CARTRIDGES.every((cartridge) => cartridge.kind === "nds")).toBe(true);
    expect(GBA_CARTRIDGES.every((cartridge) => cartridge.kind === "gba")).toBe(true);
    expect(NDS_CARTRIDGES.length).toBeGreaterThanOrEqual(7);
    expect(GBA_CARTRIDGES.length).toBeGreaterThanOrEqual(7);
    const cartridgeIds = [...NDS_CARTRIDGES, ...GBA_CARTRIDGES].map((cartridge) => cartridge.id);
    expect(new Set(cartridgeIds).size).toBe(cartridgeIds.length);
    expect(cartridgesForKind("nds")).toBe(NDS_CARTRIDGES);
    expect(cartridgesForKind("gba")).toBe(GBA_CARTRIDGES);
    expect(cartridgeForKind("nds", "flick-owens-portfolio")?.appId).toBe("portfolio");
    expect(cartridgeForKind("gba", "flick-owens-advance")?.appId).toBe("advance-portfolio");
    expect(cartridgeForKind("nds", "flick-owens-advance")).toBeNull();
    expect(cartridgeForKind("gba", "flick-owens-portfolio")).toBeNull();
    expect(isCartridgeForKind("nds", "missing-cartridge")).toBe(false);
  });
});

describe("DS hardware service state machine", () => {
  it("closes only while powered off and ignores stale motion callbacks", () => {
    const powered = reduceDsHardware(initialDsHardwareState, { type: "set-powered", powered: true });
    expect(reduceDsHardware(powered, { type: "request-close" })).toEqual(powered);

    const poweredOff = reduceDsHardware(powered, { type: "set-powered", powered: false });
    const closing = reduceDsHardware(poweredOff, { type: "request-close" });
    expect(closing).toMatchObject({ pose: "closing", motionToken: 2 });
    expect(reduceDsHardware(closing, { type: "close-complete", token: 1 })).toEqual(closing);
    expect(reduceDsHardware(closing, { type: "close-complete", token: 2 }).pose).toBe("closed");
  });

  it("ejects and reinserts the Slot-1 cartridge with token-safe completions", () => {
    let state = closeConsole();
    state = reduceDsHardware(state, { type: "request-eject", slot: "nds" });
    const ejectToken = state.motionToken;
    expect(state).toMatchObject({ mode: "ejecting", activeSlot: "nds" });
    expect(reduceDsHardware(state, { type: "eject-complete", token: ejectToken - 1 })).toEqual(state);

    state = reduceDsHardware(state, { type: "eject-complete", token: ejectToken });
    expect(state).toMatchObject({ mode: "library", activeSlot: "nds", cartridges: { nds: null } });

    state = reduceDsHardware(state, { type: "preview-cartridge", slot: "nds", cartridgeId: "project-archive-ds" });
    expect(state.removedCartridge).toEqual({ slot: "nds", cartridgeId: "project-archive-ds" });

    const wrongKind = reduceDsHardware(state, {
      type: "select-cartridge",
      slot: "nds",
      cartridgeId: "flick-owens-advance" as NdsCartridgeId,
    });
    expect(wrongKind).toEqual(state);

    state = reduceDsHardware(state, {
      type: "select-cartridge",
      slot: "nds",
      cartridgeId: "flick-owens-portfolio",
    });
    const insertToken = state.motionToken;
    expect(state).toMatchObject({
      mode: "inserting",
      pendingCartridge: { slot: "nds", cartridgeId: "flick-owens-portfolio" },
    });
    expect(reduceDsHardware(state, { type: "insert-complete", token: insertToken - 1 })).toEqual(state);

    state = reduceDsHardware(state, { type: "insert-complete", token: insertToken });
    expect(state).toMatchObject({
      mode: "idle",
      activeSlot: null,
      pendingCartridge: null,
      cartridges: { nds: "flick-owens-portfolio" },
    });
  });

  it("distinguishes the built-in Slot-2 cover from a selected GBA cartridge", () => {
    let state = closeConsole({
      ...initialDsHardwareState,
      cartridges: { ...initialDsHardwareState.cartridges, gba: null },
      slot2CoverPresent: true,
    });
    expect(state).toMatchObject({ cartridges: { gba: null }, slot2CoverPresent: true });

    state = reduceDsHardware(state, { type: "request-eject", slot: "gba" });
    state = reduceDsHardware(state, { type: "eject-complete", token: state.motionToken });
    expect(state).toMatchObject({ mode: "library", activeSlot: "gba", slot2CoverPresent: false });

    state = reduceDsHardware(state, {
      type: "select-cartridge",
      slot: "gba",
      cartridgeId: "flick-owens-advance",
    });
    state = reduceDsHardware(state, { type: "insert-complete", token: state.motionToken });
    expect(state).toMatchObject({
      mode: "idle",
      cartridges: { gba: "flick-owens-advance" },
      slot2CoverPresent: false,
    });

    state = reduceDsHardware(state, { type: "request-eject", slot: "gba" });
    state = reduceDsHardware(state, { type: "eject-complete", token: state.motionToken });
    expect(state).toMatchObject({
      mode: "library",
      cartridges: { gba: null },
      slot2CoverPresent: false,
    });
  });

  it("invalidates in-flight service work when power returns", () => {
    const closed = closeConsole();
    const ejecting = reduceDsHardware(closed, { type: "request-eject", slot: "nds" });
    const staleToken = ejecting.motionToken;
    const powered = reduceDsHardware(ejecting, { type: "set-powered", powered: true });

    expect(powered).toMatchObject({
      powered: true,
      mode: "idle",
      activeSlot: null,
      pendingCartridge: null,
      cartridges: { nds: "flick-owens-portfolio" },
      motionToken: staleToken + 1,
    });
    expect(reduceDsHardware(powered, { type: "eject-complete", token: staleToken })).toEqual(powered);
  });
});
