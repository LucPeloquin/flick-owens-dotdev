import type { DsControlId, DsFirmwareAction } from "./firmware";

/** The established DeSmuME keyboard defaults, plus P for this site's power switch. */
export function dsControlForKey(key: string, code?: string): DsControlId | null {
  if (key === "ArrowLeft") return "dpad-left";
  if (key === "ArrowRight") return "dpad-right";
  if (key === "ArrowUp") return "dpad-up";
  if (key === "ArrowDown") return "dpad-down";
  if (key === "Enter") return "start";
  // Keep the familiar browser escape hatches alongside the DeSmuME layout:
  // Space acts as A and Escape acts as B without changing the printed guide.
  if (key === " ") return "a";
  if (key === "Escape") return "b";
  if (code === "ShiftRight") return "select";

  switch (key.toLowerCase()) {
    case "x": return "a";
    case "z": return "b";
    case "s": return "x";
    case "a": return "y";
    case "q": return "l";
    case "w": return "r";
    case "p": return "power";
    default: return null;
  }
}

export function dsActionForKey(key: string, code?: string): DsFirmwareAction | null {
  if (key === "ArrowLeft" || key === "ArrowUp") return { type: "select-delta", delta: -1 };
  if (key === "ArrowRight" || key === "ArrowDown") return { type: "select-delta", delta: 1 };
  const control = dsControlForKey(key, code);
  if (control) return { type: "hardware-press", control };
  return null;
}

export function dsDirectionalControlForKey(
  key: string,
): "dpad-left" | "dpad-right" | "dpad-up" | "dpad-down" | null {
  if (key === "ArrowLeft") return "dpad-left";
  if (key === "ArrowRight") return "dpad-right";
  if (key === "ArrowUp") return "dpad-up";
  if (key === "ArrowDown") return "dpad-down";
  return null;
}

export function isDsDirectionalKey(key: string): boolean {
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key);
}

export function isDsHardwareKey(key: string, code?: string): boolean {
  return dsControlForKey(key, code) !== null;
}
