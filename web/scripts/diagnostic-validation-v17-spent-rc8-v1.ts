/**
 * RC8 spent v17 diagnostic — not a release gate; compare against v17 forensic genuine surface.
 * Run: cd web && npx tsx scripts/diagnostic-validation-v17-spent-rc8-v1.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  countAcceptedActionOutsideOwnerSpan,
  verifySemanticParseIntegrity,
} from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { countActivatedCostLayer2Leakage } from "./lib/activated-cost-leakage";
import { scanAcceptedReminderDerivedLayer2 } from "./lib/reminder-derived-leakage-v1";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";

const OUT_DIR = "data/milestones/rc8-development";
const OUT_PATH = `${OUT_DIR}/validation-v17-spent-rc8-diagnostic-v1.json`;
const FORENSIC_PATH = "data/milestones/validation-v17-certification/validation-v17-root-cause-ledger-v1.json";

function main() {
  const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const forensic = JSON.parse(readFileSync(FORENSIC_PATH, "utf8")) as {
    ledger: Array<{ caseId: string; mismatchKind: string; primaryMechanism: string }>;
  };
  const genuineParserRows = forensic.ledger;

  const rows = bench.cases.map((tc) => {
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    return { tc, parse, eval: evaluateCaseSemantic(tc, parse) };
  });

  const accepted = sumSemanticMetrics(rows.map((r) => r.eval));
  let semanticInvalid = 0;
  let idViolations = 0;
  let provenanceViolations = 0;
  let acceptedActionOutsideOwnerSpanCount = 0;
  let acceptedReminderDerivedLayer2Count = 0;
  let forbiddenEmissionCount = 0;

  const recoveredGenuineFn: string[] = [];
  const remainingGenuineFn: string[] = [];
  let genuineFpStatus = "unchanged";

  for (const row of rows) {
    const { tc, parse, eval: ev } = row;
    semanticInvalid += parse.semanticValidation.invalidCount;
    const integrity = verifySemanticParseIntegrity(parse, tc.oracleText);
    idViolations += integrity.idViolations.length;
    provenanceViolations += integrity.provenanceViolations.length;
    acceptedActionOutsideOwnerSpanCount += countAcceptedActionOutsideOwnerSpan(parse);
    acceptedReminderDerivedLayer2Count += scanAcceptedReminderDerivedLayer2([
      { oracleText: tc.oracleText, actions: parse.actions },
    ]).acceptedReminderDerivedLayer2Count;

    for (const action of parse.actions.filter((a) => a.reviewStatus === "accepted")) {
      if (
        isForbiddenPolicyLeak({
          testCase: tc,
          actionType: action.actionType,
          cardStart: action.provenance.actionSpan.cardStart,
          cardEnd: action.provenance.actionSpan.cardEnd,
        })
      ) {
        forbiddenEmissionCount++;
      }
    }

    const genuineFnRows = genuineParserRows.filter((g) => g.caseId === tc.id && g.mismatchKind === "FN");
    if (genuineFnRows.length === 0) continue;
    if (ev.accepted.fn === 0 && ev.accepted.fp === 0) recoveredGenuineFn.push(tc.id);
    else if (ev.accepted.fn > 0 || ev.accepted.fp > 0) remainingGenuineFn.push(tc.id);
  }

  const fpRow = genuineParserRows.find((g) => g.mismatchKind === "FP");
  if (fpRow) {
    const fpCase = rows.find((r) => r.tc.id === fpRow.caseId);
    genuineFpStatus = fpCase && fpCase.eval.accepted.fp > 0 ? "still_present" : "resolved_or_demoted";
  }

  const report = {
    artifactType: "ValidationSpentDiagnostic",
    version: "validation-v17-spent-rc8-diagnostic-v1",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    officialV17Preserved: { tp: 232, fp: 7, fn: 33, verdict: "FAIL/SPENT" },
    rc8DiagnosticAccepted: accepted,
    invariants: {
      semanticInvalid,
      validatorViolations: semanticInvalid,
      idViolations,
      provenanceViolations,
      acceptedActionOutsideOwnerSpanCount,
      acceptedReminderDerivedLayer2Count,
      forbiddenEmissionCount,
      allGreen:
        semanticInvalid === 0 &&
        idViolations === 0 &&
        provenanceViolations === 0 &&
        acceptedActionOutsideOwnerSpanCount === 0 &&
        acceptedReminderDerivedLayer2Count === 0 &&
        forbiddenEmissionCount === 0,
    },
    genuineSurface: {
      recoveredGenuineFn: [...new Set(recoveredGenuineFn)],
      remainingGenuineFn: [...new Set(remainingGenuineFn)],
      genuineFpCaseId: fpRow?.caseId ?? null,
      genuineFpStatus,
    },
    note: "Diagnostic only — not a release gate. Official v17 232/7/33 remains preserved.",
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
