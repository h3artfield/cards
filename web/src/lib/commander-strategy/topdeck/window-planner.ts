/**
 * TopDeck import window planning — pure functions for tests and importer.
 */

export type DateWindow = {
  start: Date;
  end: Date;
  label: string;
};

export type ImportConfigKey = {
  startIso: string;
  endIso: string;
  months: number;
  format: string;
};

export function importConfigKey(input: {
  startAt: Date;
  months: number;
  format?: string;
}): string {
  const start = startOfUtcDay(input.startAt);
  start.setUTCDate(1);
  const end = endOfUtcMonth(addUtcMonths(start, input.months - 1));
  return [
    "topdeck-edh",
    formatYmd(start),
    formatYmd(end),
    `months=${input.months}`,
    `format=${input.format ?? "EDH"}`,
  ].join(":");
}

export function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export function endOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

export function endOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function addUtcMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Logical month windows from explicit --start (never resumes from unrelated checkpoint). */
export function logicalMonthWindows(input: {
  startAt: Date;
  months: number;
}): DateWindow[] {
  const windows: DateWindow[] = [];
  const cursor = new Date(input.startAt);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < input.months; i += 1) {
    const start = new Date(cursor);
    const end = endOfUtcMonth(start);
    windows.push({
      start,
      end,
      label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return windows;
}

/** Subdivide [start,end] into ~7-day fetch windows. */
export function subdivideIntoWeekWindows(input: { start: Date; end: Date }): DateWindow[] {
  return subdivideByDays(input, 7);
}

/** Subdivide into N-day windows (minimum 1 day). */
export function subdivideByDays(input: { start: Date; end: Date }, days: number): DateWindow[] {
  const windows: DateWindow[] = [];
  let cursor = startOfUtcDay(input.start);
  const endLimit = endOfUtcDay(input.end);

  while (cursor.getTime() <= endLimit.getTime()) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + days - 1);
    const end = chunkEnd.getTime() > endLimit.getTime() ? endLimit : endOfUtcDay(chunkEnd);
    windows.push({
      start: new Date(cursor),
      end,
      label: `${formatYmd(cursor)}..${formatYmd(end)}`,
    });
    cursor = new Date(end);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }
  return windows;
}

export function monthKeyFromWindow(window: DateWindow): string {
  return window.label.length === 7 ? window.label : window.start.toISOString().slice(0, 7);
}

export function windowsForInitialAttempt(logicalMonth: DateWindow): DateWindow[] {
  return [logicalMonth];
}

export function nextSubdivisionWindows(failedWindow: DateWindow, splitDepth: number): DateWindow[] {
  if (splitDepth <= 0) return subdivideIntoWeekWindows(failedWindow);
  if (splitDepth === 1) return subdivideByDays(failedWindow, 3);
  return subdivideByDays(failedWindow, 1);
}

export function intervalKey(start: Date, end: Date): string {
  return `${formatYmd(start)}..${formatYmd(end)}`;
}
