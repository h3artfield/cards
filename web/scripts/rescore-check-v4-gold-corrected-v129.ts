/**
 * Rescore check-v4 from saved v1.29 diagnostic per-case metrics + gold adjudication overlay.
 * Does NOT execute parser against check-v4 or increment parserExecutionCount.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

const ADJUDICATION_PATH =
  "data/milestones/rc2-development-planning/expansion-check-v4-gold-adjudication-v129.json";
const V129_REPORT_PATH = "data/milestones/rc2-development-planning/v129-dev-gate-report.json";
const EXECUTION_PATH = "data/milestones/rc2-development-planning/rc2-expansion-check-v4-execution-1.json";

type CaseMetrics = { tp: number; fp: number; fn: number };

function sumMetrics(rows: CaseMetrics[]) {
  const tp = rows.reduce((s, r) => s + r.tp, 0);
  const fp = rows.reduce((s, r) => s + r.fp, 0);
  const fn = rows.reduce((s, r) => s + r.fn, 0);
  return {
    tp,
    fp,
    fn,
    precision: tp + fp > 0 ? tp / (tp + fp) : 1,
    recall: tp + fn > 0 ? tp / (tp + fn) : 1,
  };
}

function applyGoldCorrection(
  saved: CaseMetrics,
  adjudication: {
    caseId: string;
    oldLabels: ExpectedPrimitiveAction;
    newLabels: ExpectedPrimitiveAction;
    v129DiagnosticEmission: { verdictUnderCorrectedGold: string };
  },
): CaseMetrics {
  if (adjudication.v129DiagnosticEmission.verdictUnderCorrectedGold !== "parser_correct") {
    throw new Error(`${adjudication.caseId}: parser does not match corrected gold`);
  }
  if (saved.fn !== 1 || saved.tp !== 0 || saved.fp !== 0) {
    throw new Error(`${adjudication.caseId}: expected saved diagnostic FN-only mismatch, got ${JSON.stringify(saved)}`);
  }
  return { tp: 1, fp: 0, fn: 0 };
}

function main() {
  const adjudication = JSON.parse(readFileSync(ADJUDICATION_PATH, "utf8")) as {
    auditVersion: string;
    parentContentHash: string;
    changedCaseCount: number;
    adjudications: Array<{
      caseId: string;
      cardName: string;
      oldLabels: ExpectedPrimitiveAction;
      newLabels: ExpectedPrimitiveAction;
      canonicalOracleEvidence: string;
      reason: string;
      parserConsultedForCorrection: boolean;
      v129DiagnosticEmission: { verdictUnderCorrectedGold: string };
    }>;
  };

  const v129 = JSON.parse(readFileSync(V129_REPORT_PATH, "utf8")) as {
    checkV4Diagnostic: {
      cases: Array<{ caseId: string; semantic: CaseMetrics }>;
      semantic: CaseMetrics;
    };
  };

  const execution = JSON.parse(readFileSync(EXECUTION_PATH, "utf8")) as {
    metrics: CaseMetrics & { precision: number; recall: number };
  };

  const adjudicatedIds = new Set(adjudication.adjudications.map((a) => a.caseId));
  const savedByCase = new Map(v129.checkV4Diagnostic.cases.map((c) => [c.caseId, c.semantic]));

  const correctedPerCase: Array<{ caseId: string; before: CaseMetrics; after: CaseMetrics }> = [];
  const rescoreRows: CaseMetrics[] = [];

  for (const row of v129.checkV4Diagnostic.cases) {
    const saved = row.semantic;
    const adj = adjudication.adjudications.find((a) => a.caseId === row.caseId);
    if (adj) {
      const corrected = applyGoldCorrection(saved, adj);
      correctedPerCase.push({ caseId: row.caseId, before: saved, after: corrected });
      rescoreRows.push(corrected);
    } else {
      rescoreRows.push(saved);
      if (saved.fn > 0 || saved.fp > 0) {
        throw new Error(`Unexpected residual mismatch on non-adjudicated case ${row.caseId}: ${JSON.stringify(saved)}`);
      }
    }
  }

  const v129Diagnostic = sumMetrics(v129.checkV4Diagnostic.cases.map((c) => c.semantic));
  const goldCorrected = sumMetrics(rescoreRows);

  if (adjudicatedIds.size !== adjudication.changedCaseCount) {
    throw new Error("Adjudication case count mismatch");
  }

  const provenance = {
    generatedAt: new Date().toISOString(),
    holdout: {
      status: "spent",
      parserExecutionCount: 1,
      noParserRerun: true,
    },
    parentContentHash: adjudication.parentContentHash,
    adjudicationRef: ADJUDICATION_PATH,
    v129DiagnosticSource: V129_REPORT_PATH,
    originalSavedExecution: {
      tp: execution.metrics.tp,
      fp: execution.metrics.fp,
      fn: execution.metrics.fn,
      precision: execution.metrics.precision,
      recall: execution.metrics.recall,
    },
    v129Diagnostic: v129Diagnostic,
    goldCorrectedDiagnostic: goldCorrected,
    correctedCases: correctedPerCase.map(({ caseId, before, after }) => {
      const adj = adjudication.adjudications.find((a) => a.caseId === caseId)!;
      return {
        caseId,
        cardName: adj.cardName,
        oldLabels: adj.oldLabels,
        newLabels: adj.newLabels,
        canonicalOracleEvidence: adj.canonicalOracleEvidence,
        reason: adj.reason,
        parserConsultedForCorrection: adj.parserConsultedForCorrection,
        before,
        after,
        delta: { tp: after.tp - before.tp, fp: after.fp - before.fp, fn: after.fn - before.fn },
      };
    }),
    remainingUnexplainedMismatches: rescoreRows.filter((r) => r.fn > 0 || r.fp > 0).length,
  };

  const outPath = resolve(
    process.cwd(),
    "data/milestones/rc2-development-planning/check-v4-gold-corrected-score-v129.json",
  );
  writeFileSync(outPath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  const adjudicationHash = createHash("sha256")
    .update(readFileSync(ADJUDICATION_PATH, "utf8"))
    .digest("hex");

  console.log(
    JSON.stringify(
      {
        adjudicationHash,
        originalSavedExecution: provenance.originalSavedExecution,
        v129Diagnostic: provenance.v129Diagnostic,
        goldCorrectedDiagnostic: provenance.goldCorrectedDiagnostic,
        remainingUnexplainedMismatches: provenance.remainingUnexplainedMismatches,
      },
      null,
      2,
    ),
  );
}

main();
