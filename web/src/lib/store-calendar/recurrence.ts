import type { StoreEvent } from "./types";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function endOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
}

export function startOfMonthDate(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1, 0, 0, 0, 0);
}

/** Extract clock time from an ISO/local datetime string. */
export function clockParts(iso: string): {
  hours: number;
  minutes: number;
} {
  const d = new Date(iso);
  return { hours: d.getHours(), minutes: d.getMinutes() };
}

export function applyClockToDate(
  day: Date,
  hours: number,
  minutes: number,
): Date {
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function firstWeekdayOnOrAfter(
  from: Date,
  weekday: WeekdayIndex,
): Date {
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    if (cursor.getDay() === weekday) return cursor;
    cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

export type WeeklyOccurrence = Pick<StoreEvent, "startAt" | "endAt">;

export function expandWeeklyOccurrences(input: {
  anchorStartAt: string;
  anchorEndAt: string;
  weekday: WeekdayIndex;
  until: Date;
  skipDates?: string[];
  /** Prefer explicit HH:mm (store local) over clock from anchor ISO. */
  startTime?: string;
  endTime?: string;
}): WeeklyOccurrence[] {
  const startClock = input.startTime
    ? parseHm(input.startTime)
    : clockParts(input.anchorStartAt);
  const endClock = input.endTime
    ? parseHm(input.endTime)
    : clockParts(input.anchorEndAt);
  const skip = new Set(
    (input.skipDates ?? []).map((d) => d.slice(0, 10)),
  );

  const first = firstWeekdayOnOrAfter(new Date(input.anchorStartAt), input.weekday);
  const occurrences: WeeklyOccurrence[] = [];

  for (
    let cursor = new Date(first);
    cursor.getTime() <= input.until.getTime();
    cursor.setDate(cursor.getDate() + 7)
  ) {
    const dayKey = cursor.toISOString().slice(0, 10);
    if (skip.has(dayKey)) continue;

    const start = applyClockToDate(cursor, startClock.hours, startClock.minutes);
    let end = applyClockToDate(cursor, endClock.hours, endClock.minutes);
    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }

    occurrences.push({
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
  }

  return occurrences;
}

function parseHm(hm: string): { hours: number; minutes: number } {
  const [h, m] = hm.split(":").map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

export function parseWeekday(raw: unknown): WeekdayIndex | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n as WeekdayIndex;
  return null;
}

export function weekdayFromDate(iso: string): WeekdayIndex {
  return new Date(iso).getDay() as WeekdayIndex;
}
