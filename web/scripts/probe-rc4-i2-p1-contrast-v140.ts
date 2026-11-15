/**
 * RC4 I2/P1 contrast probe — parser behavioral assertions (not gold TP/FP/FN).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";

type ContrastCase = {
  id: string;
  contrastFamily: string;
  oracleId: string;
  oracleText: string;
  mustEmit: Array<{ actionType: string; evidenceContains: string }>;
  mustNotEmit: Array<{ actionType: string; evidenceContains?: string }>;
  contrastNote: string;
};

const pack = JSON.parse(
  readFileSync("data/oracle-action-eval-rc4-i2-p1-contrast-v140.json", "utf8"),
) as { cases: ContrastCase[] };

function matches(
  emitted: Array<{ actionType: string; text: string }>,
  rule: { actionType: string; evidenceContains?: string },
): boolean {
  return emitted.some((a) => {
    if (a.actionType !== rule.actionType) return false;
    if (!rule.evidenceContains) return true;
    const aLow = a.text.toLowerCase();
    const rLow = rule.evidenceContains.toLowerCase();
    return aLow.includes(rLow) || rLow.includes(aLow);
  });
}

const results = pack.cases.map((tc) => {
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const emitted = parse.actions
    .filter((a) => a.reviewStatus === "accepted")
    .map((a) => ({ actionType: a.actionType, text: a.provenance.actionSpan.text }));

  const missingEmit = tc.mustEmit.filter((r) => !matches(emitted, r));
  const forbiddenPresent = tc.mustNotEmit.filter((r) => matches(emitted, r));
  const pass = missingEmit.length === 0 && forbiddenPresent.length === 0;

  return {
    id: tc.id,
    family: tc.contrastFamily,
    pass,
    missingEmit,
    forbiddenPresent,
    emitted: emitted.map((a) => `${a.actionType}:${a.text.slice(0, 48)}`),
    note: tc.contrastNote,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  parserVersion: "rc4-in-progress",
  caseCount: results.length,
  passCount: results.filter((r) => r.pass).length,
  failCount: results.filter((r) => !r.pass).length,
  byFamily: Object.fromEntries(
    [...new Set(results.map((r) => r.family))].map((family) => [
      family,
      {
        pass: results.filter((r) => r.family === family && r.pass).length,
        fail: results.filter((r) => r.family === family && !r.pass).length,
      },
    ]),
  ),
  results,
};

mkdirSync(resolve("data/milestones/rc4-development"), { recursive: true });
writeFileSync(
  resolve("data/milestones/rc4-development/rc4-i2-p1-contrast-probe-v140.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
if (summary.failCount > 0) process.exit(1);
