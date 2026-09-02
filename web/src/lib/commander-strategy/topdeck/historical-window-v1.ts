import { logicalMonthWindows } from "./window-planner";

/** Rolling 12 calendar months ending in anchor month (default: current UTC month). */
export function twelveMonthWindowKeys(anchor: Date = new Date()): string[] {
  const end = new Date(anchor);
  end.setUTCDate(1);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 11);
  return logicalMonthWindows({ startAt: start, months: 12 }).map((w) => w.label);
}

export function monthStartIso(monthKey: string): string {
  return `${monthKey}-01`;
}

export function latestMonthKey(monthKeys: string[]): string {
  return [...monthKeys].sort().at(-1) ?? monthKeys[0] ?? "";
}
