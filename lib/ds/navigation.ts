import type { DsFirmwareAction } from "./firmware";

export function dsActionForKey(key: string): DsFirmwareAction | null {
  const normalized = key.toLowerCase();
  if (key === "ArrowLeft" || key === "ArrowUp") return { type: "select-delta", delta: -1 };
  if (key === "ArrowRight" || key === "ArrowDown") return { type: "select-delta", delta: 1 };
  if (key === "Enter" || key === " " || normalized === "a") return { type: "launch" };
  if (key === "Escape" || normalized === "b") return { type: "back" };
  if (normalized === "x") return { type: "hardware-press", control: "x" };
  if (normalized === "y") return { type: "hardware-press", control: "y" };
  if (normalized === "q") return { type: "hardware-press", control: "l" };
  if (normalized === "e") return { type: "hardware-press", control: "r" };
  if (key === "1") return { type: "hardware-press", control: "select" };
  if (key === "2") return { type: "hardware-press", control: "start" };
  if (normalized === "p") return { type: "hardware-press", control: "power" };
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

export function isDsHardwareKey(key: string): boolean {
  return ["Enter", " ", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "b", "x", "y", "q", "e", "1", "2", "p"].includes(key.toLowerCase()) || ["Enter", " ", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "1", "2"].includes(key);
}
