import { MAX_DAYS } from "../reports/daily-reports";
import type { ShopArgsResult, ShopPeriodArgs, ShopSalesPeriod } from "./types";

/**
 * One place that turns "last week" or a pair of dates into calendar days, so
 * every sales tool means the same days by the same words.
 *
 * Days are "YYYY-MM-DD" strings in shop time. The arithmetic is done on the
 * calendar, never on clock hours, so daylight-saving changes cannot shift it.
 */

export const SHOP_PERIODS: ReadonlyArray<ShopSalesPeriod> = [
  "today",
  "yesterday",
  "date",
  "last_7_days",
  "month_to_date",
  "last_week",
  "last_month",
  "range",
];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written "2026-11-12". */
export function isCalendarDay(text: string): boolean {
  const m = DAY_RE.exec(text);
  if (!m) return false;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return at.toISOString().slice(0, 10) === text;
}

/** "2026-11-01" plus -1 is "2026-10-31". */
export function addDays(day: string, count: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + count);
  return at.toISOString().slice(0, 10);
}

const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Mon, Nov 16". */
export function dayLabel(day: string): string {
  return dayLabelFormat.format(new Date(`${day}T12:00:00Z`));
}

/** Monday is 0, Sunday is 6. */
function weekdayIndex(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The oldest day the sales tools will report on: the Daily report's own limit. */
export function oldestReportDay(today: string): string {
  return addDays(today, -(MAX_DAYS - 1));
}

export type ResolvedPeriod =
  | { ok: true; from: string; to: string; single: boolean; label: string }
  | { ok: false; message: string };

/**
 * The days a period covers, both ends included.
 *  - last_week: the last full Monday-to-Sunday week.
 *  - last_month: the last full calendar month.
 *  - last_7_days: today and the six days before.
 * A period that reaches past the Daily report's 90 days is refused, because
 * older sales may no longer be on file and the total would be short.
 */
export function resolvePeriod(args: ShopPeriodArgs, today: string): ResolvedPeriod {
  let from: string;
  let to: string;
  switch (args.period) {
    case "today":
      from = to = today;
      break;
    case "yesterday":
      from = to = addDays(today, -1);
      break;
    case "date":
      from = to = args.date ?? today;
      break;
    case "last_7_days":
      from = addDays(today, -6);
      to = today;
      break;
    case "month_to_date":
      from = `${today.slice(0, 7)}-01`;
      to = today;
      break;
    case "last_week": {
      const thisMonday = addDays(today, -weekdayIndex(today));
      from = addDays(thisMonday, -7);
      to = addDays(thisMonday, -1);
      break;
    }
    case "last_month": {
      to = addDays(`${today.slice(0, 7)}-01`, -1);
      from = `${to.slice(0, 7)}-01`;
      break;
    }
    case "range":
      from = args.from ?? today;
      to = args.to ?? today;
      break;
  }

  if (from > to) return { ok: false, message: `${dayLabel(from)} is after ${dayLabel(to)}. Give the earlier day first.` };
  if (from > today) return { ok: false, message: `${dayLabel(from)} hasn't happened yet.` };
  // A range that runs past today simply stops at today.
  if (to > today) to = today;
  const oldest = oldestReportDay(today);
  if (from < oldest) {
    return {
      ok: false,
      message: `${dayLabel(from)} is too far back. Sales reports keep the last ${MAX_DAYS} days, back to ${dayLabel(oldest)}.`,
    };
  }
  const single = from === to;
  return { ok: true, from, to, single, label: single ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}` };
}

/** Reads period arguments from untrusted input. Only format is checked here; the range is checked when it runs. */
export function readPeriodArgs(input: Record<string, unknown>): ShopArgsResult<ShopPeriodArgs> {
  const period = SHOP_PERIODS.find((p) => p === input.period);
  if (!period) return { ok: false, error: "period is not one of the listed periods" };
  if (period === "date") {
    if (typeof input.date !== "string" || !isCalendarDay(input.date)) {
      return { ok: false, error: "date must be a real day written YYYY-MM-DD" };
    }
    return { ok: true, args: { period, date: input.date } };
  }
  if (period === "range") {
    if (
      typeof input.from !== "string" ||
      typeof input.to !== "string" ||
      !isCalendarDay(input.from) ||
      !isCalendarDay(input.to)
    ) {
      return { ok: false, error: "from and to must be real days written YYYY-MM-DD" };
    }
    return { ok: true, args: { period, from: input.from, to: input.to } };
  }
  return { ok: true, args: { period } };
}

/** The words for a period in a title: "last week", "Mon, Nov 9 to Sun, Nov 15". */
export function periodWords(args: ShopPeriodArgs, resolved: { label: string }): string {
  switch (args.period) {
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "last_7_days":
      return "the last 7 days";
    case "month_to_date":
      return "this month";
    case "last_week":
      return "last week";
    case "last_month":
      return "last month";
    default:
      return resolved.label;
  }
}
