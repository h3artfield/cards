/**
 * RC5 post-Pass-2 audit — modal (4 FN) + triggered (2 FN) structural classification.
 */
import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { Rc5RegressionPack } from "./lib/rc5-regression-scoring-v1";

const pack = JSON.parse(readFileSync("data/oracle-action-eval-rc5-v14-regression-v150.json", "utf8")) as Rc5RegressionPack;

const MODAL = ["vh14-0046", "vh14-0131", "vh14-0133", "vh14-0137"];
const TRIGGERED = ["vh14-0105", "vh14-0114"];

for (const id of [...MODAL, ...TRIGGERED]) {
  const c = pack.actionScoringCases.find((x) => x.sourceV14CaseId === id);
  if (!c) continue;
  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const targets = c.scoringTargets;
  console.log("\n===", id, c.cardName, "===");
  console.log("family:", targets[0]?.rc5Family);
  console.log("oracle:", c.oracleText.slice(0, 120).replace(/\n/g, " | ") + "...");
  console.log(
    "targets:",
    targets.map((t) => ({ action: t.actionType, evidence: t.evidenceContains.slice(0, 50) })),
  );
  console.log(
    "emitted:",
    parse.actions.filter((a) => a.reviewStatus === "accepted").map((a) => ({
      type: a.actionType,
      ev: a.provenance.actionSpan.text.slice(0, 55),
    })),
  );
}
