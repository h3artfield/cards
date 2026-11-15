/**
 * Parser-blind re-adjudication of Eldrazi Scion add_mana gold + vh15-0009 draw.
 */
import { readFileSync } from "node:fs";
import { validateGoldAction } from "./lib/gold-policy-validator-v1";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v15.json", "utf8")) as {
  cases: OracleActionEvalCaseV2[];
};

function auditCase(id: string) {
  const tc = bench.cases.find((c) => c.id === id)!;
  console.log(JSON.stringify({ id, cardName: tc.cardName, oracleText: tc.oracleText, caseScope: tc.caseScope, benchmarkTargets: tc.benchmarkTargets }, null, 2));
  for (const g of tc.expectedPrimitiveActions.filter((x) => !x.negative)) {
    const sem = enrichGoldAction(tc, g);
    const v = validateGoldAction(tc, g);
    console.log(
      JSON.stringify(
        {
          actionType: g.actionType,
          evidenceContains: g.evidenceContains,
          storedSemanticJustification: g.semanticJustification,
          liveEnrichment: {
            clauseRole: sem.clauseRole,
            abilityType: sem.abilityType,
            executionContext: sem.executionContext,
            semanticOwner: sem.semanticOwner,
            cardNativeLayer2Eligible: sem.cardNativeLayer2Eligible,
            inReminderSpan: sem.inReminderSpan,
            inTypeLineMechanicReminder: sem.inTypeLineMechanicReminder,
            inCreatedObjectDefinition: sem.inCreatedObjectDefinition,
            inCostRegion: sem.inCostRegion,
            inTriggerEventHeader: sem.inTriggerEventHeader,
            evidenceSpan: sem.evidenceSpan,
          },
          policyViolations: v,
        },
        null,
        2,
      ),
    );
  }
}

for (const id of ["vh15-0001", "vh15-0002", "vh15-0003", "vh15-0004", "vh15-0005", "vh15-0006", "vh15-0007", "vh15-0008", "vh15-0009"]) {
  auditCase(id);
}
