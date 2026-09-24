/**
 * Single authorized v136 transfer evaluation — parserExecutionCount 0 → 1.
 * No parser edits between freeze and this run.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  routeCandidateRegions,
  filterGrantedRulesRoutes,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { buildGrantedRulesRegions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-region";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";
import { loadEnvLocal } from "./lib/script-env";
import type { MachineGroundedBenchmarkTarget } from "./lib/benchmark-identity";
import { CONTEXT_CONTROL_ROUTING_GOLD } from "./lib/benchmark-semantic-adjudication";

loadEnvLocal();

type Case = {
  id: string;
  oracleId: string;
  oracleText: string;
  cardName?: string;
  grammarFamily?: string;
  expectedContext: string;
  expansionLabel: string;
  benchmarkTargets: MachineGroundedBenchmarkTarget[];
  contextRoutingGold?: (typeof CONTEXT_CONTROL_ROUTING_GOLD)[string];
};

function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

function loadCases(path: string): Case[] {
  return (JSON.parse(readFileSync(resolve(path), "utf8")) as { cases: Case[] }).cases;
}

function detectRegions(oracleText: string, oracleId: string) {
  const regions: Array<{ context: string; start: number; end: number; classified?: string }> = [];
  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      for (const route of routeCandidateRegions(ability.paragraphText, ability.abilityId)) {
        let classified: string | undefined;
        if (route.contextKind === "granted_rules") {
          const built = buildGrantedRulesRegions(ability.paragraphText, [route.span], [], ability.abilityId);
          classified =
            built[0]?.classification ?? classifyGrantedRulesSpan(ability.paragraphText, route.span).classification;
        }
        regions.push({
          context: route.contextKind,
          start: ability.paragraphStart + route.span.localStart,
          end: ability.paragraphStart + route.span.localEnd,
          classified,
        });
      }
    }
  }
  return regions;
}

function main() {
  const freeze = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/granted-v136-parser-state-freeze.json"), "utf8"),
  );
  if (freeze.parserExecutionCount !== 0) {
    throw new Error("Parser state freeze requires parserExecutionCount=0 before first run");
  }

  resetRC3PromotedFamiliesToDefault();
  const expansion = loadCases("data/oracle-action-eval-granted-classifier-expansion-v136.json");
  const negatives = loadCases("data/oracle-action-eval-granted-negative-controls-v135.json");
  const allCases = [...expansion, ...negatives];

  const ledger: Array<Record<string, unknown>> = [];
  let stageA_tp = 0;
  let stageA_fp = 0;
  let stageA_fn = 0;
  let stageB_tp = 0;
  let stageB_fp = 0;
  let stageB_fn = 0;
  let stageC_tp = 0;
  let stageC_fp = 0;
  let stageC_fn = 0;
  let stageC_pool = 0;

  const routerMatrix: Record<string, { tp: number; fp: number; fn: number }> = {};
  const familyStats: Record<string, { expected: number; tp: number; fn: number; fp: number }> = {};

  for (const tc of expansion) {
    const detected = detectRegions(tc.oracleText, tc.oracleId);
    const goldTargets = tc.benchmarkTargets.filter((t) => t.expectedContext === "genuine_granted");

    for (const gold of goldTargets) {
      const full = gold.fullRegionSpan!;
      stageC_pool += gold.semanticAdjudication?.layer2Gold.length ?? 0;
      const match = detected.find(
        (d) => d.context === "granted_rules" && spansOverlap({ start: d.start, end: d.end }, full),
      );
      const stageA = match ? "tp" : "fn";
      const stageB =
        match && match.classified === "granted_rules_ability" ? "tp" : match ? "fn" : "fn";
      if (stageA === "tp") stageA_tp++;
      else stageA_fn++;
      if (stageB === "tp") stageB_tp++;
      else stageB_fn++;

      const fam = gold.grammarFamily ?? tc.grammarFamily ?? "unknown";
      familyStats[fam] = familyStats[fam] ?? { expected: 0, tp: 0, fn: 0, fp: 0 };
      familyStats[fam].expected++;
      if (stageA === "tp") familyStats[fam].tp++;
      else familyStats[fam].fn++;

      for (const l2 of gold.semanticAdjudication?.layer2Gold ?? []) {
        const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
        const hit = parse.actions.some(
          (a) =>
            a.reviewStatus === "accepted" &&
            a.actionType === l2.actionType &&
            a.provenance.actionSpan.text.toLowerCase().includes(l2.evidenceContains.toLowerCase().slice(0, 12)),
        );
        if (hit) stageC_tp++;
        else stageC_fn++;
      }

      ledger.push({
        caseId: tc.id,
        cardName: tc.cardName,
        grammarFamily: fam,
        goldRegionSpan: full,
        detectedContext: match?.context ?? null,
        stageA,
        stageB,
        layer2Gold: gold.semanticAdjudication?.layer2Gold ?? [],
      });
    }

    for (const det of detected.filter((d) => d.context === "granted_rules")) {
      const matched = goldTargets.some((g) => g.fullRegionSpan && spansOverlap(g.fullRegionSpan, { start: det.start, end: det.end }));
      if (!matched) {
        stageA_fp++;
        stageB_fp += det.classified === "granted_rules_ability" ? 1 : 0;
        const fam = tc.grammarFamily ?? "unknown";
        familyStats[fam] = familyStats[fam] ?? { expected: 0, tp: 0, fn: 0, fp: 0 };
        familyStats[fam].fp++;
      }
    }

    if (tc.contextRoutingGold) {
      const rg = tc.contextRoutingGold;
      const key = rg.routerContext;
      routerMatrix[key] = routerMatrix[key] ?? { tp: 0, fp: 0, fn: 0 };
      const detCtx = detected.map((d) => d.context);
      const hit = detCtx.includes(key) || (key === "card_native" && detCtx.includes("other"));
      if (hit) routerMatrix[key].tp++;
      else routerMatrix[key].fn++;
    }
  }

  let negFp = 0;
  for (const tc of negatives) {
    negFp += detectRegions(tc.oracleText, tc.oracleId).filter((d) => d.context === "granted_rules").length;
  }

  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v136-transfer-evaluation-run-1",
    parserExecutionCount: 1,
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    frozenFrom: freeze,
    stageA: { expectedRegions: stageA_tp + stageA_fn, ...metricsFromCounts(stageA_tp, stageA_fp, stageA_fn) },
    stageB: { expectedRegions: stageB_tp + stageB_fn, ...metricsFromCounts(stageB_tp, stageB_fp, stageB_fn) },
    stageC: {
      nestedLayer2Denominator: stageC_pool,
      ...metricsFromCounts(stageC_tp, stageC_fp, stageC_fn),
    },
    semanticContextRouter: routerMatrix,
    negativeControls: { caseCount: negatives.length, grantedRegionFp: negFp },
    byGrammarFamily: familyStats,
    regionLedger: ledger,
    note: "Separate from v1.34/v1.35 dev union metrics — transfer-only measurement",
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(resolve("data/milestones/rc3-development/granted-v136-transfer-run-1-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const env = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8"));
  env.parserExecutionCount = 1;
  writeFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), `${JSON.stringify(env, null, 2)}\n`);

  console.log(JSON.stringify({ parserExecutionCount: 1, stageA: report.stageA, stageB: report.stageB, stageC: report.stageC, byGrammarFamily: report.byGrammarFamily }, null, 2));
}

main();
