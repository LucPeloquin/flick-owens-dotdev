export function DsScreen({
  children,
  label,
  className = "",
  onPointerDown,
  onPointerUp,
  onWheel,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  onWheel?: React.WheelEventHandler<HTMLDivElement>;
}) {
  return (
    <section
      className={`ds-screen ${className}`}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <div className="ds-screen-canvas">{children}</div>
    </section>
  );
}
