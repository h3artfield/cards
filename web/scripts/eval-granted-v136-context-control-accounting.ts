/**
 * Three-level context-control accounting: detector, router (conditional), end-to-end disposition.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { loadEnvLocal } from "./lib/script-env";
import { CONTEXT_CONTROL_ROUTING_GOLD } from "./lib/benchmark-semantic-adjudication";
import { collectPipelineObservations, spansOverlap } from "./lib/granted-pipeline-instrumentation";

loadEnvLocal();

type ControlCase = {
  id: string;
  cardName?: string;
  oracleText: string;
  oracleId: string;
  expectedContext: string;
  expansionLabel: string;
  contextControlKind?: string;
  contextRoutingGold?: (typeof CONTEXT_CONTROL_ROUTING_GOLD)[string];
  benchmarkTargets: Array<{ fullRegionSpan?: { start: number; end: number; text: string } }>;
};

function inferControlKind(c: ControlCase): string | undefined {
  if (c.contextControlKind) return c.contextControlKind;
  if (c.contextRoutingGold) {
    return Object.entries(CONTEXT_CONTROL_ROUTING_GOLD).find(
      ([, g]) => g.expectedContext === c.expectedContext,
    )?.[0];
  }
  if (c.id.includes("025")) return "token_definition";
  if (c.id.includes("026")) return "source_owned_reference";
  if (c.id.includes("027")) return "created_object_capability";
  if (c.id.includes("028")) return "reminder_only";
  if (c.id.includes("029")) return "hard_negative_surface";
  return undefined;
}

function evaluateControl(c: ControlCase) {
  const kind = inferControlKind(c);
  const gold = kind ? CONTEXT_CONTROL_ROUTING_GOLD[kind] : undefined;
  const goldSpan = c.benchmarkTargets[0]?.fullRegionSpan;
  const { candidates, routed } = collectPipelineObservations(c.oracleText, c.oracleId);

  const overlappingCandidates = goldSpan
    ? candidates.filter((can) =>
        spansOverlap({ start: can.cardStart, end: can.cardEnd }, goldSpan),
      )
    : [];
  const candidateProduced = overlappingCandidates.length > 0;
  const candidateExpected = gold?.candidateExpected ?? false;

  const detectorPass = candidateExpected ? candidateProduced : !candidateProduced || overlappingCandidates.length === 0;

  const grantedRoutes = routed.filter((r) => r.contextKind === "granted_rules");
  const spuriousGrantedRules = goldSpan
    ? grantedRoutes.filter(
        (r) => !spansOverlap({ start: r.cardStart, end: r.cardEnd }, goldSpan) || gold?.expectedGrantedRegionCount === 0,
      )
    : grantedRoutes;

  const routesInGold = goldSpan
    ? routed.filter((r) => spansOverlap({ start: r.cardStart, end: r.cardEnd }, goldSpan))
    : routed;

  const routerEvaluated = routesInGold.length > 0;
  const actualRouterClass = routerEvaluated ? routesInGold[0]!.contextKind : null;
  const expectedRouterClass = gold?.routerContext ?? null;
  const routerPass =
    !routerEvaluated || (expectedRouterClass !== null && actualRouterClass === expectedRouterClass);

  const grantedRegionCount = grantedRoutes.filter((r) => r.classification === "granted_rules_ability").length;
  const expectedGrantedCount = gold?.expectedGrantedRegionCount ?? 0;
  const noSpuriousGrant = grantedRegionCount <= expectedGrantedCount;

  const finalSemanticDispositionCorrect =
    detectorPass &&
    routerPass &&
    noSpuriousGrant &&
    (expectedGrantedCount === 0 ? grantedRegionCount === 0 : grantedRegionCount === expectedGrantedCount);

  const primaryRoute = routesInGold[0];
  return {
    caseId: c.id,
    cardName: c.cardName,
    semanticGoldContext: gold?.expectedContext ?? c.expectedContext,
    expectedSemanticOwner: gold?.expectedSemanticOwner ?? null,
    detectorLevel: {
      candidateExpected,
      candidateProduced,
      overlappingCandidateCount: overlappingCandidates.length,
      result: detectorPass ? "PASS" : "FAIL",
    },
    routerLevel: {
      evaluated: routerEvaluated,
      conditionalOnCandidate: routerEvaluated,
      expectedRouterClass,
      actualRouterClass,
      result: routerEvaluated ? (routerPass ? "PASS" : "FAIL") : "N/A",
    },
    endToEndSemanticDisposition: {
      expectedGrantedRegionCount: expectedGrantedCount,
      actualGrantedRulesClassifiedCount: grantedRegionCount,
      spuriousGrantedRulesCount: spuriousGrantedRules.length,
      finalSemanticDispositionCorrect,
      result: finalSemanticDispositionCorrect ? "PASS" : "FAIL",
    },
    incubatorDiagnosis:
      c.id === "granted-exp-v136-027" && primaryRoute
        ? {
            candidateSpan: c.oracleText.slice(primaryRoute.cardStart, primaryRoute.cardEnd),
            recipient: "It (newly created token)",
            grantingVerb: "has",
            complement: primaryRoute.innerText,
            semanticOwnerInferred: primaryRoute.contextKind === "token_definition" ? "created_object" : "granted_object",
            actualRouterClass: primaryRoute.contextKind,
            structuralCue: primaryRoute.structuralCue,
            whyRouterChose:
              primaryRoute.contextKind === "token_definition"
                ? "create-token + It-has quote bound to newly_created_object → token_definition"
                : "it_has structural cue without created-object ownership gate",
          }
        : undefined,
  };
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const cases = (
    JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")) as {
      cases: ControlCase[];
    }
  ).cases.filter((c) => c.expansionLabel === "context_control" || c.expansionLabel === "hard_negative_surface");

  const rows = cases.map(evaluateControl);
  const passCount = rows.filter((r) => r.endToEndSemanticDisposition.result === "PASS").length;

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v136-context-control-three-level-accounting",
    summary: `${passCount}/${rows.length} end-to-end semantic disposition PASS`,
    rows,
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-context-control-accounting.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ summary: report.summary, rows }, null, 2));
}

main();
