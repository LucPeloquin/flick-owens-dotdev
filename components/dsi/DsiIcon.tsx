import type { DsiAppDefinition } from "@/lib/dsi/types";

export function DsiIcon({
  app,
  size = 52,
  decorative = false,
}: {
  app: DsiAppDefinition;
  size?: number;
  decorative?: boolean;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    role: decorative ? undefined : "img",
    "aria-label": decorative ? undefined : `${app.label} icon`,
  } as const;

  return (
    <svg {...common} className="dsi-icon" style={{ "--icon-accent": app.accent } as React.CSSProperties}>
      <rect x="3" y="3" width="58" height="58" rx="16" fill="var(--icon-accent)" opacity="0.2" />
      <rect x="5" y="5" width="54" height="54" rx="14" fill="white" opacity="0.94" />
      <IconMark kind={app.icon} />
      <path d="M12 50h40" stroke="var(--icon-accent)" strokeWidth="2" opacity="0.8" />
    </svg>
  );
}

function IconMark({ kind }: { kind: DsiAppDefinition["icon"] }) {
  switch (kind) {
    case "camera":
      return (
        <g fill="none" stroke="var(--icon-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 25h34v21H15z" />
          <path d="m22 25 4-6h10l4 6" />
          <circle cx="32" cy="35.5" r="7" />
          <circle cx="45" cy="30" r="1.5" fill="var(--icon-accent)" stroke="none" />
        </g>
      );
    case "present":
      return (
        <g fill="none" stroke="var(--icon-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 26h34v23H15z" />
          <path d="M12 24h40v7H12zM32 24v25" />
          <path d="M31.5 24c-7 0-11-2-9-6 2-3 7-1 9 6ZM32.5 24c7 0 11-2 9-6-2-3-7-1-9 6Z" />
        </g>
      );
    case "sound":
      return (
        <g fill="none" stroke="var(--icon-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 37h8l9 8V19l-9 8h-8z" />
          <path d="M42 28c3 3 3 8 0 11M47 23c6 6 6 15 0 21" />
        </g>
      );
    case "browser":
      return (
        <g fill="none" stroke="var(--icon-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="33" r="16" />
          <path d="M16 33h32M32 17c5 5 7 10 7 16s-2 11-7 16c-5-5-7-10-7-16s2-11 7-16Z" />
          <path d="M20 22c4 2 8 3 12 3s8-1 12-3M20 44c4-2 8-3 12-3s8 1 12 3" />
        </g>
      );
    case "chat":
      return (
        <g fill="none" stroke="var(--icon-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 18h36v24H27l-9 7v-7h-4z" />
          <path d="M23 30h2M31 30h2M39 30h2" />
        </g>
      );
    case "wii":
      return (
        <g fill="none" stroke="var(--icon-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 17v27M45 17v27" />
          <path d="M15 22h34M15 39h34" />
          <circle cx="32" cy="30.5" r="7" />
        </g>
      );
  }
}
