/**
 * v1.22 report probe — face-leakage 18, unsupported, dev FP detail.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function loadCombined(): OracleActionEvalCaseV2[] {
  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v1.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const training = exp.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  return [...dev.cases, ...training];
}

function main() {
  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const combined = loadCombined();
  const faceHits: Array<Record<string, unknown>> = [];

  for (const c of combined) {
    const raw = extractOracleActionsV1({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
    });
    const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
      faceId: a.faceId,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: c.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (c.cardFace && a.primitive) {
        faceHits.push({
          caseId: c.id,
          cardName: c.cardName,
          caseFace: c.cardFace,
          primitive: a.primitive,
          evidence: a.evidenceText,
          assignedFace: a.faceId,
        });
      }
    }
  }

  const devEval = evaluateCaseSet(dev.cases, "development_v25");
  const combinedEval = evaluateCaseSet(combined, "combined");

  const devFp: Array<Record<string, unknown>> = [];
  for (const c of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
    });
    const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
      quantityType: a.quantityType,
      quantityCertainty: a.quantityCertainty,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: c.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      devFp.push({ caseId: c.id, cardName: c.cardName, ...a });
    }
  }

  const report = {
    faceLeakageHeuristic18: faceHits,
    devAcceptedFp: devFp,
    devMetrics: devEval.metricsByEmissionTier.acceptedOnly,
    combinedUnsupported: combinedEval.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
  };

  const out = resolve(process.cwd(), "reports/v122-report-probe.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ faceLeak18: faceHits.length, devFp: devFp.length, ...report.devMetrics, combinedUnsupported: report.combinedUnsupported }, null, 2));
}

main();
