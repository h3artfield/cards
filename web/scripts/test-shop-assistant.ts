/**
 * Shop assistant, steps 1 to 3: the six tools, the registry that runs them
 * and the chooser that picks one. Plain fixtures only: no Firestore, no OpenAI.
 *
 *   npx tsx scripts/test-shop-assistant.ts
 */
import { sellThrough } from "../src/lib/inventory/analytics";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import { listCardsToMove } from "../src/lib/inventory/cards-to-move";
import { sellPrice } from "../src/lib/inventory/sell-price";
import { applyMarketPricing } from "../src/lib/processing/apply-market-pricing";
import { applyStoreRules, ruleNeedsResaleAnalysis } from "../src/lib/processing/rules-engine";
import { buildDailySales, storeDay } from "../src/lib/reports/daily-reports";
import { canUseShopTool } from "../src/lib/shop-assistant/access";
import {
  QUESTION_MAX_CHARS,
  buildChooserPrompt,
  chooseShopTool,
  fallbackChooseTool,
  parseModelChoice,
  staffAssistantModel,
} from "../src/lib/shop-assistant/choose";
import { formatMoney, plural, shelfName } from "../src/lib/shop-assistant/format";
import { getShopTool, listShopTools, runShopTool } from "../src/lib/shop-assistant/registry";
import {
  buyEstimateAnswer,
  estimateBuy,
  estimateBuyOffer,
  ruleCategoryForProductLine,
  rulesNotChecked,
} from "../src/lib/shop-assistant/tools/buy-estimate";
import { cardsToMoveAnswer } from "../src/lib/shop-assistant/tools/cards-to-move";
import {
  FIND_CARD_MAX_ROWS,
  findCardAnswer,
  findCards,
  rankNameMatch,
} from "../src/lib/shop-assistant/tools/find-card";
import {
  addDays,
  dayLabel,
  isCalendarDay,
  salesSummaryAnswer,
} from "../src/lib/shop-assistant/tools/sales-summary";
import {
  rankShelves,
  shelfPerformanceAnswer,
} from "../src/lib/shop-assistant/tools/shelf-performance";
import {
  STORE_CREDIT_MAX_ROWS,
  UNNAMED_CUSTOMER,
  listStoreCredit,
  storeCreditAnswer,
} from "../src/lib/shop-assistant/tools/store-credit";
import type { ShopAnswer, ShopToolData } from "../src/lib/shop-assistant/types";
import { EVAL_NOW, EVAL_QUESTIONS, matchesExpected } from "./shop-assistant-eval-questions";
import type {
  ConditionEstimate,
  InventoryItem,
  ScannedCard,
  StoreRule,
  StoreSettings,
  TradeCreditEntry,
  VisionResult,
} from "../src/lib/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function same(got: unknown, want: unknown, msg: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  assert(ok, msg);
  if (!ok) console.error(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
}

const STORE = "s1";
const NOW = new Date("2026-11-16T18:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

let nextId = 0;
function card(name: string, over: Partial<InventoryItem> = {}): InventoryItem {
  nextId += 1;
  return {
    id: `i${nextId}`,
    storeId: STORE,
    source: "tcgplayer_import",
    displayName: name,
    productName: name,
    productLine: "Magic",
    tcgplayerCondition: "Near Mint",
    tcgplayerProductId: String(1000 + nextId),
    tcgplayerListingKey: `${1000 + nextId}|nm`,
    quantity: 1,
    listPrice: 1,
    acquiredAt: daysAgo(20),
    ...over,
  };
}

const answers: ShopAnswer[] = [];
function keep(answer: ShopAnswer): ShopAnswer {
  answers.push(answer);
  return answer;
}

/* ---------------------------------------------------------------- helpers */
console.log("\nformat");
assert(formatMoney(1234.5) === "$1,234.50", "money with cents and thousands");
assert(formatMoney(null) === "—" && formatMoney(Number.NaN) === "—", "missing money is a dash");
assert(plural(1, "card", "cards") === "1 card" && plural(3, "card", "cards") === "3 cards", "plural");
assert(shelfName("1-2") === "1-2 · Blue", "case shelf is named with what it holds");
assert(shelfName("Binder U") === "Binder U · Blue", "binder is named with what it holds");
assert(shelfName("Pokémon Binder") === "Pokémon Binder", "label that repeats the name is left off");
assert(shelfName("Bulk") === "Bulk", "unknown spot keeps its own name");

console.log("\nsellThrough (shared with the Inventory report)");
assert(sellThrough({ units: 40, sold30: 7 }) === 7 / 47, "sold ÷ (sold + in stock)");
assert(sellThrough({ units: 5, sold30: 0 }) === 0, "stocked and nothing sold is zero, not blank");
assert(sellThrough({ units: 0, sold30: 0 }) === null, "empty shelf has no sell-through");
assert(sellThrough({ units: 0, sold30: 4 }) === 1, "sold-out shelf is 100%");

/* ----------------------------------------------------------- cards to move */
console.log("\ncards_to_move");
const moving = [
  card("Zephyr Charge", { shelfLocation: "Binder U", suggestedLocation: "Bulk", suggestedLocationAt: daysAgo(1), tcgMarketPrice: 0.56, quantityInStore: 2, quantity: 5, setName: "Lorwyn Eclipsed", tcgplayerCondition: "Near Mint Foil" }),
  card("Abhorrent Oculus", { shelfLocation: "Binder U", suggestedLocation: "1-2", tcgMarketPrice: 9.02, quantity: 3 }),
  card("Arcane Signet", { shelfLocation: "", suggestedLocation: "Bulk", quantity: 1 }),
  card("Stays Put", { shelfLocation: "1-1", suggestedLocation: "1-1" }),
  card("No Suggestion", { shelfLocation: "1-1" }),
];
const toMove = listCardsToMove(moving);
same(toMove.map((c) => c.name), ["Abhorrent Oculus", "Arcane Signet", "Zephyr Charge"], "keeps only rows whose suggestion differs, sorted by destination then name");
same(
  toMove[2],
  { id: moving[0]!.id, name: "Zephyr Charge", setName: "Lorwyn Eclipsed", condition: "Near Mint Foil", quantity: 2, market: 0.56, from: "Binder U", to: "Bulk", since: daysAgo(1) },
  "row has the panel's fields (in-store quantity first)",
);
assert(toMove[1]!.market === null && toMove[1]!.since === "", "missing market and date stay empty");
const moveAnswer = keep(cardsToMoveAnswer(moving, NOW));
assert(moveAnswer.lines[0] === "3 cards to move.", "says how many");
same(moveAnswer.rows![0], ["Abhorrent Oculus", "Near Mint", "3", "$9.02", "Binder U · Blue → 1-2 · Blue"], "row reads card, condition, qty, market, move");
assert(moveAnswer.rows![1]![4] === "No location → Bulk", "a card with no shelf says so");
assert(moveAnswer.note!.includes("$6 for cabinets") && moveAnswer.note!.includes("60¢ for bulk"), "note states the shelf lines");
const nothing = keep(cardsToMoveAnswer([moving[3]!, moving[4]!], NOW));
assert(nothing.lines[0] === "Nothing to move right now." && !nothing.rows, "empty answer when nothing moves");
const manyMoves = Array.from({ length: 18 }, (_, i) => card(`Mover ${String(i).padStart(2, "0")}`, { shelfLocation: "Binder U", suggestedLocation: "Bulk" }));
const capped = keep(cardsToMoveAnswer(manyMoves, NOW));
assert(capped.rows!.length === 15 && capped.lines[0] === "18 cards to move." && capped.note!.startsWith("Showing the first 15 of 18."), "long lists are capped and say so");

/* ------------------------------------------------------- shelf performance */
console.log("\nshelf_performance");
const sold = (days: number, quantity: number) => ({ at: daysAgo(days), quantity, unitPrice: 2, channel: "in_store" as const });
const shelves: InventoryItem[] = [
  card("White A", { shelfLocation: "1-1", quantity: 4 }),
  card("White B", { shelfLocation: "1-1", quantity: 2 }),
  card("Blue C", { shelfLocation: "1-2", quantity: 3, saleLog: [sold(5, 1)] }),
  card("Black D", { shelfLocation: "2-1", quantity: 5, saleLog: [sold(40, 6)] }),
  card("Red E", { shelfLocation: "2-2", quantity: 1, saleLog: [sold(2, 3)] }),
  card("Red F sold out", { shelfLocation: "2-2", quantity: 0, status: "sold", soldAt: daysAgo(3), soldPrice: 9 }),
  card("Binder G", { shelfLocation: "Binder U", quantity: 10, saleLog: [sold(10, 1)] }),
  card("Binder H", { shelfLocation: "Binder W", quantity: 2 }),
  card("Bulk I", { shelfLocation: "Bulk", quantity: 30, saleLog: [sold(1, 9)] }),
  { ...card("Buyback single", { shelfLocation: "3-1" }), source: "buyback", tcgplayerListingKey: undefined },
];
const slowAny = rankShelves(shelves, { rank: "slowest", kind: "any", limit: 3 }, NOW);
same(slowAny.shown.map((r) => r.location), ["1-1", "2-1", "Binder W"], "slowest: zero-sales shelves first, most unsold stock first");
assert(slowAny.ranked.length === 6, "empty shelves, bulk and non-catalog rows are not ranked");
assert(slowAny.ranked.find((r) => r.location === "2-1")!.sold30 === 0, "a sale older than 30 days does not count");
const slowOne = rankShelves(shelves, { rank: "slowest", kind: "any", limit: 1 }, NOW);
assert(slowOne.shown.length === 3, "a tie at the cut is shown in full, not cut at the limit");
const fast = rankShelves(shelves, { rank: "fastest", kind: "any", limit: 2 }, NOW);
same(fast.shown.map((r) => [r.location, r.sold30, r.units]), [["2-2", 4, 1], ["1-2", 1, 3]], "fastest: counts the sold-out row's sale on its shelf");
assert(fast.shown[0]!.share === 4 / 5, "share is the report's sell-through");
same(rankShelves(shelves, { rank: "fastest", kind: "binder", limit: 5 }, NOW).shown.map((r) => r.location), ["Binder U", "Binder W"], "kind filter keeps binders only");

const slowAnswer = keep(shelfPerformanceAnswer(shelves, { rank: "slowest", kind: "any", limit: 3 }, NOW));
assert(slowAnswer.title === "Slowest shelves", "title names the ranking");
assert(slowAnswer.lines[0] === "3 shelves sold nothing in the last 30 days.", "a tie at zero is reported as a tie");
same(slowAnswer.rows![0], ["1-1 · White", "6", "0", "0%"], "row reads shelf, in stock, sold, sell-through");
assert(slowAnswer.note!.includes("sold ÷ (sold + still in stock)"), "note says how it was ranked");
const slowCases = keep(shelfPerformanceAnswer(shelves, { rank: "slowest", kind: "case", limit: 3 }, NOW));
assert(slowCases.lines[0] === "2 case shelves sold nothing in the last 30 days." && slowCases.rows!.length === 3, "case-only wording and rows");
const fastAnswer = keep(shelfPerformanceAnswer(shelves, { rank: "fastest", kind: "any", limit: 1 }, NOW));
assert(fastAnswer.lines[0] === "2-2 · Red: 80% sold in the last 30 days (4 of 5).", "single winner shows its numbers");
same(fastAnswer.rows, [["2-2 · Red", "1", "4", "80%"]], "one row when there is no tie");
const oneZero = keep(shelfPerformanceAnswer([shelves[0]!, shelves[2]!], { rank: "slowest", kind: "any", limit: 1 }, NOW));
assert(oneZero.lines[0] === "1-1 · White sold nothing in the last 30 days.", "a single zero-sales shelf is named");
const tiedFast = keep(shelfPerformanceAnswer([card("T1", { shelfLocation: "1-1", quantity: 1, saleLog: [sold(1, 1)] }), card("T2", { shelfLocation: "1-2", quantity: 1, saleLog: [sold(1, 1)] })], { rank: "fastest", kind: "any", limit: 1 }, NOW));
assert(tiedFast.lines[0] === "2 shelves tied at 50% sold in the last 30 days." && tiedFast.rows!.length === 2, "a non-zero tie is reported as a tie");
const noShelves = keep(shelfPerformanceAnswer([], { rank: "slowest", kind: "binder", limit: 3 }, NOW));
assert(noShelves.lines[0] === "No stocked binders to rank yet." && !noShelves.rows, "nothing to rank");

/* --------------------------------------------------------------- find card */
console.log("\nfind_card");
assert(rankNameMatch("Lightning Bolt", "lightning bolt") === 4, "exact name");
assert(rankNameMatch("Enlightened Confidant (Borderless) (0321)", "Enlightened Confidant") === 4, "exact once printing notes are dropped");
assert(rankNameMatch("Aang's Iceberg", "aang") === 3 && rankNameMatch("Aang, at the Crossroads", "Aang") === 3, "starts with whole words");
assert(rankNameMatch("Lightning Bolt", "bolt") === 2, "whole word inside the name");
assert(rankNameMatch("Thunderbolt", "bolt") === 1 && rankNameMatch("Boltwave", "bolt") === 1, "part of a word only");
assert(rankNameMatch("Forest", "bolt") === 0 && rankNameMatch("Forest", "   ") === 0, "no match");
assert(rankNameMatch("Lim-Dûl's Vault", "lim-dul’s vault") === 4, "accents and curly apostrophes do not matter");

const stock: InventoryItem[] = [
  card("Lightning Bolt", { setName: "Magic 2011", cardNumber: "149", shelfLocation: "2-2", quantity: 3, quantityInStore: 2, listPrice: 2.5 }),
  card("Lightning Bolt (Borderless)", { setName: "Secret Lair", cardNumber: "#901", tcgplayerCondition: "Near Mint Foil", shelfLocation: "2-2", quantity: 1, quantityOnline: 0, listPrice: 14 }),
  card("Lightning Bolt", { setName: "Magic 2010", tcgplayerCondition: "Lightly Played", quantity: 0 }),
  card("Lightning Bolt", { setName: "Fourth Edition", quantity: 2, status: "withdrawn" }),
  card("Thunderbolt", { shelfLocation: "Binder R", quantity: 2 }),
  card("Boltwave", { quantity: 1 }),
  card("Aang's Iceberg", { quantity: 1 }),
  card("Aang, at the Crossroads", { quantity: 1 }),
];
const exact = findCards(stock, { name: "lightning bolt" });
assert(exact.matches.length === 2 && exact.copies === 4 && !exact.closestOnly, "exact name: two in-stock listings, four copies; sold-out and withdrawn rows left out");
const word = findCards(stock, { name: "bolt" });
same(word.matches.map((m) => m.name), ["Lightning Bolt", "Lightning Bolt (Borderless)"], "whole-word match hides Thunderbolt and Boltwave");
const partial = findCards(stock, { name: "olt" });
assert(partial.closestOnly && partial.matches.length === 4, "only part-of-a-word matches: flagged as closest");
same(findCards(stock, { name: "Aang" }).matches.map((m) => m.name), ["Aang, at the Crossroads", "Aang's Iceberg"], "prefix matches, sorted by name");
same(findCards(stock, { name: "lightning bolt", finish: "foil" }).matches.map((m) => m.name), ["Lightning Bolt (Borderless)"], "finish filter: foil");
same(findCards(stock, { name: "lightning bolt", finish: "nonfoil" }).matches.map((m) => m.item.setName), ["Magic 2011"], "finish filter: non-foil");

const boltAnswer = keep(findCardAnswer(stock, { name: "Lightning Bolt" }, NOW));
assert(boltAnswer.lines.length === 1 && boltAnswer.lines[0] === "4 copies in stock across 2 listings.", "summary counts copies and listings");
same(boltAnswer.rows![0], ["Lightning Bolt", "Magic 2011 · #149", "Near Mint", "3", "1", "2-2 · Red", "$2.50"], "row: card, printing, condition, qty, online, shelf, price");
same(boltAnswer.rows![1], ["Lightning Bolt (Borderless)", "Secret Lair · #901", "Near Mint Foil", "1", "0", "2-2 · Red", "$14.00"], "in-store-only copy shows 0 online");
const closeAnswer = keep(findCardAnswer(stock, { name: "olt" }, NOW));
assert(closeAnswer.lines[0] === 'No card named "olt" in stock. Closest names:', "near misses are labelled, not passed off as the card");
assert(closeAnswer.rows!.find((r) => r[0] === "Boltwave")![5] === "No location", "a row with no shelf says so");
const noneAnswer = keep(findCardAnswer(stock, { name: "Black Lotus", finish: "foil" }, NOW));
assert(noneAnswer.lines[0] === 'No foil copies of "Black Lotus" in stock.' && !noneAnswer.rows, "nothing in stock");
const forests = Array.from({ length: 12 }, (_, i) => card("Forest", { setName: `Set ${String(i).padStart(2, "0")}`, quantity: 2 }));
const forestAnswer = keep(findCardAnswer(forests, { name: "forest" }, NOW));
assert(forestAnswer.rows!.length === FIND_CARD_MAX_ROWS && forestAnswer.lines[0] === "24 copies in stock across 12 listings." && forestAnswer.note!.startsWith("Showing 8, and 4 more."), "long lists are capped; totals still count everything");
const oneCopy = keep(findCardAnswer([stock[6]!], { name: "aang's iceberg", finish: "nonfoil" }, NOW));
assert(oneCopy.lines[0] === "1 non-foil copy in stock across 1 listing.", "singular wording");

/* ------------------------------------------------------------ store credit */
console.log("\nstore_credit");
let nextEntry = 0;
function entry(customerId: string, amount: number, over: Partial<TradeCreditEntry> = {}): TradeCreditEntry {
  nextEntry += 1;
  return { id: `e${nextEntry}`, storeId: STORE, customerId, type: amount >= 0 ? "issued" : "spent", amount, createdAt: daysAgo(nextEntry), ...over };
}
const customers = [
  { id: "c1", firstName: "Sam", lastName: "Carter", email: "sam.carter@example.com", phone: "555-0101" },
  { id: "c2", firstName: " Ana ", lastName: "Diaz", email: "ana@example.com", phone: "555-0102" },
  { id: "c3", firstName: "Zero", lastName: "Balance", email: "zero@example.com", phone: "555-0103" },
  { id: "c4", firstName: "Owes", lastName: "Store", email: "owes@example.com", phone: "555-0104" },
  { id: "c6", firstName: "", lastName: "", email: "noname@example.com", phone: "555-0106" },
];
const ledger = [
  entry("c1", 25),
  entry("c1", -10),
  entry("c1", 100, { storeId: "another-store" }),
  entry("c2", 5.25),
  entry("c3", 10),
  entry("c3", -10),
  entry("c4", 4),
  entry("c4", -9, { type: "reversal" }),
  entry("c5", 3),
  entry("c6", 1),
];
const credit = listStoreCredit(STORE, ledger, customers);
same(
  credit.rows.map((r) => [r.name, r.balance]),
  [["Sam Carter", 15], ["Ana Diaz", 5.25], [UNNAMED_CUSTOMER, 3], [UNNAMED_CUSTOMER, 1]],
  "balances above zero, largest first; another store's entry is ignored; zero and negative left out",
);
assert(credit.total === 24.25, "total of the listed balances");
const creditAnswer = keep(storeCreditAnswer(STORE, ledger, customers, NOW));
assert(creditAnswer.lines[0] === "4 customers have store credit, $24.25 in total.", "summary line");
same(creditAnswer.rows![0], ["Sam Carter", "$15.00"], "row is name and balance");
const creditText = JSON.stringify(creditAnswer);
assert(!creditText.includes("@") && !creditText.includes("555-"), "no email or phone anywhere in the answer");
const noCredit = keep(storeCreditAnswer(STORE, [entry("c3", 10), entry("c3", -10)], customers, NOW));
assert(noCredit.lines[0] === "No customers have store credit right now." && !noCredit.rows, "nobody holds credit");
const oneCredit = keep(storeCreditAnswer(STORE, [entry("c1", 2)], customers, NOW));
assert(oneCredit.lines[0] === "1 customer has store credit, $2.00 in total.", "singular wording");
const crowd = Array.from({ length: 55 }, (_, i) => entry(`m${i}`, i + 1));
const crowdAnswer = keep(storeCreditAnswer(STORE, crowd, [], NOW));
assert(crowdAnswer.rows!.length === STORE_CREDIT_MAX_ROWS && crowdAnswer.rows![0]![1] === "$55.00" && crowdAnswer.note === "Showing the 50 largest of 55.", "long lists are capped at the largest balances");
assert(crowdAnswer.lines[0] === "55 customers have store credit, $1,540.00 in total.", "the total still covers everyone");

/* -------------------------------------------------------------- sell price */
console.log("\nsellPrice (shared with the register)");
assert(sellPrice({ listPrice: 3, shopifyListing: { exportPrice: 4 } as never, tcgMarketPrice: 5, marketPrice: 6 }) === 3, "the store's own price first");
assert(sellPrice({ shopifyListing: { exportPrice: 4 } as never, tcgMarketPrice: 5, marketPrice: 6 }) === 4, "then the Shopify export price");
assert(sellPrice({ tcgMarketPrice: 5, marketPrice: 6 }) === 5, "then TCG market");
assert(sellPrice({ marketPrice: 6 }) === 6 && sellPrice({}) === 0, "then market, else 0");
assert(sellPrice({ listPrice: 0, tcgMarketPrice: 5 }) === 0, "a list price of 0 is still the list price");
const priced = keep(findCardAnswer([card("Export Only", { listPrice: undefined, shopifyListing: { exportPrice: 4 } as never, tcgMarketPrice: 9 }), card("Export Only", { setName: "No Price", listPrice: undefined })], { name: "export only" }, NOW));
same(priced.rows!.map((r) => r[6]), ["$4.00", "—"], "find_card quotes the register's price, and a dash when there is none");

/* ----------------------------------------------------------- sales summary */
console.log("\nsales_summary");
assert(storeDay(NOW) === "2026-11-16", "the fixture's today, shop time");
assert(isCalendarDay("2026-11-12") && !isCalendarDay("2026-02-30") && !isCalendarDay("2026-1-5") && !isCalendarDay("yesterday"), "calendar days");
assert(addDays("2026-11-01", -1) === "2026-10-31" && addDays("2026-03-08", 1) === "2026-03-09" && addDays("2026-11-16", -6) === "2026-11-10", "day arithmetic crosses months and clock changes");
assert(dayLabel("2026-11-16") === "Mon, Nov 16", "day label");
const sale = (at: string, quantity: number, unitPrice: number, channel: "in_store" | "shopify") => ({ at, quantity, unitPrice, channel });
const sales: InventoryItem[] = [
  card("Sol Ring", { setName: "Commander", shelfLocation: "4-1", saleLog: [sale("2026-11-16T05:30:00Z", 1, 2, "shopify"), sale("2026-11-16T15:00:00Z", 2, 1.5, "in_store")] }),
  card("Counterspell", { setName: "Dominaria", tcgplayerCondition: "Lightly Played", saleLog: [sale("2026-11-03T20:00:00Z", 4, 0.1, "in_store"), sale("2026-11-16T16:00:00Z", 1, 3.25, "shopify")] }),
  card("Old Single", { quantity: 0, status: "sold", soldAt: "2026-10-31T20:00:00Z", soldPrice: 9 }),
  card("Mid Month", { saleLog: [sale("2026-11-10T18:00:00Z", 1, 5, "in_store")] }),
  card("Never Sold", { quantity: 4 }),
];
const salesDays = buildDailySales(sales);
same(salesDays.map((d) => [d.date, d.sales.units, d.sales.revenue, d.monthToDate.units, d.monthToDate.revenue]), [
  ["2026-10-31", 1, 9, 1, 9],
  ["2026-11-03", 4, 0.4, 4, 0.4],
  ["2026-11-10", 1, 5, 5, 5.4],
  ["2026-11-15", 1, 2, 6, 7.4],
  ["2026-11-16", 3, 6.25, 9, 13.65],
], "days are cut at midnight shop time; month to date restarts each month");
same([salesDays[4]!.sales.inStore, salesDays[4]!.sales.online], [{ units: 2, revenue: 3 }, { units: 1, revenue: 3.25 }], "in-store and online halves");
same(salesDays[0]!.sales.online, { units: 1, revenue: 9 }, "a sold single with no sale log counts once, as online");
same(salesDays[4]!.sales.lines.map((l) => l.name), ["Counterspell", "Sol Ring"], "sale lines newest first");

const todayAnswer = keep(salesSummaryAnswer(sales, { period: "today" }, NOW));
same(todayAnswer.lines, ["Today (Mon, Nov 16): 3 cards, $6.25.", "In store: 2 cards, $3.00. Online: 1 card, $3.25.", "Month to date: 9 cards, $13.65."], "today");
same([todayAnswer.rows![0]![0], todayAnswer.rows![0]![2], todayAnswer.rows![0]![3], todayAnswer.rows![0]![4]], ["Counterspell", "1", "$3.25", "Online"], "today's sale lines");
assert(todayAnswer.rows![0]![1]!.startsWith("Dominaria · ") && todayAnswer.rows![1]![4] === "In store", "set, condition and where");
assert(todayAnswer.href === "/admin/reports?section=daily&day=2026-11-16", "links to that day of the Daily report");
const yesterdayAnswer = keep(salesSummaryAnswer(sales, { period: "yesterday" }, NOW));
same(yesterdayAnswer.lines, ["Yesterday (Sun, Nov 15): 1 card, $2.00.", "In store: nothing. Online: 1 card, $2.00.", "Month to date: 6 cards, $7.40."], "yesterday, with the month's total through that day");
const quietDay = keep(salesSummaryAnswer(sales, { period: "date", date: "2026-11-12" }, NOW));
same(quietDay.lines, ["Thu, Nov 12: no sales.", "Month to date: 5 cards, $5.40."], "a day with no sales still shows the month so far");
assert(!quietDay.rows && quietDay.href!.endsWith("day=2026-11-12"), "no table for a quiet day");
same(keep(salesSummaryAnswer(sales, { period: "date", date: "2026-11-02" }, NOW)).lines, ["Mon, Nov 2: no sales.", "Month to date: nothing."], "before the month's first sale");
same(keep(salesSummaryAnswer(sales, { period: "date", date: "2026-11-15" }, NOW)).lines[0], "Yesterday (Sun, Nov 15): 1 card, $2.00.", "a date that is yesterday is called yesterday");
same(keep(salesSummaryAnswer([], { period: "today" }, NOW)).lines, ["Today (Mon, Nov 16): no sales yet.", "Month to date: nothing."], "nothing sold yet today");
same(keep(salesSummaryAnswer(sales, { period: "date", date: "2026-11-20" }, NOW)).lines, ["Fri, Nov 20 hasn't happened yet."], "a future day");
same(keep(salesSummaryAnswer(sales, { period: "date", date: "2026-08-18" }, NOW)).lines, ["Tue, Aug 18 is too far back. Daily reports keep the last 90 days."], "older than the report keeps");
assert(keep(salesSummaryAnswer(sales, { period: "date", date: "2026-08-19" }, NOW)).lines[0] === "Wed, Aug 19: no sales.", "the oldest day the report keeps");
const weekAnswer = keep(salesSummaryAnswer(sales, { period: "last_7_days" }, NOW));
same(weekAnswer.lines, ["Tue, Nov 10 to Mon, Nov 16: 5 cards, $13.25.", "In store: 3 cards, $8.00. Online: 2 cards, $5.25."], "last 7 days is today and the six days before");
same(weekAnswer.rows, [["Mon, Nov 16", "3", "$6.25"], ["Sun, Nov 15", "1", "$2.00"], ["Tue, Nov 10", "1", "$5.00"]], "one row per day with sales, newest first");
const monthAnswer = keep(salesSummaryAnswer(sales, { period: "month_to_date" }, NOW));
same(monthAnswer.lines, ["Sun, Nov 1 to Mon, Nov 16: 9 cards, $13.65.", "In store: 7 cards, $8.40. Online: 2 cards, $5.25."], "month to date leaves October out");
assert(monthAnswer.rows!.length === 4 && monthAnswer.lines[0]!.includes(`$${salesDays[4]!.monthToDate.revenue}`), "and agrees with the report's own running total");
same(keep(salesSummaryAnswer(sales, { period: "last_7_days" }, new Date("2026-12-25T18:00:00Z"))).lines, ["No sales from Sat, Dec 19 to Fri, Dec 25."], "a week with no sales");
const busy = [card("Busy", { saleLog: Array.from({ length: 12 }, (_, i) => sale(`2026-11-16T${String(6 + i).padStart(2, "0")}:00:00Z`, 1, 1, "in_store")) })];
const busyAnswer = keep(salesSummaryAnswer(busy, { period: "today" }, NOW));
assert(busyAnswer.rows!.length === 10 && busyAnswer.lines[0] === "Today (Mon, Nov 16): 12 cards, $12.00." && busyAnswer.note!.startsWith("Showing the latest 10 of 12 sale lines."), "long days are capped; totals still count everything");

/* ------------------------------------------------------------ buy estimate */
console.log("\nbuy_estimate");
const SETTINGS: StoreSettings = { ...DEFAULT_STORE_SETTINGS, id: STORE };
const MULT = SETTINGS.conditionMultipliers;
same([ruleCategoryForProductLine("Magic"), ruleCategoryForProductLine("Magic: The Gathering"), ruleCategoryForProductLine("Pokemon International"), ruleCategoryForProductLine("Pokémon Japan"), ruleCategoryForProductLine("YuGiOh"), ruleCategoryForProductLine("Yu-Gi-Oh"), ruleCategoryForProductLine("Riftbound"), ruleCategoryForProductLine(undefined)], ["magic", "magic", "pokemon", "pokemon", "yugioh", "yugioh", "other", "other"], "product lines map to rule categories");

let nextRule = 0;
function rule(title: string, over: Partial<StoreRule>): StoreRule {
  nextRule += 1;
  return { id: `r${nextRule}`, storeId: STORE, title, active: true, priority: 10, appliesToCategories: [], ruleType: "note_only", ruleText: "", createdAt: daysAgo(30), updatedAt: daysAgo(30), ...over };
}
const priceOn = (price: number, condition: string, over: Partial<InventoryItem> = {}) => ({ tcgMarketPrice: price, tcgplayerCondition: condition, marketPriceAt: "2026-11-15T09:00:00Z", marketPriceSource: "justtcg" as const, ...over });
const book: InventoryItem[] = [
  card("Enlightened Confidant (Borderless)", { tcgplayerProductId: "p1", setName: "Reality Fracture", cardNumber: "321", rarity: "Mythic", ...priceOn(10, "Near Mint") }),
  card("Enlightened Confidant (Borderless)", { tcgplayerProductId: "p1", setName: "Reality Fracture", cardNumber: "321", rarity: "Mythic", quantity: 0, ...priceOn(8.2, "Lightly Played") }),
  card("Enlightened Confidant (Borderless)", { tcgplayerProductId: "p1", setName: "Reality Fracture", cardNumber: "321", rarity: "Mythic", ...priceOn(20, "Near Mint Foil") }),
  card("Enlightened Confidant", { tcgplayerProductId: "p2", setName: "Reality Fracture", cardNumber: "12", ...priceOn(4, "Lightly Played"), tcgLowPrice: 99 }),
  card("Penny Common", { tcgplayerProductId: "p3", ...priceOn(0.3, "Near Mint") }),
  card("Pikachu", { tcgplayerProductId: "p4", productLine: "Pokemon International", catalogRarity: "Rare", ...priceOn(12, "Near Mint") }),
  card("Unpriced Card", { tcgplayerProductId: "p5" }),
  { ...card("Buyback Bolt", { tcgplayerProductId: "p6", ...priceOn(7, "Near Mint") }), source: "buyback", tcgplayerListingKey: undefined },
];
const lp = estimateBuy(book, { name: "enlightened confidant", condition: "LP" }, SETTINGS, []);
same(lp.rows.map((r) => [r.printing, r.basis, r.offer?.marketValue, r.offer?.cashOffer, r.offer?.tradeOffer]), [
  ["Reality Fracture · #321 · Foil", `NM price × ${MULT.LP}, Nov 15`, 20 * MULT.LP, 20 * MULT.LP * 0.5, 20 * MULT.LP * 0.65],
  ["Reality Fracture · #321", "LP price, Nov 15", 8.2, 8.2 * 0.5, 8.2 * 0.65],
  ["Reality Fracture · #12", "LP price, Nov 15", 4, 2, 4 * 0.65],
], "LP: the LP row's own price as it stands (never multiplied); the NM price times the multiplier when there is no LP row");
assert(lp.rows[1]!.offer!.marketValue !== 10 * MULT.LP, "an LP row is not discounted a second time");
const nm = estimateBuy(book, { name: "enlightened confidant", condition: "NM" }, SETTINGS, []);
same(nm.rows.map((r) => [r.printing, r.offer?.marketValue ?? null]), [["Reality Fracture · #321 · Foil", 20], ["Reality Fracture · #321", 10], ["Reality Fracture · #12", null]], "NM: a Near Mint price is never backed out of an LP row; tcgLowPrice is never used");
same(estimateBuy(book, { name: "enlightened confidant", condition: "LP", finish: "foil" }, SETTINGS, []).rows.map((r) => r.printing), ["Reality Fracture · #321 · Foil"], "finish filter");
assert(estimateBuy(book, { name: "confidant", condition: "NM" }, SETTINGS, []).rows.length === 3 && estimateBuy(book, { name: "fidant", condition: "NM" }, SETTINGS, []).rows.length === 0, "whole-word matches count; part-of-a-word ones do not");
assert(estimateBuy(book, { name: "buyback bolt", condition: "NM" }, SETTINGS, []).rows.length === 0, "only catalog rows are used");
same(estimateBuy(book, { name: "penny common", condition: "NM" }, SETTINGS, []).rows[0]!.offer!.cashOffer, SETTINGS.minimumOffer, "the minimum offer applies");

const rulesFixture: StoreRule[] = [
  rule("No cards under $1", { ruleType: "do_not_buy", ruleText: "Do not buy.", structuredFilters: { maxMarketPrice: 1 } }),
  rule("Pokemon over $5 pays more", { ruleType: "adjust_percentage", appliesToCategories: ["pokemon"], structuredFilters: { minMarketPrice: 5 }, cashPercentOverride: 0.6, tradePercentOverride: 0.75 }),
  rule("2014 sets", { ruleType: "adjust_percentage", structuredFilters: { years: ["2014"] }, cashPercentOverride: 0.1 }),
  rule("Slow movers", { ruleType: "do_not_buy", ruleText: "Do not buy slow sellers." }),
  rule("Retired year rule", { active: false, ruleType: "do_not_buy", structuredFilters: { year: "1999" } }),
  rule("Yugioh 2020", { ruleType: "do_not_buy", appliesToCategories: ["yugioh"], structuredFilters: { year: "2020" } }),
];
const penny = estimateBuy(book, { name: "penny common", condition: "NM" }, SETTINGS, rulesFixture).rows[0]!;
assert(penny.offer!.doNotBuy && penny.offer!.cashOffer === 0 && penny.offer!.tradeOffer === 0 && penny.offer!.matchedRules.includes("No cards under $1"), "a do-not-buy rule zeroes both offers");
const pika = estimateBuy(book, { name: "pikachu", condition: "MP" }, SETTINGS, rulesFixture).rows[0]!;
same([pika.offer!.cashPercent, pika.offer!.tradePercent, pika.offer!.cashOffer, pika.offer!.matchedRules], [0.6, 0.75, 12 * MULT.MP * 0.6, ["Pokemon over $5 pays more"]], "a category rule matches through the product-line map and sets the percents");
same(pika.notChecked, ["2014 sets", "Slow movers"], "year rules and slow-mover rules are reported, not silently passed; inactive and other-category rules are not");
const sampleVision: VisionResult = { category: "magic", itemType: "raw", cardName: "X", conditionEstimate: "NM", confidence: 1 };
same(rulesNotChecked([rulesFixture[0]!, rulesFixture[1]!], sampleVision), [], "rules the estimate can check are not flagged");
same(rulesNotChecked([rule("Any card from 2020", { ruleType: "do_not_buy", appliesToCategories: ["yugioh"], ruleText: "Do not buy any card from 2020.", structuredFilters: { year: "2020" } })], sampleVision), ["Any card from 2020"], "a do-not-buy rule worded for any card is flagged whatever its categories");
// The engine's own predicate must agree with what the engine does: a rule
// "needs resale analysis" exactly when it matches with a slow-seller analysis
// and not without one.
const slowAnalysis = { sentiment: "neutral", salesFrequency: "low", recommendation: "pass", summary: "", risks: [], opportunities: [], confidence: 0, analyzedAt: "" } as const;
const predicateRules = [
  ...rulesFixture.filter((r) => r.active),
  rule("Slow sellers under $2", { ruleType: "do_not_buy", ruleText: "Do not buy slow cards under $2." }),
  rule("Slow note", { ruleType: "note_only", ruleText: "Slow sets, be careful." }),
  rule("No reason given", { ruleType: "do_not_buy", ruleText: "Do not buy." }),
];
same(
  predicateRules.map((r) => [r.title, ruleNeedsResaleAnalysis(r)]),
  predicateRules.map((r) => [r.title, r.ruleType === "do_not_buy" && applyStoreRules([r], sampleVision, 10).matchedRules.length === 0 && applyStoreRules([r], sampleVision, 10, { resaleAnalysis: slowAnalysis }).matchedRules.length > 0]),
  "ruleNeedsResaleAnalysis agrees with how the engine matches each rule",
);
assert(ruleNeedsResaleAnalysis(rulesFixture[3]!) && !ruleNeedsResaleAnalysis(rulesFixture[0]!) && !ruleNeedsResaleAnalysis(predicateRules[predicateRules.length - 3]!), "slow-mover rule yes; price rule and price-worded slow rule no");
const rounded = estimateBuy(book, { name: "pikachu", condition: "NM" }, SETTINGS, [rule("Round up", { ruleType: "round_up_offers" })]).rows[0]!;
same([rounded.offer!.cashOffer, rounded.offer!.tradeOffer], [6, 8], "round-up rule rounds offers up to whole dollars");

console.log("\nbuy_estimate: same math as applyMarketPricing for the same price");
const CONDITIONS: ConditionEstimate[] = ["NM", "LP", "MP", "HP", "DMG"];
let parityChecks = 0;
let parityMisses = 0;
for (const price of [0.3, 0.99, 4, 12, 87.5]) {
  for (const condition of CONDITIONS) {
    for (const ruleSet of [[], rulesFixture, [rule("Round up", { ruleType: "round_up_offers" })]]) {
      for (const category of ["magic", "pokemon"] as const) {
        const vision: VisionResult = { category, itemType: "raw", cardName: "Parity", conditionEstimate: condition, confidence: 1 };
        const scanned = { id: "c", conditionEstimate: condition, visionJson: vision, pricingJson: { marketPrice: price } } as unknown as ScannedCard;
        // No asked-condition row: Near Mint price times the store multiplier.
        const viaScan = applyMarketPricing(scanned, SETTINGS, ruleSet);
        const viaTool = estimateBuyOffer({ basisPrice: price, skipConditionMultiplier: false, rulesPrice: price, condition, vision, settings: SETTINGS, rules: ruleSet });
        // A row in the asked condition: that price as it stands, like the scan's per-condition price.
        const rowPrice = Math.round(price * 0.8 * 100) / 100;
        const withLow = { ...scanned, cardFlowV2Market: { snapshots: [{ suspectId: "s", tcgplayerMapping: { conditionLowPrices: { [condition]: rowPrice } } }] } } as unknown as ScannedCard;
        const viaScanRow = applyMarketPricing(withLow, SETTINGS, ruleSet);
        const viaToolRow = estimateBuyOffer({ basisPrice: rowPrice, skipConditionMultiplier: true, rulesPrice: price, condition, vision, settings: SETTINGS, rules: ruleSet });
        parityChecks += 2;
        if (viaScan.cashOffer !== viaTool.cashOffer || viaScan.tradeOffer !== viaTool.tradeOffer || viaScan.marketPrice !== viaTool.marketValue) parityMisses += 1;
        if (viaScanRow.cashOffer !== viaToolRow.cashOffer || viaScanRow.tradeOffer !== viaToolRow.tradeOffer || viaScanRow.marketPrice !== viaToolRow.marketValue) parityMisses += 1;
      }
    }
  }
}
assert(parityChecks === 300 && parityMisses === 0, `${parityChecks} price, condition, rule and category combinations give the scan formula's cash, trade and market value (${parityMisses} differ)`);

const oneAnswer = keep(buyEstimateAnswer(book, { name: "pikachu", condition: "MP" }, SETTINGS, rulesFixture, NOW));
same(oneAnswer.lines, [
  `Moderately Played: about ${formatMoney(12 * MULT.MP * 0.6)} cash or ${formatMoney(12 * MULT.MP * 0.75)} in trade.`,
  "Based on our nightly market price ($12.00, Nov 15, Near Mint, scaled to Moderately Played), not the scan's live TCGplayer low.",
  "Not checked: 2014 sets",
  "Not checked: Slow movers",
], "one printing: the offer, where the price came from, and what was not checked");
assert(oneAnswer.note!.includes("Cash 60%, trade 75% of market.") && oneAnswer.note!.includes("Rules applied: Pokemon over $5 pays more.") && oneAnswer.note!.endsWith("Estimate. The scan sets the real offer."), "the note gives the percents, the rules applied and the caveat");
const manyAnswer = keep(buyEstimateAnswer(book, { name: "Enlightened Confidant", condition: "LP" }, SETTINGS, [], NOW));
same(manyAnswer.lines, ["3 printings with a price on file. Offers for Lightly Played:", "Based on our nightly market price, not the scan's live TCGplayer low."], "several printings");
same(manyAnswer.rows![1], ["Enlightened Confidant (Borderless)", "Reality Fracture · #321", "$8.20", "$4.10", "$5.33", "LP price, Nov 15"], "row: card, printing, market, cash, trade, basis");
const exactRow = keep(buyEstimateAnswer(book, { name: "Enlightened Confidant", condition: "NM", finish: "nonfoil" }, SETTINGS, [], NOW));
same(exactRow.lines.slice(0, 2), ["Near Mint: about $5.00 cash or $6.50 in trade.", "Based on our nightly market price ($10.00, Nov 15), not the scan's live TCGplayer low."], "one priced printing among two");
same(exactRow.rows![1], ["Enlightened Confidant", "Reality Fracture · #12", "—", "Scan it", "Scan it", "No price on file for that condition"], "a printing with no Near Mint price says to scan it");
const blocked = keep(buyEstimateAnswer(book, { name: "penny common", condition: "NM" }, SETTINGS, rulesFixture, NOW));
assert(blocked.lines[0] === "Near Mint: a store rule says not to buy this one (No cards under $1)." && blocked.rows![0]![3] === "Don't buy", "a do-not-buy rule is named");
same(keep(buyEstimateAnswer(book, { name: "unpriced card", condition: "HP" }, SETTINGS, [], NOW)).lines, ['No price on file for "unpriced card" in Heavily Played or Near Mint. Scan it.'], "a known card with no price");
same(keep(buyEstimateAnswer(book, { name: "Black Lotus", condition: "NM" }, SETTINGS, [], NOW)).lines, ['No price on file for "Black Lotus". Scan it.'], "a card the store has never stocked");
const csvAnswer = keep(buyEstimateAnswer([card("Csv Card", { tcgplayerProductId: "p9", tcgMarketPrice: 3, marketPriceSource: "tcgplayer_csv" })], { name: "csv card", condition: "NM" }, SETTINGS, [], NOW));
assert(csvAnswer.lines[1] === "Based on the market price from our TCGplayer import ($3.00, date unknown), not the scan's live TCGplayer low.", "the source and a missing date are stated");
const eightPrintings = Array.from({ length: 8 }, (_, i) => card("Many Prints", { tcgplayerProductId: `m${i}`, setName: `Set ${i}`, ...priceOn(i + 1, "Near Mint") }));
const cappedBuy = keep(buyEstimateAnswer(eightPrintings, { name: "many prints", condition: "NM" }, SETTINGS, [], NOW));
assert(cappedBuy.rows!.length === 5 && cappedBuy.rows![0]![2] === "$8.00" && cappedBuy.note!.startsWith("Showing 5 of 8 printings."), "long lists are capped, most valuable first");

/* ---------------------------------------------------------------- registry */
console.log("\nregistry");
same(listShopTools().map((t) => t.id), ["sales_summary", "cards_to_move", "shelf_performance", "find_card", "buy_estimate", "store_credit"], "all six tools are registered");
same(listShopTools().filter((t) => t.sensitive).map((t) => t.id), ["store_credit"], "only the customer list is sensitive");
assert(listShopTools().every((t) => t.describe.length > 20 && !/\d{3,}/.test(t.describe)), "every tool has a prompt line with no data in it");
assert(getShopTool("drop_tables") === undefined && getShopTool(7) === undefined && getShopTool("__proto__") === undefined, "unknown tools are not offered");

const shelfTool = getShopTool("shelf_performance")!;
same(shelfTool.validateArgs({ rank: "slowest" }), { ok: true, args: { rank: "slowest", kind: "any", limit: 3 } }, "shelf args: defaults");
same(shelfTool.validateArgs({ rank: "fastest", kind: "binder", limit: 99, storeId: "other" }), { ok: true, args: { rank: "fastest", kind: "binder", limit: 5 } }, "shelf args: limit clamped, unknown keys dropped");
same(shelfTool.validateArgs({ rank: "fastest", kind: "bulk", limit: 0.2 }), { ok: true, args: { rank: "fastest", kind: "any", limit: 1 } }, "shelf args: bad kind falls back, limit floors at 1");
assert(!shelfTool.validateArgs({ rank: "best" }).ok && !shelfTool.validateArgs(null).ok && !shelfTool.validateArgs("slowest").ok, "shelf args: rank is required");
const findTool = getShopTool("find_card")!;
same(findTool.validateArgs({ name: "  Lightning   Bolt ", finish: "foil" }), { ok: true, args: { name: "Lightning Bolt", finish: "foil" } }, "find args: name tidied");
same(findTool.validateArgs({ name: "Sol Ring", finish: "shiny" }), { ok: true, args: { name: "Sol Ring" } }, "find args: unknown finish dropped");
assert(!findTool.validateArgs({ name: "x" }).ok && !findTool.validateArgs({ name: "y".repeat(81) }).ok && !findTool.validateArgs({ name: 12 }).ok && !findTool.validateArgs({}).ok, "find args: name must be 2 to 80 characters of text");
same(getShopTool("store_credit")!.validateArgs({ customerId: "c1" }), { ok: true, args: {} }, "credit args: takes none, ignores what it is sent");

const salesTool = getShopTool("sales_summary")!;
same(salesTool.validateArgs({ period: "today", date: "2026-11-01" }), { ok: true, args: { period: "today" } }, "sales args: a date is dropped unless the period is date");
same(salesTool.validateArgs({ period: "date", date: "2026-11-12" }), { ok: true, args: { period: "date", date: "2026-11-12" } }, "sales args: a day");
assert(!salesTool.validateArgs({ period: "date" }).ok && !salesTool.validateArgs({ period: "date", date: "2026-02-30" }).ok && !salesTool.validateArgs({ period: "date", date: "last friday" }).ok && !salesTool.validateArgs({ period: "all_time" }).ok && !salesTool.validateArgs({}).ok, "sales args: unknown periods and impossible days are refused");
const buyTool = getShopTool("buy_estimate")!;
same(buyTool.validateArgs({ name: " Sol  Ring " }), { ok: true, args: { name: "Sol Ring", condition: "NM" } }, "buy args: condition defaults to Near Mint");
same(buyTool.validateArgs({ name: "Sol Ring", condition: "Lightly Played", finish: "foil", storeId: "other" }), { ok: true, args: { name: "Sol Ring", condition: "LP", finish: "foil" } }, "buy args: condition words are read, unknown keys dropped");
same(buyTool.validateArgs({ name: "Sol Ring", condition: "dmg" }), { ok: true, args: { name: "Sol Ring", condition: "DMG" } }, "buy args: lower case condition");
same(buyTool.validateArgs({ name: "Sol Ring", condition: "pristine" }), { ok: true, args: { name: "Sol Ring", condition: "NM" } }, "buy args: an unknown condition falls back to Near Mint");
assert(!buyTool.validateArgs({ condition: "LP" }).ok, "buy args: name is required");

const data: ShopToolData = { storeId: STORE, inventory: stock, customers, creditEntries: ledger, settings: SETTINGS, rules: [] };
const ran = runShopTool("find_card", { name: "bolt" }, data, { now: NOW });
assert(ran.ok && ran.tool === "find_card" && !ran.sensitive && ran.answer.asOf === NOW.toISOString(), "runs a tool and stamps the answer");
if (ran.ok) keep(ran.answer);
const ranCredit = runShopTool("store_credit", {}, data, { now: NOW });
assert(ranCredit.ok && ranCredit.sensitive && ranCredit.answer.rows!.length === 4, "sensitive flag travels with the answer");
same(runShopTool("drop_tables", {}, data, { now: NOW }), { ok: false, reason: "unknown_tool", error: "No such tool" }, "refuses a tool that does not exist");
const ranSales = runShopTool("sales_summary", { period: "today" }, data, { now: NOW });
assert(ranSales.ok && ranSales.tool === "sales_summary" && !ranSales.sensitive, "runs sales_summary");
const ranBuy = runShopTool("buy_estimate", { name: "lightning bolt", condition: "lp" }, data, { now: NOW });
assert(ranBuy.ok && ranBuy.answer.title === "Buy estimate: lightning bolt (LP)", "runs buy_estimate");
const noSettings = runShopTool("buy_estimate", { name: "lightning bolt" }, { ...data, settings: null }, { now: NOW });
assert(noSettings.ok && noSettings.answer.lines[0]!.startsWith("This store has no buy settings yet") && !noSettings.answer.rows, "buy_estimate without settings says so");
if (noSettings.ok) keep(noSettings.answer);
const badArgs = runShopTool("shelf_performance", { rank: "sideways" }, data, { now: NOW });
assert(!badArgs.ok && badArgs.reason === "bad_args", "refuses bad arguments");
assert(canUseShopTool({ userId: "u1", role: "store" }, "store_credit"), "every signed-in staff member may use every V1 tool (owner decision, 002)");

/* ----------------------------------------------------------------- chooser */
async function chooserTests() {
  console.log("\nchooser: prompt");
  const prompt = buildChooserPrompt(NOW);
  assert(prompt.includes("Today is Monday, 2026-11-16."), "the prompt carries today's date in shop time");
  assert(listShopTools().every((t) => prompt.includes(`- ${t.id}: ${t.describe}`)), "and one line per tool");
  assert(buildChooserPrompt.length === 1, "the prompt is built from the date alone: no store data can reach it");
  assert(!/\$\d|@|Sam Carter|Lightning Bolt/.test(prompt), "no prices, emails, customer or card names in the prompt");
  assert(buildChooserPrompt(new Date("2026-11-17T04:30:00Z")).includes("Today is Monday, 2026-11-16."), "late evening in the shop is still today, not UTC's tomorrow");
  const savedModel = process.env.STAFF_ASSISTANT_MODEL;
  delete process.env.STAFF_ASSISTANT_MODEL;
  assert(staffAssistantModel() === "gpt-5.4-mini", "default model");
  process.env.STAFF_ASSISTANT_MODEL = "  some-other-model ";
  assert(staffAssistantModel() === "some-other-model", "STAFF_ASSISTANT_MODEL overrides it");
  if (savedModel === undefined) delete process.env.STAFF_ASSISTANT_MODEL;
  else process.env.STAFF_ASSISTANT_MODEL = savedModel;

  console.log("\nchooser: reading the model's reply");
  same(parseModelChoice({ tool: "find_card", args: { name: " Sol  Ring ", storeId: "other", finish: "foil" } }), { tool: "find_card", args: { name: "Sol Ring", finish: "foil" } }, "a valid pick is validated and tidied; extra keys such as storeId are dropped");
  same(parseModelChoice({ tool: "cards_to_move" }), { tool: "cards_to_move", args: {} }, "args may be left out for a tool that takes none");
  assert(parseModelChoice({ tool: "none" }) === "none" && parseModelChoice({ tool: null }) === "none", "none");
  assert(parseModelChoice({ tool: "drop_tables", args: {} }) === "invalid" && parseModelChoice({ tool: "find_card", args: {} }) === "invalid" && parseModelChoice("find_card") === "invalid" && parseModelChoice(null) === "invalid" && parseModelChoice([]) === "invalid" && parseModelChoice({ answer: "We sold $500." }) === "invalid", "unknown tools, bad arguments, prose and junk are unusable");

  console.log("\nchooser: model first, keyword matcher when it fails");
  const seen: Array<{ system: string; question: string }> = [];
  const model = (reply: unknown) => async (system: string, question: string) => {
    seen.push({ system, question });
    return reply;
  };
  same(await chooseShopTool("  do we have   sol ring ", NOW, { callModel: model({ tool: "find_card", args: { name: "sol ring" } }) }), { tool: "find_card", args: { name: "sol ring" }, via: "model" }, "the model's valid pick is used");
  same(seen[0], { system: prompt, question: "do we have sol ring" }, "the model is sent the prompt and the tidied question, nothing else");
  same(await chooseShopTool("who has store credit", NOW, { callModel: model({ tool: "none" }) }), { tool: null, via: "model" }, "the model's none is respected, not overridden by keywords");
  same(await chooseShopTool("who has store credit", NOW, { callModel: model({ tool: "make_coffee" }) }), { tool: "store_credit", args: {}, via: "fallback" }, "an unusable reply falls back to the keyword matcher");
  same(await chooseShopTool("which case is slowest", NOW, { callModel: model({ tool: "shelf_performance", args: { rank: "sideways" } }) }), { tool: "shelf_performance", args: { rank: "slowest", kind: "case", limit: 3 }, via: "fallback" }, "bad arguments fall back");
  same(await chooseShopTool("what needs to move", NOW, { callModel: async () => { throw new Error("no key"); } }), { tool: "cards_to_move", args: {}, via: "fallback" }, "a failed call falls back and does not throw");
  same(await chooseShopTool("what needs to move", NOW, { callModel: () => new Promise(() => {}), timeoutMs: 20 }), { tool: "cards_to_move", args: {}, via: "fallback" }, "a slow model falls back after the timeout");
  same(await chooseShopTool("jordan avery", NOW, { callModel: async () => { throw new Error("down"); } }), { tool: null, via: "fallback" }, "nothing matched");
  same(await chooseShopTool("what needs to move", NOW, { callModel: async () => { throw new Error("down"); }, modelOnly: true }), { tool: null, via: "model" }, "modelOnly skips the keyword matcher (for the eval)");
  same(await chooseShopTool("   ", NOW, { callModel: model({ tool: "cards_to_move" }) }), { tool: null, via: "fallback" }, "an empty question never reaches the model");
  seen.length = 0;
  await chooseShopTool("x".repeat(900), NOW, { callModel: model({ tool: "none" }) });
  assert(seen[0]!.question.length === QUESTION_MAX_CHARS, "a long question is cut before it is sent");

  console.log("\nchooser: keyword matcher on the eval questions");
  let same_ = 0;
  let declined = 0;
  const wrong: string[] = [];
  for (const q of EVAL_QUESTIONS) {
    const got = fallbackChooseTool(q.question, EVAL_NOW) ?? { tool: null };
    if (q.fallback === "same" && matchesExpected(q, got)) same_ += 1;
    else if (q.fallback === "none" && got.tool === null) declined += 1;
    else wrong.push(q.question);
  }
  assert(wrong.length === 0, `${same_} answered as the model should, ${declined} declined, ${wrong.length} wrong${wrong.length ? `: ${wrong.join(" | ")}` : ""}`);
  assert(EVAL_QUESTIONS.length >= 30 && EVAL_QUESTIONS.filter((q) => q.tool === "none").length >= 8, `${EVAL_QUESTIONS.length} eval questions, including ones no tool should answer`);
  assert(fallbackChooseTool("what did we sell last friday", NOW) === null && fallbackChooseTool("sales two weeks ago", NOW) === null, "a day it cannot work out is declined, not answered as today");
  assert(fallbackChooseTool("give Jordan Avery $20 store credit", NOW) === null && fallbackChooseTool("how do I add store credit", NOW) === null, "requests to change something and how-to questions are declined");
  same(fallbackChooseTool("sales on Dec 28", new Date("2027-01-04T18:00:00Z")), { tool: "sales_summary", args: { period: "date", date: "2026-12-28" } }, "a month and day means the most recent one, across a new year");
}

async function finish() {
  await chooserTests();

/* ------------------------------------------------------------ every answer */
console.log("\nevery answer");
assert(answers.length >= 40, `checked ${answers.length} answers`);
assert(answers.every((a) => a.title && a.lines.length > 0 && new Date(a.asOf).toISOString() === a.asOf && a.href?.startsWith("/admin/")), "each has a title, a line, a time and an admin link");
assert(answers.every((a) => !/\*\*|__|`/.test(JSON.stringify(a))), "no markdown in any answer");
assert(answers.every((a) => !a.rows || a.rows.every((r) => r.length === a.columns!.length)), "every row has one cell per column");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
}

void finish();
