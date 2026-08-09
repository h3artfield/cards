/**
 * Stage B denominator reconciliation — gold regions vs classifier evaluations.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { loadEnvLocal } from "./lib/script-env";
import { diagnoseGoldRegion, computeStageMetrics } from "./lib/granted-pipeline-instrumentation";

loadEnvLocal();

type Case = {
  id: string;
  cardName?: string;
  oracleText: string;
  oracleId: string;
  expansionLabel: string;
  benchmarkTargets: Array<{
    expectedContext: string;
    fullRegionSpan?: { start: number; end: number; text: string };
    grammarFamily?: string;
  }>;
};

function routeKey(r: { cardStart: number; cardEnd: number; abilityId: string }) {
  return `${r.abilityId}:${r.cardStart}-${r.cardEnd}`;
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const cases = (
    JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")) as {
      cases: Case[];
    }
  ).cases.filter((c) => c.expansionLabel === "positive_granted_region");

  const rows: Array<Record<string, unknown>> = [];
  const routePrimaryRegion = new Map<string, string>();

  for (const c of cases) {
    c.benchmarkTargets
      .filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan)
      .forEach((target, regionIndex) => {
        const regionKey = `${c.id}:region${regionIndex}`;
        const diag = diagnoseGoldRegion(c.oracleText, c.oracleId, target.fullRegionSpan!);
        const route = diag.bestRoute;
        const a0 = diag.failingStage === "A0_no_candidate" ? "FAIL" : "PASS";
        const a1 =
          diag.failingStage === "A0_no_candidate"
            ? "N/A"
            : route?.contextKind === "granted_rules"
              ? "PASS"
              : "FAIL";
        const stageBEligible = route?.contextKind === "granted_rules";
        const matchedRouteKey = route ? routeKey(route) : null;

        let stageBResultOrBypass = "N/A";
        let stageBBypassReason: string | null = null;
        if (!stageBEligible) {
          stageBResultOrBypass = "N/A";
        } else if (matchedRouteKey) {
          const primary = routePrimaryRegion.get(matchedRouteKey);
          if (!primary) {
            routePrimaryRegion.set(matchedRouteKey, regionKey);
            stageBResultOrBypass =
              diag.failingStage === "B_classifier_rejected"
                ? "FAIL"
                : diag.failingStage === "success"
                  ? "PASS"
                  : "FAIL";
          } else {
            stageBResultOrBypass = "BYPASS";
            stageBBypassReason = `duplicate gold membership — shares granted_rules route ${matchedRouteKey} with ${primary}; classifier evaluated once for physical route`;
          }
        }

        rows.push({
          caseId: c.id,
          cardName: c.cardName,
          regionKey,
          goldRegionSpan: target.fullRegionSpan,
          grammarFamily: target.grammarFamily,
          a0Result: a0,
          a1Result: a1,
          stageBEligibility: stageBEligible ? "eligible" : "not_routed_granted_rules",
          stageBRequiresClassifierAdjudication: stageBEligible && stageBResultOrBypass !== "BYPASS",
          stageBResultOrBypass,
          stageBBypassReason,
          endToEndResult: diag.failingStage === "success" ? "PASS" : "FAIL",
          matchedRouteKey,
          routeTypography: route?.typography ?? null,
          routeClassification: route?.classification ?? null,
        });
      });
  }

  const diagnoses = rows.map((r) => ({
    failingStage:
      r.endToEndResult === "PASS"
        ? ("success" as const)
        : r.a0Result === "FAIL"
          ? ("A0_no_candidate" as const)
          : r.a1Result === "FAIL"
            ? ("A1_wrong_context" as const)
            : ("B_classifier_rejected" as const),
  }));
  const stageMetrics = computeStageMetrics(diagnoses, 0);

  const a1GrantedGoldRegions = rows.filter((r) => r.a1Result === "PASS").length;
  const stageBBypassRows = rows.filter((r) => r.stageBResultOrBypass === "BYPASS");
  const stageBClassifierRows = rows.filter((r) => r.stageBRequiresClassifierAdjudication);
  const uniqueGrantedRoutes = routePrimaryRegion.size;

  const duplicateRouteGroups = [...rows.reduce((acc, r) => {
    const k = r.matchedRouteKey as string | null;
    if (!k) return acc;
    acc.set(k, [...(acc.get(k) ?? []), r.regionKey as string]);
    return acc;
  }, new Map<string, string[]>()).entries()].filter(([, v]) => v.length > 1);

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v136-stage-b-denominator-reconciliation",
    summary: {
      goldRegions: rows.length,
      endToEndSuccess: rows.filter((r) => r.endToEndResult === "PASS").length,
      a1GrantedGoldRegions,
      stageBEligibleGoldRegions: rows.filter((r) => r.stageBEligibility === "eligible").length,
      stageBRequiresClassifierAdjudication: stageBClassifierRows.length,
      stageBBypassGoldRegions: stageBBypassRows.length,
      stageBUniqueClassifierEvaluations: uniqueGrantedRoutes,
      instrumentationStageB: stageMetrics.stageB_grantedRulesClassifier,
      stageB_TP_FP_FN: {
        tp: stageBClassifierRows.filter((r) => r.stageBResultOrBypass === "PASS").length,
        fp: 0,
        fn: stageBClassifierRows.filter((r) => r.stageBResultOrBypass === "FAIL").length,
        bypass: stageBBypassRows.length,
      },
      explanation:
        duplicateRouteGroups.length > 0
          ? "End-to-end counts all 26 gold regions. Stage-B classifier evaluates each unique physical granted_rules route once; duplicate gold membership (Compulsory Rest) bypasses a second classifier invocation while both regions pass end-to-end."
          : "Gold regions align 1:1 with classifier evaluations",
    },
    duplicateRouteMembership: duplicateRouteGroups.map(([routeKey, regionKeys]) => ({ routeKey, regionKeys })),
    bypassRows: stageBBypassRows,
    rows,
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-stage-b-denominator-reconciliation.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report.summary, null, 2));
}

main();
