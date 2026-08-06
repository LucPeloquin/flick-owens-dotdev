export function clampDsiIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function getDsiNavigationDelta(key: string): number {
  if (key === "ArrowLeft") return -1;
  if (key === "ArrowRight") return 1;
  if (key.toLowerCase() === "l") return -2;
  if (key.toLowerCase() === "r") return 2;
  return 0;
}

export function isDsiLaunchKey(key: string): boolean {
  return key === "Enter" || key === " " || key.toLowerCase() === "a";
}

export function isDsiBackKey(key: string): boolean {
  return key === "Escape" || key.toLowerCase() === "b";
}
