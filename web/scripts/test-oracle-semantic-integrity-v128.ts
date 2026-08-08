/**
 * Semantic integrity + provenance containment tests (v1.28).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { hashOracleText } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const RUSH_ORACLE =
  "Spree (Choose one or more additional costs.)\n+ {1} — Target opponent sacrifices half the creatures they control of their choice, rounded up.\n+ {2} — Target opponent discards half the cards in their hand, rounded up.\n+ {2} — Target opponent loses half their life, rounded up.";

function testOracleTextHash() {
  const parse = parseOracleSemantics({ oracleId: "test", oracleText: RUSH_ORACLE });
  assert.equal(parse.oracleTextHash, hashOracleText(RUSH_ORACLE));
  console.log("✓ oracleTextHash present and correct");
}

function testRushIntegrity() {
  const parse = parseOracleSemantics({
    oracleId: "0dfe6ec6-a0df-41c8-90dd-1ddf0417700a",
    oracleText: RUSH_ORACLE,
  });
  const result = verifySemanticParseIntegrity(parse, RUSH_ORACLE);
  assert.ok(result.ok, JSON.stringify([...result.idViolations, ...result.provenanceViolations], null, 2));
  console.log("✓ Rush of Dread ID + provenance integrity");
}

function testDevelopmentCorporaIntegrity() {
  const paths = [
    "data/oracle-action-eval-development-v26.json",
    "data/oracle-action-eval-development-generalization-expansion-v2.json",
    "data/oracle-action-eval-development-generalization-expansion-v3.json",
    "data/oracle-action-eval-development-generalization-expansion-v5.json",
  ];
  let checked = 0;
  let idViolations = 0;
  let provenanceViolations = 0;
  for (const path of paths) {
    const envelope = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
    for (const testCase of envelope.cases) {
      const parse = parseOracleSemantics({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
      const result = verifySemanticParseIntegrity(parse, testCase.oracleText);
      checked++;
      idViolations += result.idViolations.length;
      provenanceViolations += result.provenanceViolations.length;
    }
  }
  assert.equal(idViolations, 0, `expected zero ID integrity violations across ${checked} dev cases`);
  assert.equal(provenanceViolations, 0, `expected zero provenance violations across ${checked} dev cases`);
  console.log(`✓ development corpora ID + provenance integrity (${checked} cases)`);
}

testOracleTextHash();
testRushIntegrity();
testDevelopmentCorporaIntegrity();
console.log("\nSemantic integrity tests passed.");
