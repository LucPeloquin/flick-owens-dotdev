"use client";

import { useEffect, useState } from "react";

export function ClockBadge() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const day = now.toLocaleDateString(undefined, { weekday: "short" });
  const date = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 select-none text-right font-sans text-white drop-shadow-lg">
      <div className="text-sm tracking-wide opacity-80">
        {day}. {date}
      </div>
      <div className="text-3xl font-semibold leading-none">{time}</div>
    </div>
  );
}
