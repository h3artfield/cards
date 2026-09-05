/**
 * Tests for the deck editor's card search.
 *
 * The properties that matter are the ones a player would notice immediately:
 * typing a card's exact name puts it first, digital-only printings are never
 * offered for a paper deck, and a card that cannot legally go in the deck comes
 * back flagged rather than hidden.
 */
import assert from "node:assert/strict";
import { searchDeckEditorCardsV1 } from "./card-search-v1";
import type { DeckBoardV1 } from "./types-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";

type CardSpec = {
  name: string;
  typeLine?: string;
  colorIdentity?: string[];
  manaCost?: string;
  manaValue?: number;
  types?: string[];
  supertypes?: string[];
  commander?: "legal" | "banned" | "not_legal";
  paperEligible?: boolean;
  layout?: string;
};

function goldenCard(spec: CardSpec): GoldenCatalogOracleCard {
  const typeLine = spec.typeLine ?? "Creature — Elf Warrior";
  return {
    id: `p-${spec.name}`,
    oracleId: `o-${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    canonicalName: spec.name,
    normalizedName: spec.name.toLowerCase(),
    layout: spec.layout ?? "normal",
    manaCost: spec.manaCost ?? "{1}{G}",
    manaValue: spec.manaValue ?? 2,
    cmc: spec.manaValue ?? 2,
    colors: spec.colorIdentity ?? ["G"],
    colorIdentity: spec.colorIdentity ?? ["G"],
    typeLine,
    supertypes: spec.supertypes ?? [],
    types: spec.types ?? (typeLine.includes("Land") ? ["Land"] : ["Creature"]),
    subtypes: [],
    keywords: [],
    legalities: { commander: spec.commander ?? "legal" } as GoldenCatalogOracleCard["legalities"],
    commanderClassification: {} as GoldenCatalogOracleCard["commanderClassification"],
    commanderEligibility: {} as GoldenCatalogOracleCard["commanderEligibility"],
    commanderEligibilityVersion: "test",
    oracleTags: [],
    printingIds: [],
    sourceVersion: "test",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

function catalogOf(specs: CardSpec[]): DeckResolutionCatalog {
  const byOracleId = new Map<string, GoldenCatalogOracleCard>();
  const paperByOracleId = new Map<string, { paperEligible: boolean }>();

  for (const spec of specs) {
    const card = goldenCard(spec);
    byOracleId.set(card.oracleId, card);
    paperByOracleId.set(card.oracleId, { paperEligible: spec.paperEligible ?? true });
  }

  return { byOracleId, paperByOracleId } as unknown as DeckResolutionCatalog;
}

const MONO_GREEN = ["G"];

function testExactNameRanksFirst() {
  const catalog = catalogOf([
    { name: "Counterspell Consultation" },
    { name: "Counterspell" },
    { name: "Arcane Counterspell" },
  ]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "counterspell",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.equal(hits[0]?.name, "Counterspell", "an exact name match must come first");
}

function testPrefixBeatsMidWordMatch() {
  const catalog = catalogOf([{ name: "Consolidate Forces" }, { name: "Sol Ring" }]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "sol",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.equal(hits[0]?.name, "Sol Ring", "a name starting with the query beats one containing it");
}

function testLaterWordPrefixIsFound() {
  const catalog = catalogOf([{ name: "Sol Ring" }, { name: "Boring Card" }]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "ring",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.equal(hits[0]?.name, "Sol Ring", "a word starting with the query outranks a substring");
}

function testShortQueriesReturnNothing() {
  const catalog = catalogOf([{ name: "Sol Ring" }]);

  const { hits, totalMatches } = searchDeckEditorCardsV1({
    catalog,
    query: "s",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.equal(hits.length, 0, "a single character matches thousands of cards uselessly");
  assert.equal(totalMatches, 0);
}

function testDigitalOnlyCardsAreNeverOffered() {
  const catalog = catalogOf([
    { name: "Ohran Frostfang" },
    { name: "Ohran Viper Rebalanced", paperEligible: false },
  ]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "ohran",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.deepEqual(
    hits.map((hit) => hit.name),
    ["Ohran Frostfang"],
    "a card with no paper printing cannot be bought or played at a table",
  );
}

function testTokensAreNeverOffered() {
  const catalog = catalogOf([
    { name: "Snake Token", layout: "token" },
    { name: "Snake Umbra", layout: "normal" },
  ]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "snake",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.deepEqual(hits.map((hit) => hit.name), ["Snake Umbra"]);
}

function testOffColorCardsAreFlaggedNotHidden() {
  const catalog = catalogOf([{ name: "Rhystic Study", colorIdentity: ["U"] }]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "rhystic",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.equal(hits.length, 1, "hiding the card leaves the player thinking search is broken");
  assert.deepEqual(hits[0]?.offColorPips, ["U"]);
}

function testBannedCardsAreFlaggedNotHidden() {
  const catalog = catalogOf([{ name: "Channel", commander: "banned" }]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "channel",
    commanderColorIdentity: MONO_GREEN,
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.commanderLegal, false);
}

function testCardsAlreadyInTheDeckReportTheirBoard() {
  const catalog = catalogOf([{ name: "Ohran Frostfang" }]);
  const boards = new Map<string, DeckBoardV1>([["o-ohran-frostfang", "considering"]]);

  const { hits } = searchDeckEditorCardsV1({
    catalog,
    query: "ohran",
    commanderColorIdentity: MONO_GREEN,
    boardsByOracleId: boards,
  });

  assert.equal(
    hits[0]?.alreadyOnBoard,
    "considering",
    "the picker needs this to offer a move instead of a silent no-op",
  );
}

function testBasicLandsAreIdentified() {
  const catalog = catalogOf([
    { name: "Forest", typeLine: "Basic Land — Forest", types: ["Land"], supertypes: ["Basic"] },
    { name: "Ancient Tomb", typeLine: "Land", types: ["Land"] },
  ]);

  const forest = searchDeckEditorCardsV1({
    catalog,
    query: "forest",
    commanderColorIdentity: MONO_GREEN,
  }).hits[0];
  const tomb = searchDeckEditorCardsV1({
    catalog,
    query: "ancient tomb",
    commanderColorIdentity: MONO_GREEN,
  }).hits[0];

  assert.equal(forest?.isBasicLand, true, "only basic lands may exceed one copy");
  assert.equal(forest?.isLand, true);
  assert.equal(tomb?.isBasicLand, false);
  assert.equal(tomb?.isLand, true);
}

function testTotalMatchesReportsBeyondTheLimit() {
  const catalog = catalogOf(
    Array.from({ length: 40 }, (_, index) => ({ name: `Elvish Scout ${index}` })),
  );

  const { hits, totalMatches } = searchDeckEditorCardsV1({
    catalog,
    query: "elvish",
    commanderColorIdentity: MONO_GREEN,
    limit: 10,
  });

  assert.equal(hits.length, 10);
  assert.equal(totalMatches, 40, "the UI says 'showing 10 of 40', so the count must be the real one");
}

const tests = [
  testExactNameRanksFirst,
  testPrefixBeatsMidWordMatch,
  testLaterWordPrefixIsFound,
  testShortQueriesReturnNothing,
  testDigitalOnlyCardsAreNeverOffered,
  testTokensAreNeverOffered,
  testOffColorCardsAreFlaggedNotHidden,
  testBannedCardsAreFlaggedNotHidden,
  testCardsAlreadyInTheDeckReportTheirBoard,
  testBasicLandsAreIdentified,
  testTotalMatchesReportsBeyondTheLimit,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${test.name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
