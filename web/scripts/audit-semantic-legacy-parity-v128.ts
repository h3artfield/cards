/**
 * Semantic ↔ legacy parity audit across development corpora (v1.28 migration).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { auditSemanticLegacyParity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

async function main() {
  const paths = [
    "data/oracle-action-eval-development-v26.json",
    "data/oracle-action-eval-development-generalization-expansion-v2.json",
    "data/oracle-action-eval-development-generalization-expansion-v3.json",
    "data/oracle-action-eval-development-generalization-expansion-v5.json",
  ];

  const totals = {
    semantic_only: 0,
    legacy_only: 0,
    argument_difference: 0,
    provenance_difference: 0,
    review_status_difference: 0,
  };
  const caseRecords: Array<{ caseId: string; counts: typeof totals }> = [];

  for (const path of paths) {
    const envelope = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
    for (const testCase of envelope.cases) {
      const parsed = parseOracleSemantics({
        oracleId: testCase.oracleId,
        oracleText: testCase.oracleText,
        cardFace: testCase.cardFace,
      });
      const { counts } = auditSemanticLegacyParity({ parse: parsed, legacyActions: parsed.legacy.actions });
      caseRecords.push({ caseId: testCase.id, counts });
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[k] += counts[k];
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    corpora: paths,
    caseCount: caseRecords.length,
    totals,
    casesWithDifferences: caseRecords.filter((c) => Object.values(c.counts).some((n) => n > 0)),
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/semantic-legacy-parity-v128.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ totals, caseCount: report.caseCount, out }, null, 2));
}

main();
