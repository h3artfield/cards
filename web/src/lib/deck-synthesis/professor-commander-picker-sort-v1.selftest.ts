/**
 * Tests for the commander picker's client-side ordering.
 *
 * The bug these exist to prevent: rank is absent for ~86% of the commander pool,
 * so a comparator that reads `a.rank - b.rank` sends every unranked commander to
 * the front of the popularity list as if it were rank 0.
 */
import assert from "node:assert/strict";
import {
  compareProfessorCommandersV1,
  DEFAULT_PROFESSOR_COMMANDER_SORT_V1,
  sortProfessorCommanderResultsV1,
} from "./professor-commander-picker-sort-v1";

type Row = { name: string; rank?: number };

const POOL: Row[] = [
  { name: "Krenko, Mob Boss", rank: 5 },
  { name: "Volrath the Fallen" },
  { name: "Atraxa, Praetors' Voice", rank: 4 },
  { name: "Édgar Markov", rank: 2 },
  { name: "Ashnod the Uncaring" },
];

function names(rows: Row[]) {
  return rows.map((r) => r.name);
}

function testDefaultSortIsAlphabetical() {
  assert.equal(DEFAULT_PROFESSOR_COMMANDER_SORT_V1, "alphabetical");
}

function testAlphabeticalIgnoresAccentsAndRank() {
  assert.deepEqual(names(sortProfessorCommanderResultsV1(POOL, "alphabetical", "")), [
    "Ashnod the Uncaring",
    "Atraxa, Praetors' Voice",
    "Édgar Markov",
    "Krenko, Mob Boss",
    "Volrath the Fallen",
  ]);
}

function testPopularityOrdersByRankAscending() {
  assert.deepEqual(names(sortProfessorCommanderResultsV1(POOL, "popularity", "")).slice(0, 3), [
    "Édgar Markov",
    "Atraxa, Praetors' Voice",
    "Krenko, Mob Boss",
  ]);
}

function testUnrankedSortsLastAlphabeticallyAmongThemselves() {
  assert.deepEqual(names(sortProfessorCommanderResultsV1(POOL, "popularity", "")).slice(-2), [
    "Ashnod the Uncaring",
    "Volrath the Fallen",
  ]);
}

/** An unranked commander must not read as rank 0 and outrank The Ur-Dragon. */
function testUndefinedRankDoesNotSortAsZero() {
  const compare = compareProfessorCommandersV1("popularity");
  assert.ok(compare({ name: "Volrath the Fallen" }, { name: "The Ur-Dragon", rank: 1 }) > 0);
  assert.ok(compare({ name: "The Ur-Dragon", rank: 1 }, { name: "Volrath the Fallen" }) < 0);
}

function testExactQueryMatchIsPinnedUnderAlphabeticalSort() {
  const atraxas: Row[] = [
    { name: "Atraxa, Grand Unifier" },
    { name: "Atraxa, Praetors' Voice", rank: 4 },
  ];

  assert.equal(
    sortProfessorCommanderResultsV1(atraxas, "alphabetical", "Atraxa, Praetors' Voice")[0]?.name,
    "Atraxa, Praetors' Voice",
    "a full name typed out is unambiguous intent and beats A–Z",
  );
}

function testNonExactQueryLeavesChosenSortIntact() {
  const atraxas: Row[] = [
    { name: "Atraxa, Praetors' Voice", rank: 4 },
    { name: "Atraxa, Grand Unifier" },
  ];

  assert.deepEqual(names(sortProfessorCommanderResultsV1(atraxas, "alphabetical", "atraxa")), [
    "Atraxa, Grand Unifier",
    "Atraxa, Praetors' Voice",
  ]);
}

function testSortDoesNotMutateInput() {
  const input: Row[] = [{ name: "Zzz" }, { name: "Aaa" }];
  sortProfessorCommanderResultsV1(input, "alphabetical", "");
  assert.deepEqual(names(input), ["Zzz", "Aaa"]);
}

const tests = [
  testDefaultSortIsAlphabetical,
  testAlphabeticalIgnoresAccentsAndRank,
  testPopularityOrdersByRankAscending,
  testUnrankedSortsLastAlphabeticallyAmongThemselves,
  testUndefinedRankDoesNotSortAsZero,
  testExactQueryMatchIsPinnedUnderAlphabeticalSort,
  testNonExactQueryLeavesChosenSortIntact,
  testSortDoesNotMutateInput,
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
