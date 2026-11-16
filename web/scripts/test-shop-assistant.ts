/**
 * Shop assistant, step 1: the tools that answer from inventory and the trade
 * credit ledger. Plain fixtures only: no Firestore, no OpenAI.
 *
 *   npx tsx scripts/test-shop-assistant.ts
 */
import { sellThrough } from "../src/lib/inventory/analytics";
import { listCardsToMove } from "../src/lib/inventory/cards-to-move";
import { canUseShopTool } from "../src/lib/shop-assistant/access";
import { formatMoney, plural, shelfName } from "../src/lib/shop-assistant/format";
import { getShopTool, listShopTools, runShopTool } from "../src/lib/shop-assistant/registry";
import { cardsToMoveAnswer } from "../src/lib/shop-assistant/tools/cards-to-move";
import {
  FIND_CARD_MAX_ROWS,
  findCardAnswer,
  findCards,
  rankNameMatch,
} from "../src/lib/shop-assistant/tools/find-card";
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
import type { InventoryItem, TradeCreditEntry } from "../src/lib/types";

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

/* ---------------------------------------------------------------- registry */
console.log("\nregistry");
same(listShopTools().map((t) => t.id), ["cards_to_move", "shelf_performance", "find_card", "store_credit"], "the four step-1 tools are registered");
same(listShopTools().filter((t) => t.sensitive).map((t) => t.id), ["store_credit"], "only the customer list is sensitive");
assert(listShopTools().every((t) => t.describe.length > 20 && !/\d{3,}/.test(t.describe)), "every tool has a prompt line with no data in it");
assert(getShopTool("sales_summary") === undefined && getShopTool("drop_tables") === undefined && getShopTool(7) === undefined, "unbuilt and unknown tools are not offered");

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

const data: ShopToolData = { storeId: STORE, inventory: stock, customers, creditEntries: ledger };
const ran = runShopTool("find_card", { name: "bolt" }, data, { now: NOW });
assert(ran.ok && ran.tool === "find_card" && !ran.sensitive && ran.answer.asOf === NOW.toISOString(), "runs a tool and stamps the answer");
if (ran.ok) keep(ran.answer);
const ranCredit = runShopTool("store_credit", {}, data, { now: NOW });
assert(ranCredit.ok && ranCredit.sensitive && ranCredit.answer.rows!.length === 4, "sensitive flag travels with the answer");
same(runShopTool("sales_summary", { period: "today" }, data, { now: NOW }), { ok: false, reason: "unknown_tool", error: "No such tool" }, "refuses a tool that is not built");
const badArgs = runShopTool("shelf_performance", { rank: "sideways" }, data, { now: NOW });
assert(!badArgs.ok && badArgs.reason === "bad_args", "refuses bad arguments");
assert(canUseShopTool({ userId: "u1", role: "store" }, "store_credit"), "every signed-in staff member may use every V1 tool (owner decision, 002)");

/* ------------------------------------------------------------ every answer */
console.log("\nevery answer");
assert(answers.length >= 15, `checked ${answers.length} answers`);
assert(answers.every((a) => a.title && a.lines.length > 0 && a.asOf === NOW.toISOString() && a.href?.startsWith("/admin/")), "each has a title, a line, a time and an admin link");
assert(answers.every((a) => !/\*\*|__|`/.test(JSON.stringify(a))), "no markdown in any answer");
assert(answers.every((a) => !a.rows || a.rows.every((r) => r.length === a.columns!.length)), "every row has one cell per column");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
