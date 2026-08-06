/**
 * The DS BIOS font is a bitmap sheet rather than a webfont. The renderer keeps
 * the source atlas in the visual tree and gives assistive technology a real
 * text label. The compact pixel face mirrors the atlas' 8px rhythm while the
 * atlas remains available for future per-glyph extraction.
 */
export const DS_BITMAP_FONT_SRC = "/assets/ds/font/system-font.png";

export function normalizeDsText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9 .:/!?+\-]/g, " ");
}
