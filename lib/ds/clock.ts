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

/** Format the firmware clock in Las Vegas/Pacific time. Intl applies PST/PDT automatically. */
export function formatDsTime(date: Date): string {
  return timeFormatter.format(date);
}

/** Format the full calendar date in Las Vegas/Pacific time. */
export function formatDsDate(date: Date): string {
  return dateFormatter.format(date);
}
