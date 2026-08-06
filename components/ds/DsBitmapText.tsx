import { DS_BITMAP_FONT_SRC, normalizeDsText } from "@/lib/ds/bitmap-font";

export function DsBitmapText({
  children,
  className = "",
  ariaLabel,
}: {
  children: string;
  className?: string;
  ariaLabel?: string;
}) {
  const text = normalizeDsText(children);
  return (
    <span className={`ds-bitmap-text ${className}`} aria-label={ariaLabel ?? children}>
      <span className="ds-bitmap-atlas" aria-hidden="true" style={{ backgroundImage: `url(${DS_BITMAP_FONT_SRC})` }} />
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
