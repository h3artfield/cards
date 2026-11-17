import {
  MAX_DAYS,
  buildDailySales,
  storeDay,
  type DailySaleLine,
  type DailySalesDay,
} from "../../reports/daily-reports";
import type { InventoryItem } from "../../types";
import { formatMoney, plural } from "../format";
import { addDays, dayLabel, isCalendarDay, resolvePeriod } from "../period";
import type { ShopAnswer, ShopToolArgs } from "../types";

export const SALES_SUMMARY_MAX_LINES = 10;

// The day helpers moved to ../period; these names are kept for existing imports.
export { addDays, dayLabel, isCalendarDay };

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

  const MULTI_DAY_TITLES: Partial<Record<ShopToolArgs["sales_summary"]["period"], string>> = {
    month_to_date: "Sales this month",
    last_7_days: "Sales, last 7 days",
    last_week: "Sales last week",
    last_month: "Sales last month",
    range: "Sales",
  };
  const multiDayTitle = MULTI_DAY_TITLES[args.period];
  if (multiDayTitle) {
    const period = resolvePeriod(args, today);
    const base = {
      title: multiDayTitle,
      href: `/admin/reports?section=daily&day=${period.ok ? period.to : today}`,
      hrefLabel: "Open Daily report",
      asOf,
    };
    if (!period.ok) {
      return { ...base, href: "/admin/reports?section=daily", lines: [period.message] };
    }
    const inRange = days.filter((d) => d.date >= period.from && d.date <= period.to).reverse();
    const t = totalOf(inRange);
    const span = `${dayLabel(period.from)} to ${dayLabel(period.to)}`;
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
