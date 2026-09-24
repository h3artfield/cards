/**
 * Tests for the commander picker's browse + search.
 *
 * The bug these exist to prevent: the picker's universe used to be the EDHREC
 * popularity list, so a commander nobody had built on EDHREC did not exist as
 * far as the picker was concerned. A store owner reported seven commanders that
 * returned zero results; every one of them was present and correctly flagged in
 * the card catalog and simply absent from EDHREC. They are named below as
 * regression cases.
 */
import assert from "node:assert/strict";
import {
  buildProfessorCommanderIndexForTest,
  searchProfessorCommanderIndexForTest,
} from "./professor-commander-search-service-v1";
import type { CommanderSearchCatalogV1 } from "./professor-commander-search-catalog-v1";
import { normalizeOracleName } from "../deck-builder/golden-catalog/normalize-name";
import type { EdhrecCommanderMeta } from "../deck-builder/types";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";

/**
 * Commanders the store owner reported as returning zero results, under the
 * names the catalog actually holds. "Lord Xander, the Wicked" was reported from
 * memory; the printed card is "Lord Xander, the Collector".
 */
const REPORTED_MISSING = [
  "Lord Xander, the Collector",
  "Perrie, the Pulverizer",
  "Raffine, Scheming Seer",
  "Radagast the Brown",
  "Captain America, First Avenger",
  "Shredder, Unrelenting",
  "Volrath the Fallen",
  "Atraxa, Grand Unifier",
];

type CardSpec = {
  name: string;
  colorIdentity?: string[];
  /** Omit to model a commander with no EDHREC row, which is the common case. */
  rank?: number;
  /** Set false to model a card the paper / sole-commander gate rejects. */
  soleCommander?: boolean;
};

function goldenCard(spec: CardSpec): GoldenCatalogOracleCard {
  return {
    id: `p-${spec.name}`,
    oracleId: `o-${normalizeOracleName(spec.name)}`,
    canonicalName: spec.name,
    normalizedName: spec.name.toLowerCase(),
    manaValue: 4,
    cmc: 4,
    colors: spec.colorIdentity ?? ["W"],
    colorIdentity: spec.colorIdentity ?? ["W"],
    typeLine: "Legendary Creature — Human Soldier",
    supertypes: ["Legendary"],
    types: ["Creature"],
    subtypes: [],
    keywords: [],
    legalities: { commander: "legal" } as GoldenCatalogOracleCard["legalities"],
    commanderClassification: {} as GoldenCatalogOracleCard["commanderClassification"],
    commanderEligibility: {} as GoldenCatalogOracleCard["commanderEligibility"],
    commanderEligibilityVersion: "test",
    oracleTags: [],
    printingIds: [],
    sourceVersion: "test",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

function indexOf(specs: CardSpec[]) {
  const byOracleId = new Map<string, GoldenCatalogOracleCard>();
  const paperEligibleSoleCommanderNames = new Set<string>();
  const edhrec: EdhrecCommanderMeta[] = [];

  for (const spec of specs) {
    const card = goldenCard(spec);
    byOracleId.set(card.oracleId, card);
    if (spec.soleCommander !== false) {
      paperEligibleSoleCommanderNames.add(normalizeOracleName(spec.name));
    }
    if (spec.rank !== undefined) {
      edhrec.push({
        id: normalizeOracleName(spec.name),
        commanderSlug: `edhrec-${normalizeOracleName(spec.name)}`,
        commanderName: spec.name,
        rank: spec.rank,
        scryfallId: `sf-${normalizeOracleName(spec.name)}`,
        colorIdentity: spec.colorIdentity ?? ["W"],
      } as EdhrecCommanderMeta);
    }
  }

  const catalog = {
    byOracleId,
    paperEligibleSoleCommanderNames,
  } as unknown as CommanderSearchCatalogV1;

  return buildProfessorCommanderIndexForTest(catalog, edhrec);
}

function search(specs: CardSpec[], query: string) {
  return searchProfessorCommanderIndexForTest(indexOf(specs), query);
}

/** The regression case for the reported bug. */
function testReportedMissingCommandersAreFound() {
  // Only one of them is popular enough to have an EDHREC row.
  const specs: CardSpec[] = REPORTED_MISSING.map((name) => ({ name }));
  specs.push({ name: "Atraxa, Praetors' Voice", rank: 4 });
  const index = indexOf(specs);

  for (const name of REPORTED_MISSING) {
    const { results } = searchProfessorCommanderIndexForTest(index, name);
    assert.ok(
      results.some((r) => r.name === name),
      `${name} must be findable — it is a legal commander with no EDHREC entry`,
    );
  }
}

function testCommandersWithNoEdhrecRowAreInThePool() {
  const { results, total } = search([{ name: "Raffine, Scheming Seer" }], "");

  assert.equal(total, 1, "the pool is the catalog, not the EDHREC list");
  assert.equal(results[0]?.name, "Raffine, Scheming Seer");
  assert.equal(results[0]?.rank, undefined, "no EDHREC row means no rank, not exclusion");
  assert.equal(results[0]?.fromCatalog, true);
}

function testPartialNameFindsEveryVariant() {
  const { results } = search(
    [
      { name: "Captain America, First Avenger" },
      { name: "Captain America, Liberator" },
      { name: "Captain America, Steve Rogers" },
      { name: "Raffine, Scheming Seer" },
    ],
    "captain america",
  );

  assert.equal(results.length, 3, "typing a shared prefix must surface all of them");
}

function testEdhrecRankOrdersTiedMatches() {
  const { results } = search(
    [
      { name: "Atraxa, Grand Unifier" },
      { name: "Atraxa, Praetors' Voice", rank: 4 },
    ],
    "atraxa",
  );

  assert.deepEqual(
    results.map((r) => r.name),
    ["Atraxa, Praetors' Voice", "Atraxa, Grand Unifier"],
    "the popular Atraxa must still lead, but the other must still be listed",
  );
}

function testExactNameBeatsPopularity() {
  const { results } = search(
    [
      { name: "Teysa Karlov", rank: 54 },
      { name: "Teysa, Opulent Oligarch" },
    ],
    "Teysa, Opulent Oligarch",
  );

  assert.equal(
    results[0]?.name,
    "Teysa, Opulent Oligarch",
    "an exact name is an unambiguous intent and outranks a more popular card",
  );
}

function testPunctuationAndCommasAreIgnored() {
  const { results } = search([{ name: "Lord Xander, the Collector" }], "lord xander");

  assert.equal(results[0]?.name, "Lord Xander, the Collector");
}

function testLaterWordIsMatched() {
  const { results } = search(
    [{ name: "Raffine, Scheming Seer" }, { name: "Seerbound Scout" }],
    "seer",
  );

  assert.deepEqual(
    results.map((r) => r.name),
    ["Seerbound Scout", "Raffine, Scheming Seer"],
    "a name starting with the query leads, but a later word must still match",
  );
}

function testNonSoleCommandersStayExcluded() {
  const { results, total } = search(
    [
      { name: "Raffine, Scheming Seer" },
      // Backgrounds and partner-only cards fail the catalog's sole gate.
      { name: "Cultist of the Absolute", soleCommander: false },
    ],
    "",
  );

  assert.equal(total, 1, "a card that cannot be a sole commander is not a commander here");
  assert.deepEqual(results.map((r) => r.name), ["Raffine, Scheming Seer"]);
}

function testBrowseIsCappedButTotalIsTheWholePool() {
  const specs = Array.from({ length: 400 }, (_, i) => ({
    name: `Commander Number ${String(i).padStart(3, "0")}`,
  }));

  const { results, total } = search(specs, "");

  assert.equal(total, 400, "total must report the real pool so completeness is measurable");
  assert.equal(results.length, 250, "the browse window is trimmed to keep the response small");
}

function testSearchTotalCountsMatchesBeyondTheLimit() {
  const specs = Array.from({ length: 80 }, (_, i) => ({
    name: `Elvish Warden ${String(i).padStart(2, "0")}`,
  }));

  const { results, total } = search(specs, "elvish");

  assert.equal(results.length, 50, "results are capped at the search limit");
  assert.equal(total, 80, "but the caller is told how many actually matched");
}

function testBrowseLeadsWithPopularCommanders() {
  const specs: CardSpec[] = [
    { name: "Aaa Unranked Commander" },
    { name: "Zzz Popular Commander", rank: 1 },
  ];

  const { results } = search(specs, "");

  assert.equal(
    results[0]?.name,
    "Zzz Popular Commander",
    "the default list should look recognisable, not alphabetical",
  );
}

function testModalCardSlugUsesFrontFace() {
  const { results } = search([{ name: "Alrund, God of the Cosmos // Hakka, Whispering Raven" }], "alrund");

  assert.equal(
    results[0]?.slug,
    "alrund-god-of-the-cosmos",
    "EDHREC keys modal commanders by their front face",
  );
}

function testEdhrecSlugIsPreferredWhenKnown() {
  const { results } = search([{ name: "Teysa Karlov", rank: 54 }], "teysa");

  assert.equal(results[0]?.slug, "edhrec-teysakarlov", "a real EDHREC slug beats a generated guess");
  assert.equal(results[0]?.rank, 54);
  assert.equal(results[0]?.fromCatalog, false);
}

const tests = [
  testReportedMissingCommandersAreFound,
  testCommandersWithNoEdhrecRowAreInThePool,
  testPartialNameFindsEveryVariant,
  testEdhrecRankOrdersTiedMatches,
  testExactNameBeatsPopularity,
  testPunctuationAndCommasAreIgnored,
  testLaterWordIsMatched,
  testNonSoleCommandersStayExcluded,
  testBrowseIsCappedButTotalIsTheWholePool,
  testSearchTotalCountsMatchesBeyondTheLimit,
  testBrowseLeadsWithPopularCommanders,
  testModalCardSlugUsesFrontFace,
  testEdhrecSlugIsPreferredWhenKnown,
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
