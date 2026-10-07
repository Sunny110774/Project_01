const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function easternParts(date: Date) {
  const parts = easternDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function easternLocalTimeToUtc(year: number, month: number, day: number, hour: number) {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour);
  let timestamp = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = easternParts(new Date(timestamp));
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    timestamp += targetAsUtc - representedAsUtc;
  }
  return new Date(timestamp);
}

function shiftCalendarDate(year: number, month: number, day: number, days: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function getEasternBusinessDay(now = new Date()) {
  const { year, month, day, hour } = easternParts(now);
  const start = easternLocalTimeToUtc(year, month, day, 0);
  const cutoff = easternLocalTimeToUtc(year, month, day, 17);
  const nextDay = shiftCalendarDate(year, month, day, 1);
  const nextStart = easternLocalTimeToUtc(nextDay.year, nextDay.month, nextDay.day, 0);
  return {
    start,
    cutoff,
    nextStart,
    isBeforeCutoff: hour < 17,
  };
}

export function getEasternDateKey(date: Date) {
  const { year, month, day } = easternParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
