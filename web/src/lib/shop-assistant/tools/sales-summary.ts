import {
  MAX_DAYS,
  buildDailySales,
  storeDay,
  type DailySaleLine,
  type DailySalesDay,
} from "../../reports/daily-reports";
import type { InventoryItem } from "../../types";
import { formatMoney, plural } from "../format";
import type { ShopAnswer, ShopToolArgs } from "../types";

export const SALES_SUMMARY_MAX_LINES = 10;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written "2026-11-12". */
export function isCalendarDay(text: string): boolean {
  const m = DAY_RE.exec(text);
  if (!m) return false;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return at.toISOString().slice(0, 10) === text;
}

/** "2026-11-01" plus -1 is "2026-10-31". Calendar days, so clock changes do not matter. */
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sold(units: number, revenue: number): string {
  return units ? `${plural(units, "card", "cards")}, ${formatMoney(revenue)}` : "nothing";
}

function where(line: DailySaleLine): string {
  return line.channel === "in_store" ? "In store" : "Online";
}

type Totals = {
  units: number;
  revenue: number;
  inStore: { units: number; revenue: number };
  online: { units: number; revenue: number };
};

/** Add up days the report has already rounded to the cent. */
function totalOf(days: DailySalesDay[]): Totals {
  const t: Totals = {
    units: 0,
    revenue: 0,
    inStore: { units: 0, revenue: 0 },
    online: { units: 0, revenue: 0 },
  };
  for (const d of days) {
    t.units += d.sales.units;
    t.revenue += d.sales.revenue;
    t.inStore.units += d.sales.inStore.units;
    t.inStore.revenue += d.sales.inStore.revenue;
    t.online.units += d.sales.online.units;
    t.online.revenue += d.sales.online.revenue;
  }
  t.revenue = round2(t.revenue);
  t.inStore.revenue = round2(t.inStore.revenue);
  t.online.revenue = round2(t.online.revenue);
  return t;
}

function splitLine(t: Totals): string {
  return `In store: ${sold(t.inStore.units, t.inStore.revenue)}. Online: ${sold(t.online.units, t.online.revenue)}.`;
}

/** "How did we do today / yesterday / on a day / this month / this week?" */
export function salesSummaryAnswer(
  inventory: InventoryItem[],
  args: ShopToolArgs["sales_summary"],
  now: Date,
): ShopAnswer {
  const days = buildDailySales(inventory);
  const today = storeDay(now);
  const asOf = now.toISOString();
  const note = "Same numbers as the Daily report. Days are cut at midnight, shop time.";

  if (args.period === "month_to_date" || args.period === "last_7_days") {
    const first = args.period === "month_to_date" ? `${today.slice(0, 7)}-01` : addDays(today, -6);
    const inRange = days.filter((d) => d.date >= first && d.date <= today).reverse();
    const t = totalOf(inRange);
    const title = args.period === "month_to_date" ? "Sales this month" : "Sales, last 7 days";
    const span = `${dayLabel(first)} to ${dayLabel(today)}`;
    const base = {
      title,
      href: `/admin/reports?section=daily&day=${today}`,
      hrefLabel: "Open Daily report",
      asOf,
    };
    if (!t.units) {
      return { ...base, lines: [`No sales from ${span}.`], note };
    }
    return {
      ...base,
      lines: [`${span}: ${sold(t.units, t.revenue)}.`, splitLine(t)],
      columns: ["Day", "Cards", "Sales"],
      rows: inRange.map((d) => [dayLabel(d.date), String(d.sales.units), formatMoney(d.sales.revenue)]),
      note: `${note} Days with no sales are not listed.`,
    };
  }

  const day =
    args.period === "today" ? today : args.period === "yesterday" ? addDays(today, -1) : (args.date ?? today);
  const named =
    day === today ? `Today (${dayLabel(day)})` : day === addDays(today, -1) ? `Yesterday (${dayLabel(day)})` : dayLabel(day);
  const base = {
    title: `Sales: ${dayLabel(day)}`,
    href: `/admin/reports?section=daily&day=${day}`,
    hrefLabel: "Open Daily report",
    asOf,
  };

  if (day > today) {
    return { ...base, href: "/admin/reports?section=daily", lines: [`${dayLabel(day)} hasn't happened yet.`] };
  }
  if (day <= addDays(today, -MAX_DAYS)) {
    return {
      ...base,
      href: "/admin/reports?section=daily",
      lines: [`${dayLabel(day)} is too far back. Daily reports keep the last ${MAX_DAYS} days.`],
    };
  }

  const found = days.find((d) => d.date === day);
  // A day with no sales still carries the month's running total up to it.
  const before = [...days].reverse().find((d) => d.date < day && d.date.slice(0, 7) === day.slice(0, 7));
  const month = found?.monthToDate ?? before?.monthToDate ?? { units: 0, revenue: 0 };
  const monthLine = `Month to date: ${sold(month.units, month.revenue)}.`;

  if (!found || !found.sales.units) {
    return { ...base, lines: [`${named}: no sales${day === today ? " yet" : ""}.`, monthLine], note };
  }

  const { sales } = found;
  const shown = sales.lines.slice(0, SALES_SUMMARY_MAX_LINES);
  return {
    ...base,
    lines: [`${named}: ${sold(sales.units, sales.revenue)}.`, splitLine(sales), monthLine],
    columns: ["Card", "Set · condition", "Qty", "Each", "Where"],
    rows: shown.map((line) => [
      line.name,
      [line.setName, line.condition].filter(Boolean).join(" · "),
      String(line.quantity),
      formatMoney(line.unitPrice),
      where(line),
    ]),
    note:
      sales.lines.length > shown.length
        ? `Showing the latest ${shown.length} of ${sales.lines.length} sale lines. ${note}`
        : note,
  };
}
