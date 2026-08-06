/**
 * Unit tests for Scryfall syntax → inventory parser (no network).
 */
import assert from "node:assert/strict";
import {
  looksLikeScryfallSyntax,
  parseScryfallInventoryQuery,
} from "../src/lib/store-inventory/clerk-tools/scryfall-syntax-parser";

function testLooksLikeScryfallSyntax() {
  assert.equal(looksLikeScryfallSyntax("id:temur t:instant"), true);
  assert.equal(looksLikeScryfallSyntax("what Temur cards do you have"), false);
  assert.equal(looksLikeScryfallSyntax("!Lightning Bolt"), true);
}

function testIdSubsetEsper() {
  const parsed = parseScryfallInventoryQuery("id<=esper t:instat");
  assert.ok(parsed);
  assert.deepEqual(parsed.semantic.colorIdentitySubsetOf, ["W", "U", "B"]);
  assert.deepEqual(parsed.semantic.typeIncludes, ["instat"]);
  assert.equal(parsed.semanticOnly, true);
}

function testIdTemur() {
  const parsed = parseScryfallInventoryQuery("id:temur t:instant");
  assert.ok(parsed);
  assert.deepEqual(parsed.semantic.colorIdentityExact, ["G", "U", "R"]);
  assert.deepEqual(parsed.semantic.typeIncludes, ["instant"]);
  assert.equal(parsed.semanticOnly, true);
}

function testColorRg() {
  const parsed = parseScryfallInventoryQuery("c:rg t:creature");
  assert.ok(parsed);
  assert.deepEqual(parsed.semantic.colorsExact, ["R", "G"]);
}

function testOracleDraw() {
  const parsed = parseScryfallInventoryQuery("o:draw t:instant");
  assert.ok(parsed);
  assert.ok(parsed.semantic.oracleTextAny?.includes("draw"));
}

function testExactName() {
  const parsed = parseScryfallInventoryQuery('!"Lightning Bolt"');
  assert.ok(parsed);
  assert.equal(parsed.q, "Lightning Bolt");
}

function testManaValue() {
  const parsed = parseScryfallInventoryQuery("mv<=3 t:creature");
  assert.ok(parsed);
  assert.equal(parsed.semantic.cmcMax, 3);
}

testLooksLikeScryfallSyntax();
testIdSubsetEsper();
testIdTemur();
testColorRg();
testOracleDraw();
testExactName();
testManaValue();

console.log("scryfall syntax parser tests passed");
