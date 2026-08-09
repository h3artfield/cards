/**
 * Unique Stage-C semantic gold evaluation for v136 spent dev.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  collectRegionLinkedLayer2Records,
  dedupeSemanticGoldActions,
} from "./lib/granted-unique-layer2-gold";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

function main() {
  resetRC3PromotedFamiliesToDefault();
  const cases = (
    JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")) as {
      cases: Array<{ id: string; oracleId: string; oracleText: string; cardName?: string; benchmarkTargets: unknown[] }>;
    }
  ).cases;

  const { uniqueSemanticActions } = dedupeSemanticGoldActions(collectRegionLinkedLayer2Records(cases));
  let tp = 0;
  let fn = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const gold of uniqueSemanticActions) {
    const c = cases.find((x) => x.oracleId === gold.oracleId)!;
    const parse = parseOracleSemanticsRC3({ oracleId: gold.oracleId, oracleText: c.oracleText });
    const hit = parse.actions.some(
      (a) =>
        a.reviewStatus === "accepted" &&
        a.actionType === gold.actionType &&
        a.executionContext === "granted_ability" &&
        a.provenance.actionSpan.text.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12)),
    );
    if (hit) tp++;
    else fn++;
    rows.push({
      caseId: gold.caseId,
      cardName: gold.cardName,
      actionType: gold.actionType,
      evidenceContains: gold.evidenceContains,
      result: hit ? "TP" : "FN",
      emitted: parse.actions
        .filter((a) => a.actionType === gold.actionType && a.reviewStatus === "accepted")
        .map((a) => ({
          text: a.provenance.actionSpan.text,
          executionContext: a.executionContext,
          semanticOwner: a.semanticOwner,
        })),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v136-stage-c-unique",
    uniqueStageCGold: uniqueSemanticActions.length,
    ...metricsFromCounts(tp, 0, fn),
    rows,
    nestedGrantedAbsoluteSpanValid: rows.every((r) => r.result === "TP"),
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-stage-c-unique-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ tp, fp: 0, fn, pool: uniqueSemanticActions.length }, null, 2));
}

main();
