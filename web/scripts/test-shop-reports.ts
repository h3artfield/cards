/**
 * Step B1: the period arithmetic and the three reporting lookups (top
 * sellers, sales by shelf, slow stock). Plain fixtures: no Firestore, no
 * OpenAI. Every card and sale here is invented.
 *
 *   npx tsx scripts/test-shop-reports.ts
 */
import { withSaleLog } from "../src/lib/inventory/sale-log";
import { MAX_DAYS, saleEvents } from "../src/lib/reports/daily-reports";
import { agentToolDefinitions } from "../src/lib/shop-assistant/agent-tools";
import {
  addDays,
  dayLabel,
  oldestReportDay,
  periodWords,
  readPeriodArgs,
  resolvePeriod,
} from "../src/lib/shop-assistant/period";
import type { AgentModel, AgentModelRequest } from "../src/lib/shop-assistant/openai-tools";
import { getShopTool, runShopTool } from "../src/lib/shop-assistant/registry";
import {
  REPORT_RECIPES,
  REPORT_WRITER_PROMPT,
  buildReportTables,
  reportNeeds,
  writeReportWords,
} from "../src/lib/shop-assistant/report";
import {
  salesByShelf,
  salesByShelfAnswer,
  salesInPeriod,
  topSellers,
  topSellersAnswer,
} from "../src/lib/shop-assistant/tools/sales-breakdown";
import { salesSummaryAnswer } from "../src/lib/shop-assistant/tools/sales-summary";
import { slowStock, slowStockAnswer } from "../src/lib/shop-assistant/tools/slow-stock";
import type { ShopAnswer, ShopToolData } from "../src/lib/shop-assistant/types";
import type { InventoryItem } from "../src/lib/types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}
function same(got: unknown, want: unknown, msg: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  assert(ok, msg);
  if (!ok) console.error(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
}

const STORE = "s1";
/** Monday, November 16, 2026, midday shop time. */
const NOW = new Date("2026-11-16T18:00:00Z");
const TODAY = "2026-11-16";
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const answers: ShopAnswer[] = [];
const keep = (a: ShopAnswer) => { answers.push(a); return a; };

let nextId = 0;
function card(name: string, over: Partial<InventoryItem> = {}): InventoryItem {
  nextId += 1;
  return { id: `i${nextId}`, storeId: STORE, source: "tcgplayer_import", displayName: name, productName: name, productLine: "Magic", tcgplayerCondition: "Near Mint", tcgplayerProductId: `p${nextId}`, tcgplayerListingKey: `p${nextId}|nm`, quantity: 1, listPrice: 1, acquiredAt: daysAgo(20), ...over };
}
const sale = (at: string, quantity: number, unitPrice: number, channel: "in_store" | "shopify" = "in_store") => ({ at, quantity, unitPrice, channel });

/* ----------------------------------------------------------------- periods */
console.log("\nperiods");
const span = (args: Parameters<typeof resolvePeriod>[0], today = TODAY) => { const r = resolvePeriod(args, today); return r.ok ? [r.from, r.to] : r.message; };
same(span({ period: "today" }), ["2026-11-16", "2026-11-16"], "today");
same(span({ period: "yesterday" }), ["2026-11-15", "2026-11-15"], "yesterday");
same(span({ period: "last_7_days" }), ["2026-11-10", "2026-11-16"], "last 7 days is today and the six before");
same(span({ period: "month_to_date" }), ["2026-11-01", "2026-11-16"], "month to date");
same(span({ period: "last_week" }), ["2026-11-09", "2026-11-15"], "last week, asked on a Monday: the Monday to Sunday just ended");
same(span({ period: "last_week" }, "2026-11-22"), ["2026-11-09", "2026-11-15"], "last week, asked on a Sunday: still the week before this one");
same(span({ period: "last_week" }, "2026-11-18"), ["2026-11-09", "2026-11-15"], "last week, asked midweek");
same(span({ period: "last_week" }, "2027-01-02"), ["2026-12-21", "2026-12-27"], "last week across a new year");
same(span({ period: "last_month" }), ["2026-10-01", "2026-10-31"], "last month");
same(span({ period: "last_month" }, "2027-01-05"), ["2026-12-01", "2026-12-31"], "last month in January is December");
same(span({ period: "last_month" }, "2028-03-10"), ["2028-02-01", "2028-02-29"], "last month knows a leap February");
same(span({ period: "range", from: "2026-11-02", to: "2026-11-08" }), ["2026-11-02", "2026-11-08"], "a range, both ends included");
same(span({ period: "range", from: "2026-11-10", to: "2026-11-30" }), ["2026-11-10", "2026-11-16"], "a range that runs past today stops at today");
same(span({ period: "range", from: "2026-11-08", to: "2026-11-02" }), "Sun, Nov 8 is after Mon, Nov 2. Give the earlier day first.", "a backwards range is explained");
same(span({ period: "date", date: "2026-11-20" }), "Fri, Nov 20 hasn't happened yet.", "a future day");
assert(oldestReportDay(TODAY) === "2026-08-19" && addDays(TODAY, -(MAX_DAYS - 1)) === "2026-08-19", "the oldest reportable day is the Daily report's own limit");
same(span({ period: "range", from: "2026-08-19", to: "2026-08-25" }), ["2026-08-19", "2026-08-25"], "a range starting on the oldest kept day is allowed");
same(span({ period: "range", from: "2026-08-18", to: "2026-08-25" }), "Tue, Aug 18 is too far back. Sales reports keep the last 90 days, back to Wed, Aug 19.", "a range reaching past 90 days is refused, with the reason");
const week = resolvePeriod({ period: "last_week" }, TODAY);
assert(week.ok && week.label === "Mon, Nov 9 to Sun, Nov 15" && !week.single && periodWords({ period: "last_week" }, week) === "last week", "a period carries its exact dates and its plain name");
assert(dayLabel("2026-11-09") === "Mon, Nov 9", "day label");

same(readPeriodArgs({ period: "last_week", date: "2026-11-01", from: "x" }), { ok: true, args: { period: "last_week" } }, "period args: extra keys dropped");
same(readPeriodArgs({ period: "range", from: "2026-11-02", to: "2026-11-08" }), { ok: true, args: { period: "range", from: "2026-11-02", to: "2026-11-08" } }, "period args: a range");
assert(!readPeriodArgs({ period: "range", from: "2026-11-02" }).ok && !readPeriodArgs({ period: "range", from: "2026-02-30", to: "2026-03-01" }).ok && !readPeriodArgs({ period: "date" }).ok && !readPeriodArgs({ period: "all_time" }).ok && !readPeriodArgs({}).ok, "period args: a range needs two real days; unknown periods refused");

/* ------------------------------------------------------------ the fixture */
// Last week is Nov 9 to Nov 15. Sales, hand-counted:
//   Bolt (NM, shelf 2-2):   Nov 10 ×2 @ 2.50, Nov 14 ×1 @ 2.50          3 sold, $7.50   (and Nov 16 ×1 @ 2.50: this week)
//   Bolt (LP, shelf 2-2):   Nov 12 ×1 @ 2.00                            1 sold, $2.00
//   Mox  (NM, Binder U):    Nov 13 ×1 @ 40.00 online                    1 sold, $40.00  now sold out
//   Elf  (NM, no shelf):    Nov 9 ×5 @ 0.25                             5 sold, $1.25
//   Bulk (NM, Bulk):        Nov 15 ×4 @ 0.10                            4 sold, $0.40
//   Old  (NM, shelf 1-1):   Nov 2 ×1 @ 9.00                             the week before
// Last week: 14 cards, $51.15.
const boltNm = card("Lightning Bolt", { setName: "Magic 2011", shelfLocation: "2-2", quantity: 3, saleLog: [sale("2026-11-10T18:00:00Z", 2, 2.5), sale("2026-11-14T18:00:00Z", 1, 2.5), sale("2026-11-16T15:00:00Z", 1, 2.5)] });
const boltLp = card("Lightning Bolt", { setName: "Magic 2011", tcgplayerCondition: "Lightly Played", shelfLocation: "2-2", quantity: 1, saleLog: [sale("2026-11-12T18:00:00Z", 1, 2)] });
const mox = card("Mox Opal", { setName: "Scars", shelfLocation: "Binder U", quantity: 0, status: "sold", saleLog: [sale("2026-11-13T18:00:00Z", 1, 40, "shopify")] });
const elf = card("Llanowar Elves", { setName: "Dominaria", quantity: 20, saleLog: [sale("2026-11-09T18:00:00Z", 5, 0.25)] });
const bulk = card("Bulk Common", { shelfLocation: "Bulk", quantity: 100, saleLog: [sale("2026-11-15T18:00:00Z", 4, 0.1)] });
const old = card("Old Sale", { shelfLocation: "1-1", quantity: 2, saleLog: [sale("2026-11-02T18:00:00Z", 1, 9)] });
const stock = [boltNm, boltLp, mox, elf, bulk, old, card("Never Sold", { shelfLocation: "1-2", quantity: 4 })];
const LAST_WEEK = { period: "last_week" as const };

console.log("\nsales in a period");
const lastWeek = salesInPeriod(stock, LAST_WEEK, NOW);
assert(lastWeek.ok && lastWeek.units === 14 && lastWeek.revenue === 51.15 && lastWeek.lines.length === 6 && lastWeek.label === "Mon, Nov 9 to Sun, Nov 15", "last week: 14 cards, $51.15, from six sale lines");
const summary = keep(salesSummaryAnswer(stock, LAST_WEEK, NOW));
assert(summary.title === "Sales last week" && summary.lines[0] === "Mon, Nov 9 to Sun, Nov 15: 14 cards, $51.15.", "sales_summary agrees on the same period");
assert(summary.rows!.length === 6 && summary.href!.endsWith("day=2026-11-15"), "one row per day with sales; the link opens the period's last day");
same(keep(salesSummaryAnswer(stock, { period: "range", from: "2026-11-02", to: "2026-11-08" }, NOW)).lines[0], "Mon, Nov 2 to Sun, Nov 8: 1 card, $9.00.", "sales_summary takes a range");
same(keep(salesSummaryAnswer(stock, { period: "last_month" }, NOW)).lines, ["No sales from Thu, Oct 1 to Sat, Oct 31."], "sales_summary takes last month");
same(keep(salesSummaryAnswer(stock, { period: "range", from: "2026-07-01", to: "2026-07-31" }, NOW)).lines, ["Wed, Jul 1 is too far back. Sales reports keep the last 90 days, back to Wed, Aug 19."], "a range that is too old says why");
assert(saleEvents(mox).length === 1 && saleEvents(card("Single", { soldAt: daysAgo(1), soldPrice: 3 })).length === 1 && saleEvents(card("None")).length === 0, "saleEvents is the Daily report's own: the log, or one sale for a sold single");

/* ------------------------------------------------------------- top sellers */
console.log("\ntop_sellers");
if (lastWeek.ok) {
  same(topSellers(stock, lastWeek.lines, "revenue").map((r) => [r.name, r.condition, r.units, r.revenue, r.inStock]), [
    ["Mox Opal", "NM", 1, 40, 0],
    ["Lightning Bolt", "NM", 3, 7.5, 3],
    ["Lightning Bolt", "LP", 1, 2, 1],
    ["Llanowar Elves", "NM", 5, 1.25, 20],
    ["Bulk Common", "NM", 4, 0.4, 100],
  ], "by revenue: each printing and condition on its own line; this week's and older sales left out");
  same(topSellers(stock, lastWeek.lines, "units").map((r) => r.name), ["Llanowar Elves", "Bulk Common", "Lightning Bolt", "Mox Opal", "Lightning Bolt"], "by copies sold; ties go to the higher sales");
  const sums = topSellers(stock, lastWeek.lines, "revenue").reduce((t, r) => ({ units: t.units + r.units, revenue: t.revenue + r.revenue }), { units: 0, revenue: 0 });
  assert(sums.units === lastWeek.units && Math.round(sums.revenue * 100) / 100 === lastWeek.revenue, "the lines add up to the period's total");
  assert(topSellers([], lastWeek.lines, "revenue")[0]!.inStock === null, "a row no longer in inventory has no stock figure");
}
const top = keep(topSellersAnswer(stock, { ...LAST_WEEK, by: "revenue", limit: 3 }, NOW));
same(top.lines, ["Mon, Nov 9 to Sun, Nov 15: 14 cards sold for $51.15, across 5 listings.", "Most money in: Mox Opal, $40.00."], "summary lines");
same(top.rows, [["Mox Opal", "Scars · NM", "1", "$40.00", "0"], ["Lightning Bolt", "Magic 2011 · NM", "3", "$7.50", "3"], ["Lightning Bolt", "Magic 2011 · LP", "1", "$2.00", "1"]], "rows: card, set and condition, sold, sales, in stock now (a sold-out winner shows 0)");
assert(top.title === "Top sellers: Mon, Nov 9 to Sun, Nov 15" && top.note!.endsWith("Showing the top 3 of 5.") && top.href!.endsWith("day=2026-11-15"), "title carries the dates; the cut is stated");
assert(keep(topSellersAnswer(stock, { ...LAST_WEEK, by: "units", limit: 10 }, NOW)).lines[1] === "Most copies sold: Llanowar Elves, 5.", "by copies");
same(keep(topSellersAnswer(stock, { period: "last_month", by: "revenue", limit: 10 }, NOW)).lines, ["No sales from Thu, Oct 1 to Sat, Oct 31."], "nothing sold");
same(keep(topSellersAnswer(stock, { period: "date", date: "2026-11-11", by: "revenue", limit: 10 }, NOW)).lines, ["No sales on Wed, Nov 11."], "nothing sold on one day");
same(keep(topSellersAnswer(stock, { period: "range", from: "2026-01-01", to: "2026-01-31", by: "revenue", limit: 10 }, NOW)).lines, ["Thu, Jan 1 is too far back. Sales reports keep the last 90 days, back to Wed, Aug 19."], "too old is refused with the reason");

/* ---------------------------------------------------------- sales by shelf */
console.log("\nsales_by_shelf");
if (lastWeek.ok) {
  same(salesByShelf(lastWeek.lines, "any").map((r) => [r.location, r.units, r.revenue]), [["Binder U", 1, 40], ["2-2", 4, 9.5], ["", 5, 1.25], ["Bulk", 4, 0.4]], "by shelf, most sales first; cards with no shelf share a row");
  const shelfSum = salesByShelf(lastWeek.lines, "any").reduce((t, r) => ({ units: t.units + r.units, revenue: t.revenue + r.revenue, share: t.share + r.share }), { units: 0, revenue: 0, share: 0 });
  assert(shelfSum.units === lastWeek.units && Math.round(shelfSum.revenue * 100) / 100 === lastWeek.revenue && Math.abs(shelfSum.share - 1) < 1e-9, "the shelves add up to the period's total, and the shares to 100%");
  same(salesByShelf(lastWeek.lines, "case").map((r) => r.location), ["2-2"], "case shelves only");
  assert(Math.abs(salesByShelf(lastWeek.lines, "case")[0]!.share - 9.5 / 51.15) < 1e-9, "with a filter, share is still of all sales");
}
const shelves = keep(salesByShelfAnswer(stock, { ...LAST_WEEK, kind: "any" }, NOW));
same(shelves.lines, ["Mon, Nov 9 to Sun, Nov 15: 14 cards sold for $51.15.", "Most came from Binder U · Blue: $40.00, 78% of sales."], "summary lines");
same(shelves.rows, [["Binder U · Blue", "1", "$40.00", "78%"], ["2-2 · Red", "4", "$9.50", "19%"], ["No location", "5", "$1.25", "2%"], ["Bulk", "4", "$0.40", "1%"]], "rows: shelf, sold, sales, share");
assert(shelves.note!.startsWith("By where each card sat when it sold, or its current shelf for older sales."), "the note says which shelf is meant");

console.log("\nshelf at the time of sale");
{
  const onShelf = card("Moved Later", { shelfLocation: " 1-1 ", quantity: 3 });
  const log = withSaleLog(onShelf, { at: "2026-11-10T18:00:00Z", quantity: 1, unitPrice: 5, channel: "in_store" })!;
  same(log, [{ at: "2026-11-10T18:00:00Z", quantity: 1, unitPrice: 5, channel: "in_store", location: "1-1" }], "a sale records the shelf the card sold from");
  const noShelf = withSaleLog(card("Loose", { quantity: 2 }), { at: "2026-11-10T18:00:00Z", quantity: 1, unitPrice: 5, channel: "shopify" })!;
  assert(!("location" in noShelf[0]!), "a card with no shelf records no location key at all");
  // Sold from 1-1, then moved to a binder, then sold again from there.
  const moved = { ...onShelf, shelfLocation: "Binder W", saleLog: log };
  const secondLog = withSaleLog(moved, { at: "2026-11-12T18:00:00Z", quantity: 1, unitPrice: 5, channel: "in_store" })!;
  const after = { ...moved, saleLog: secondLog };
  const legacy = card("Before Tracking", { shelfLocation: "2-1", saleLog: [sale("2026-11-11T18:00:00Z", 2, 3)] });
  const movedSales = salesInPeriod([after, legacy], LAST_WEEK, NOW);
  if (movedSales.ok) {
    same(salesByShelf(movedSales.lines, "any").map((r) => [r.location, r.units, r.revenue]), [["2-1", 2, 6], ["1-1", 1, 5], ["Binder W", 1, 5]], "a card sold from 1-1 and later moved to a binder counts for 1-1; a sale with no recorded shelf uses the current one");
    same(movedSales.lines.map((l) => l.location).sort(), ["1-1", "2-1", "Binder W"], "the Daily report's sale lines carry the same shelf");
  }
  assert(secondLog.length === 2 && secondLog[0]!.location === "1-1" && secondLog[1]!.location === "Binder W", "earlier entries are not rewritten");
}
const binders = keep(salesByShelfAnswer(stock, { ...LAST_WEEK, kind: "binder" }, NOW));
assert(binders.rows!.length === 1 && binders.note!.endsWith("Only binders are listed."), "binders only, and it says so");
same(keep(salesByShelfAnswer([elf], { ...LAST_WEEK, kind: "case" }, NOW)).lines, ["No sales from case shelves from Mon, Nov 9 to Sun, Nov 15."], "sales, but none from that kind of shelf");
same(keep(salesByShelfAnswer(stock, { period: "last_month", kind: "any" }, NOW)).lines, ["No sales from Thu, Oct 1 to Sat, Oct 31."], "nothing sold");

/* -------------------------------------------------------------- slow stock */
console.log("\nslow_stock");
const shelf: InventoryItem[] = [
  card("Sat Long", { setName: "Alpha", shelfLocation: "1-1", quantity: 2, listPrice: 30, tcgMarketPrice: 24, ingestedAt: daysAgo(200), acquiredAt: daysAgo(5) }),
  card("Sat Short", { quantity: 1, listPrice: 50, acquiredAt: daysAgo(59) }),
  card("Sat Exactly", { quantity: 1, listPrice: 10, acquiredAt: daysAgo(60) }),
  card("Sold Lately", { quantity: 3, listPrice: 80, acquiredAt: daysAgo(300), saleLog: [sale(daysAgo(10), 1, 80)] }),
  card("Sold Long Ago", { shelfLocation: "Binder W", quantity: 1, listPrice: 12, acquiredAt: daysAgo(300), saleLog: [sale(daysAgo(90), 1, 12)] }),
  card("Cheap", { quantity: 40, listPrice: 0.5, acquiredAt: daysAgo(300) }),
  card("Gone", { quantity: 0, status: "sold", listPrice: 99, acquiredAt: daysAgo(300) }),
  card("No Date", { quantity: 1, listPrice: 99, acquiredAt: "" }),
  { ...card("Buyback Card", { quantity: 1, listPrice: 99, acquiredAt: daysAgo(300) }), source: "buyback", tcgplayerListingKey: undefined },
];
const DEFAULTS = { minPrice: 2, olderThanDays: 60, limit: 15 };
same(slowStock(shelf, DEFAULTS, NOW).map((r) => [r.name, r.quantity, r.price, r.value, r.days]), [["Sat Long", 2, 30, 60, 200], ["Sold Long Ago", 1, 12, 12, 300], ["Sat Exactly", 1, 10, 10, 60]], "in stock 60 days or more, $2 or more, no sale in 60 days; most money tied up first");
assert(slowStock(shelf, DEFAULTS, NOW)[0]!.days === 200, "age is the ingested date when there is one, not the import date");
same(slowStock(shelf, { minPrice: 0, olderThanDays: 60, limit: 15 }, NOW).map((r) => r.name), ["Sat Long", "Cheap", "Sold Long Ago", "Sat Exactly"], "a lower price floor lets cheap cards in");
same(slowStock(shelf, { minPrice: 2, olderThanDays: 100, limit: 15 }, NOW).map((r) => r.name), ["Sat Long"], "a longer wait: the sale 90 days ago now counts as recent");
const slow = keep(slowStockAnswer(shelf, DEFAULTS, NOW));
same(slow.lines, ["3 listings (4 copies, $82.00 at shelf price) have sat: in stock 60 days or more, priced $2.00 or more, with no sale in the last 60 days."], "summary line states the rule");
same(slow.rows![0], ["Sat Long", "Alpha · NM", "2", "$30.00", "$24.00", "200", "1-1 · White"], "row: card, set and condition, qty, price, market, days, shelf");
assert(slow.rows![2]![4] === "—" && slow.rows![2]![6] === "No location", "no market price and no shelf are shown as such");
assert(slow.note!.includes("first copy") && slow.note!.endsWith("It does not suggest prices.") && !/\bmark(ed)? down to\b|\bsuggest(ed)? price\b|→/.test(JSON.stringify(slow)), "the note gives the caveats, and nothing suggests a price");
const cut = keep(slowStockAnswer(shelf, { ...DEFAULTS, limit: 2 }, NOW));
assert(cut.rows!.length === 2 && cut.lines[0]!.startsWith("3 listings") && cut.note!.startsWith("Showing the 2 with the most money tied up, of 3."), "a cut list still totals everything");
same(keep(slowStockAnswer([shelf[1]!], DEFAULTS, NOW)).lines, ["Nothing has sat that long: no cards in stock 60 days or more, priced $2.00 or more, with no sale in the last 60 days."], "nothing slow");

/* ---------------------------------------------------------------- registry */
console.log("\nregistry");
const data: ShopToolData = { storeId: STORE, inventory: stock, customers: [], creditEntries: [], settings: null, rules: [] };
same(getShopTool("top_sellers")!.validateArgs({ period: "last_week" }), { ok: true, args: { period: "last_week", by: "revenue", limit: 10 } }, "top_sellers args: defaults");
same(getShopTool("top_sellers")!.validateArgs({ period: "last_week", by: "units", limit: 99, storeId: "x" }), { ok: true, args: { period: "last_week", by: "units", limit: 20 } }, "top_sellers args: limit clamped, extras dropped");
assert(!getShopTool("top_sellers")!.validateArgs({}).ok && !getShopTool("sales_by_shelf")!.validateArgs({ period: "range" }).ok, "both need a valid period");
same(getShopTool("sales_by_shelf")!.validateArgs({ period: "yesterday", kind: "bulk" }), { ok: true, args: { period: "yesterday", kind: "any" } }, "sales_by_shelf args: unknown kind is any");
same(getShopTool("slow_stock")!.validateArgs(null), { ok: true, args: DEFAULTS }, "slow_stock args: all optional");
same(getShopTool("slow_stock")!.validateArgs({ minPrice: -5, olderThanDays: 3, limit: 500 }), { ok: true, args: { minPrice: 0, olderThanDays: 14, limit: 25 } }, "slow_stock args: clamped");
same(getShopTool("slow_stock")!.validateArgs({ minPrice: "10", olderThanDays: Number.NaN }), { ok: true, args: DEFAULTS }, "slow_stock args: junk falls back to defaults");
assert(["top_sellers", "sales_by_shelf", "slow_stock"].every((id) => { const t = getShopTool(id)!; return !t.sensitive && t.needs.length === 1 && t.needs[0] === "inventory"; }), "none is sensitive; each reads inventory only");
const ran = runShopTool("top_sellers", { period: "last_week" }, data, { now: NOW });
assert(ran.ok && ran.answer.rows!.length === 5, "runs through the registry");
if (ran.ok) keep(ran.answer);
const menu = agentToolDefinitions();
assert(["top_sellers", "sales_by_shelf", "slow_stock"].every((id) => menu.some((t) => t.name === id)) && JSON.stringify(menu.find((t) => t.name === "sales_summary")).includes("last_week"), "the conversation model is offered all three, and the new periods");

/* ----------------------------------------------------------------- reports */
async function reportTests() {
  console.log("\nreport recipes");
  const weekly = buildReportTables(REPORT_RECIPES.weekly, LAST_WEEK, data, NOW);
  assert(weekly.ok, "the weekly report builds");
  if (!weekly.ok) return;
  const report = weekly.report;
  same([report.kind, report.title, report.period, report.cautions, report.asOf], ["weekly", "Sales report: Mon, Nov 9 to Sun, Nov 15", { from: "2026-11-09", to: "2026-11-15" }, [], NOW.toISOString()], "title, exact dates and time");
  same(report.sections.map((s) => [s.heading, s.answer.title]), [
    ["Sales", "Sales last week"],
    ["Top sellers", "Top sellers: Mon, Nov 9 to Sun, Nov 15"],
    ["Sales by shelf", "Sales by shelf: Mon, Nov 9 to Sun, Nov 15"],
    ["Slowest shelves, last 30 days", "Slowest shelves"],
    ["Cards to move", "Cards to move"],
  ], "five fixed sections in order");
  same(report.sections[1]!.answer, topSellersAnswer(stock, { ...LAST_WEEK, by: "revenue", limit: 10 }, NOW), "each table is the lookup's own answer, unchanged");
  assert(report.summary === "Mon, Nov 9 to Sun, Nov 15: 14 cards, $51.15." && report.sections.every((s) => s.comment === undefined), "before any model call the summary is the sales line and there are no comments");
  same(reportNeeds(REPORT_RECIPES.weekly), ["inventory"], "a weekly report reads inventory only");
  const slowReport = buildReportTables(REPORT_RECIPES.slow_stock, LAST_WEEK, { ...data, inventory: shelf }, NOW);
  assert(slowReport.ok && slowReport.report.title === "Slow stock report" && slowReport.report.period === undefined && slowReport.report.sections.length === 3 && slowReport.report.sections[0]!.answer.rows!.length === 3, "the slow stock report: three sections, no period");
  same(buildReportTables(REPORT_RECIPES.weekly, { period: "range", from: "2026-01-01", to: "2026-01-31" }, data, NOW), { ok: false, message: "Thu, Jan 1 is too far back. Sales reports keep the last 90 days, back to Wed, Aug 19." }, "a period past 90 days is refused with the reason");
  let refused = "";
  try { buildReportTables({ ...REPORT_RECIPES.weekly, sections: [...REPORT_RECIPES.weekly.sections, { heading: "Store credit", tool: "store_credit", args: () => ({}) }] }, LAST_WEEK, data, NOW); } catch (err) { refused = String(err); }
  assert(refused.includes("may not include customer data"), "a recipe with a customer-data lookup cannot be built");
  assert(Object.values(REPORT_RECIPES).every((r) => r.sections.every((s) => getShopTool(s.tool)?.sensitive === false)), "no shipped recipe includes one");

  console.log("\nreport words");
  const seen: AgentModelRequest[] = [];
  const writer = (text: string | null): AgentModel => async (request) => { seen.push(request); return { text, toolCalls: [] }; };
  const good = await writeReportWords(report, writer('```json\n{"summary": "A **steady** week: 14 cards for $51.15. Mox Opal alone brought in $40.00, 78% of sales.", "comments": {"2": "Lightning Bolt sold 4 copies across two conditions.", "3": "", "7": "no such section"}}\n```'));
  same([good.summary, good.sections.map((s) => s.comment ?? null), good.cautions], ["A steady week: 14 cards for $51.15. Mox Opal alone brought in $40.00, 78% of sales.", [null, "Lightning Bolt sold 4 copies across two conditions.", null, null, null], []], "summary and comments are attached, markdown stripped, figures check out (4 = 3 + 1)");
  assert(JSON.stringify(good.sections.map((s) => s.answer)) === JSON.stringify(report.sections.map((s) => s.answer)), "the tables are untouched by the writing step");
  const sent = seen[0]!;
  assert(sent.tools.length === 0 && sent.json === true && sent.system === REPORT_WRITER_PROMPT && sent.messages.length === 1, "one call, no tools, JSON asked for");
  const payload = JSON.parse(sent.messages[0]!.role === "user" ? sent.messages[0]!.content : "{}") as { title: string; sections: Array<{ heading: string; rows?: string[][] }> };
  assert(payload.title === report.title && payload.sections.length === 5 && payload.sections[1]!.rows!.length === 5 && !JSON.stringify(payload).includes("/admin/"), "it is sent the title and the five tables, without links");
  const wrong = await writeReportWords(report, writer('{"summary": "A record week: 250 cards for $9,000.00.", "comments": {"1": "Up 317% on the week before."}}'));
  same(wrong.cautions, ["Summary: 250, $9,000.00 are not in the tables. Check before relying on it.", "Sales: 317% is not in the tables. Check before relying on it."], "invented figures in the summary or a comment are listed as cautions");
  for (const junk of ["not json", "", null, "[1,2]", '{"summary": 5}']) {
    const kept = await writeReportWords(report, writer(junk));
    if (kept.summary !== report.summary || kept.cautions.length || kept.sections.some((s) => s.comment)) assert(false, `junk reply ${JSON.stringify(junk)} should leave the plain report`);
  }
  assert(true, "an unusable reply leaves the plain report");
  // An empty week: the writer echoes each empty line back. None of it is kept.
  const emptyWeek = buildReportTables(REPORT_RECIPES.weekly, { period: "last_month" }, { ...data, inventory: [card("Unsold", { shelfLocation: "1-1", quantity: 2 })] }, NOW);
  if (emptyWeek.ok) {
    const echoed = await writeReportWords(emptyWeek.report, writer(JSON.stringify({ summary: "Nothing sold last month.", comments: { "1": "No sales from Thu, Oct 1 to Sat, Oct 31.", "2": "No sales from Thu, Oct 1 to Sat, Oct 31", "3": "A quiet month on the shelves.", "4": "1-1 · White sold nothing in the last 30 days.", "5": "Nothing to move right now." } })));
    same(echoed.sections.map((s) => s.comment ?? null), [null, null, null, null, null], "an empty section gets no comment, and a comment that repeats the section's own line is dropped");
    assert(echoed.summary === "Nothing sold last month.", "the summary is still kept");
  }
  const repeated = await writeReportWords(report, writer(JSON.stringify({ summary: "Fine.", comments: { "1": "mon, nov 9 to sun, nov 15: 14 cards, $51.15", "2": "Mox Opal led." } })));
  same(repeated.sections.map((s) => s.comment ?? null), [null, "Mox Opal led.", null, null, null], "a comment that only repeats a line is dropped even when the table has rows");
  assert(/Do not call days a weekend/.test(REPORT_WRITER_PROMPT) && /Leave out the comment for a section whose table is empty/.test(REPORT_WRITER_PROMPT), "the writer is told not to label days and not to comment on empty tables");
  const failed = await writeReportWords(report, async () => { throw new Error("model down"); });
  assert(failed === report, "a failed call leaves the plain report and does not throw");
}

async function finish() {
  await reportTests();

console.log("\nevery answer");
assert(answers.length >= 15, `checked ${answers.length} answers`);
assert(answers.every((a) => a.title && a.lines.length > 0 && a.href?.startsWith("/admin/") && new Date(a.asOf).toISOString() === a.asOf), "each has a title, a line, a time and an admin link");
assert(answers.every((a) => !/\*\*|__|`/.test(JSON.stringify(a))), "no markdown in any answer");
assert(answers.every((a) => !a.rows || a.rows.every((r) => r.length === a.columns!.length)), "every row has one cell per column");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
}

void finish();
