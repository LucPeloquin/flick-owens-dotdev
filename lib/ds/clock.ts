export const DS_TIME_ZONE = "America/Los_Angeles";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DS_TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});

const calendarMonthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DS_TIME_ZONE,
  month: "short",
});

const clockPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DS_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type DsClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type DsClockAngles = {
  hour: number;
  minute: number;
  second: number;
};

export type DsCalendar = {
  year: number;
  month: number;
  day: number;
  monthLabel: string;
  weekCount: 5 | 6;
  days: Array<number | null>;
};

export type DsClockVisibilitySource = {
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export type DsClockTickerOptions<TimerId> = {
  now: () => Date;
  setTimeout: (callback: () => void, delay: number) => TimerId;
  clearTimeout: (timer: TimerId) => void;
  visibility: DsClockVisibilitySource;
};

/** Format the firmware clock in Las Vegas/Pacific time. Intl applies PST/PDT automatically. */
export function formatDsTime(date: Date): string {
  return timeFormatter.format(date);
}

/** Format the full calendar date in Las Vegas/Pacific time. */
export function formatDsDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Extract numeric wall-clock parts in Las Vegas, independent of the visitor's locale. */
export function getDsClockParts(date: Date): DsClockParts {
  const parts = clockPartsFormatter.formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: valueFor("year"),
    month: valueFor("month"),
    day: valueFor("day"),
    hour: valueFor("hour"),
    minute: valueFor("minute"),
    second: valueFor("second"),
  };
}

/** Clock-hand rotations in degrees clockwise from twelve o'clock. */
export function getDsClockAngles(date: Date): DsClockAngles {
  const { hour, minute, second } = getDsClockParts(date);
  return {
    hour: ((hour % 12) + minute / 60 + second / 3_600) * 30,
    minute: (minute + second / 60) * 6,
    second: second * 6,
  };
}

/** Delay to the next exact wall-clock second, avoiding interval drift. */
export function millisecondsUntilNextDsSecond(epochMilliseconds: number): number {
  const remainder = ((epochMilliseconds % 1_000) + 1_000) % 1_000;
  return remainder === 0 ? 1_000 : 1_000 - remainder;
}

/**
 * Run a drift-free wall-clock ticker and resynchronize it when a hidden tab
 * becomes visible. Browser primitives are injected so the timing contract can
 * be tested without a DOM.
 */
export function startDsClockTicker<TimerId>(
  onTick: (date: Date) => void,
  { now, setTimeout, clearTimeout, visibility }: DsClockTickerOptions<TimerId>,
): () => void {
  let timer: TimerId | null = null;

  function clearPendingTick() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function scheduleNextTick() {
    const current = now();
    timer = setTimeout(tick, millisecondsUntilNextDsSecond(current.getTime()));
  }

  function tick() {
    timer = null;
    onTick(now());
    scheduleNextTick();
  }

  function handleVisibilityChange() {
    if (visibility.visibilityState !== "visible") return;
    clearPendingTick();
    onTick(now());
    scheduleNextTick();
  }

  scheduleNextTick();
  visibility.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    clearPendingTick();
    visibility.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

/**
 * Build the DS home-screen month grid from the same Las Vegas date as the
 * clock. UTC arithmetic deliberately avoids the visitor's local time zone
 * changing where a month starts in the grid.
 */
export function getDsCalendar(date: Date): DsCalendar {
  const { year, month, day } = getDsClockParts(date);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array<number | null>(42).fill(null);

  for (let number = 1; number <= daysInMonth; number += 1) {
    days[firstWeekday + number - 1] = number;
  }

  return {
    year,
    month,
    day,
    monthLabel: `${calendarMonthFormatter.format(date).toUpperCase()} ${year}`,
    weekCount: firstWeekday + daysInMonth > 35 ? 6 : 5,
    days,
  };
}
