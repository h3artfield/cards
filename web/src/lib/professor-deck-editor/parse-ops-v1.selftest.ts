/**
 * Tests for the untrusted-input boundary.
 *
 * The reducer is only safe if what reaches it matches its declared type, so
 * these check the shapes a broken or hostile client would actually send.
 */
import assert from "node:assert/strict";
import { parseDeckEditOpsV1 } from "./parse-ops-v1";

function testRejectsNonArrayAndEmpty() {
  for (const bad of [undefined, null, {}, "moveCard", 3]) {
    const result = parseDeckEditOpsV1(bad);
    assert.equal(result.ok, false, `${JSON.stringify(bad)} must not parse`);
  }
  assert.equal(parseDeckEditOpsV1([]).ok, false, "an empty batch is a client bug");
  console.log("PASS  ops must be a non-empty array");
}

function testRejectsUnknownOperation() {
  const result = parseDeckEditOpsV1([{ op: "dropTable", cardKey: "o:x" }]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /not a supported operation/);
  console.log("PASS  an unknown op is rejected rather than ignored");
}

function testRejectsStringCopies() {
  // The reducer does arithmetic on copies; a string here would concatenate
  // into the deck count instead of adding to it.
  const result = parseDeckEditOpsV1([{ op: "setCopies", cardKey: "o:x", copies: "4" }]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /whole number/);

  for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      parseDeckEditOpsV1([{ op: "setCopies", cardKey: "o:x", copies: bad }]).ok,
      false,
      `${bad} must not parse as a copy count`,
    );
  }
  console.log("PASS  copies must be a real whole number");
}

function testRejectsUnknownBoard() {
  const result = parseDeckEditOpsV1([{ op: "moveCard", cardKey: "o:x", board: "sideboard" }]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /valid board/);
  console.log("PASS  only the three real boards are accepted");
}

function testMissingOracleIdBecomesNull() {
  // Typing a land by hand gives a name and nothing else, which is legitimate.
  const result = parseDeckEditOpsV1([{ op: "addCard", name: "Forest", board: "mainboard" }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.ops[0], {
    op: "addCard",
    oracleId: null,
    name: "Forest",
    board: "mainboard",
    copies: undefined,
    isLand: undefined,
  });
  console.log("PASS  a card added without an oracle id parses with a null id");
}

function testNullPrimaryMarkerIsMeaningful() {
  const cleared = parseDeckEditOpsV1([
    { op: "setPrimaryMarker", cardKey: "o:x", markerId: null },
  ]);
  assert.equal(cleared.ok, true);
  if (cleared.ok) assert.equal(cleared.ops[0]!.op === "setPrimaryMarker" && cleared.ops[0].markerId, null);

  const missing = parseDeckEditOpsV1([{ op: "setPrimaryMarker", cardKey: "o:x" }]);
  assert.equal(missing.ok, false, "omitting markerId entirely is not the same as clearing it");
  console.log("PASS  a null primary marker clears grouping, a missing one is an error");
}

function testOneBadOperationFailsTheWholeRequest() {
  const result = parseDeckEditOpsV1([
    { op: "moveCard", cardKey: "o:x", board: "cut" },
    { op: "moveCard", cardKey: "o:y", board: "nonsense" },
  ]);
  assert.equal(result.ok, false, "a malformed batch is not partially applied");
  if (!result.ok) assert.match(result.message, /Operation 1/, "and it says which row");
  console.log("PASS  one malformed operation fails the whole request, and names the row");
}

function testBatchSizeIsCapped() {
  const ops = Array.from({ length: 101 }, () => ({
    op: "moveCard",
    cardKey: "o:x",
    board: "cut",
  }));
  const result = parseDeckEditOpsV1(ops);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /limited to 100/);
  console.log("PASS  batch size is capped so one request cannot do unbounded work");
}

function testMarkerScopeIsConstrained() {
  assert.equal(parseDeckEditOpsV1([{ op: "createMarker", label: "Owned", scope: "deck" }]).ok, true);
  assert.equal(parseDeckEditOpsV1([{ op: "createMarker", label: "Owned", scope: "everyone" }]).ok, false);
  assert.equal(parseDeckEditOpsV1([{ op: "createMarker", label: "Owned" }]).ok, false);
  console.log("PASS  marker scope must be deck or global");
}

const tests = [
  testRejectsNonArrayAndEmpty,
  testRejectsUnknownOperation,
  testRejectsStringCopies,
  testRejectsUnknownBoard,
  testMissingOracleIdBecomesNull,
  testNullPrimaryMarkerIsMeaningful,
  testOneBadOperationFailsTheWholeRequest,
  testBatchSizeIsCapped,
  testMarkerScopeIsConstrained,
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
