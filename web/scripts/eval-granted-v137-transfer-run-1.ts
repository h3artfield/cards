/**
 * Single authorized v137 nested-grant transfer evaluation — parserExecutionCount 0 → 1.
 * No parser edits between freeze and this run.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { resetRC3PromotedFamiliesToDefault, getRC3PromotedFamilies } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";
import { loadEnvLocal } from "./lib/script-env";
import type { MachineGroundedBenchmarkTarget } from "./lib/benchmark-identity";
import {
  collectRegionLinkedLayer2Records,
  dedupeSemanticGoldActions,
  type SemanticGoldAction,
} from "./lib/granted-unique-layer2-gold";
import { runGrantedDevPrecisionControls } from "./run-granted-dev-precision-controls";

loadEnvLocal();

type Case = {
  id: string;
  oracleId: string;
  oracleText: string;
  cardName?: string;
  grammarFamily?: string;
  category: string;
  caseScope?: string;
  goldCompletenessStatus?: string;
  benchmarkTargets: MachineGroundedBenchmarkTarget[];
};

type MissClass =
  | "nested_ability_block_detection"
  | "activated_segmentation"
  | "cost_effect_boundary"
  | "primitive_extraction"
  | "trigger_effect_boundary"
  | "semantic_ownership"
  | "context"
  | "provenance"
  | "dedupe_source_precedence"
  | "evaluator_gold"
  | "static_layer1"
  | "certified_empty_layer2";

function spansOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function inspectNestedGrantStructure(oracleText: string, oracleId: string, goldTarget: MachineGroundedBenchmarkTarget) {
  const adj = goldTarget.semanticAdjudication!;
  const abilityType = adj.layer1Structure.abilityType;
  const blocks: Array<Record<string, unknown>> = [];

  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      for (const ctx of findGrantedQuoteContexts(ability.paragraphText, ability.abilityId)) {
        const nestedParagraphStart = ability.paragraphStart + ctx.innerLocalStart;
        const block = parseAbilityBlock({
          abilityId: ctx.grantedAbilityId,
          paragraphText: ctx.innerText,
          paragraphStart: nestedParagraphStart,
          hostAbilityType: ability.abilityType,
        });

        const costGold = adj.layer1Structure.costRegion;
        const costMatch =
          !costGold ||
          (block.costRegion &&
            normalizeText(block.costRegion.text) === normalizeText(costGold.text) &&
            nestedParagraphStart + block.costRegion.localStart === costGold.start);

        const effectGold = adj.layer2Gold[0]?.evidenceContains;
        const effectMatch =
          abilityType === "static"
            ? block.clauses.length >= 0
            : block.effectRegion &&
              (!effectGold || block.effectRegion.text.toLowerCase().includes(effectGold.toLowerCase().slice(0, 12)));

        blocks.push({
          grantedAbilityId: ctx.grantedAbilityId,
          innerText: ctx.innerText,
          abilityBlockDetected: true,
          abilityType: block.abilityType,
          activatedColonSegmented: !!(block.costRegion && block.effectRegion),
          costRegion: block.costRegion
            ? {
                text: block.costRegion.text,
                cardLevelStart: nestedParagraphStart + block.costRegion.localStart,
                cardLevelEnd: nestedParagraphStart + block.costRegion.localEnd,
                matchesGold: costMatch,
              }
            : null,
          effectRegion: block.effectRegion
            ? {
                text: block.effectRegion.text,
                cardLevelStart: nestedParagraphStart + block.effectRegion.localStart,
                cardLevelEnd: nestedParagraphStart + block.effectRegion.localEnd,
                matchesGold: effectMatch,
              }
            : null,
          triggerRegion:
            abilityType === "triggered" && adj.layer1Structure.triggerRegion
              ? {
                  gold: adj.layer1Structure.triggerRegion.text,
                  inBlock: block.clauses.some((c) => c.role === "trigger_event"),
                }
              : null,
        });
      }
    }
  }

  const clauseNative = extractClauseNativeActions({ oracleId, oracleText });
  const grantedActions = clauseNative.actions.filter(
    (a) => (a as { executionContext?: string }).executionContext === "granted_ability",
  );

  return {
    abilityBlocks: blocks,
    abilityBlockDetected: blocks.length > 0,
    clauseNativeGrantedActionCount: grantedActions.length,
  };
}

function classifyMiss(input: {
  kind: "fn" | "fp" | "static_fail";
  abilityType: string;
  structural: ReturnType<typeof inspectNestedGrantStructure>;
  parse: ReturnType<typeof parseOracleSemanticsRC3>;
  gold: SemanticGoldAction | null;
  goldTarget: MachineGroundedBenchmarkTarget;
}): MissClass {
  const { structural, parse, gold, goldTarget, abilityType } = input;
  const adj = goldTarget.semanticAdjudication!;

  if (input.kind === "static_fail") {
    if (!structural.abilityBlockDetected) return "nested_ability_block_detection";
    const spuriousL2 = parse.actions.filter(
      (a) =>
        a.reviewStatus === "accepted" &&
        a.executionContext === "granted_ability" &&
        goldTarget.fullRegionSpan &&
        spansOverlap(a.provenance.actionSpan, goldTarget.fullRegionSpan),
    );
    if (spuriousL2.length > 0) return "certified_empty_layer2";
    return "static_layer1";
  }

  if (!structural.abilityBlockDetected) return "nested_ability_block_detection";
  if (abilityType === "activated" && !structural.abilityBlocks.some((b) => b.activatedColonSegmented)) {
    return "activated_segmentation";
  }
  if (abilityType === "activated" && structural.abilityBlocks.some((b) => b.costRegion && !(b.costRegion as { matchesGold: boolean }).matchesGold)) {
    return "cost_effect_boundary";
  }
  if (abilityType === "triggered") {
    const triggerLeak = parse.actions.some(
      (a) =>
        a.reviewStatus === "accepted" &&
        a.executionContext === "granted_ability" &&
        adj.layer1Structure.triggerRegion &&
        spansOverlap(a.provenance.actionSpan, adj.layer1Structure.triggerRegion) &&
        !adj.layer2Gold.some((l2) => a.actionType === l2.actionType),
    );
    if (triggerLeak) return "trigger_effect_boundary";
  }

  const emitted = parse.actions.filter(
    (a) => a.reviewStatus === "accepted" && (!gold || a.actionType === gold.actionType),
  );
  if (emitted.some((a) => a.semanticOwner !== "granted_object")) return "semantic_ownership";
  if (emitted.some((a) => a.executionContext !== "granted_ability")) return "context";
  if (
    gold &&
    !emitted.some(
      (a) =>
        a.actionType === gold.actionType &&
        a.provenance.actionSpan.text.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12)),
    )
  ) {
    const costLeak = parse.actions.some(
      (a) =>
        a.reviewStatus === "accepted" &&
        ["discard", "sacrifice", "tap"].includes(a.actionType) &&
        adj.layer1Structure.costRegion &&
        spansOverlap(a.provenance.actionSpan, adj.layer1Structure.costRegion) &&
        (a as { executionContext?: string }).executionContext !== "activated_cost",
    );
    if (costLeak) return "cost_effect_boundary";
    return "primitive_extraction";
  }
  if (input.kind === "fp") return "dedupe_source_precedence";
  return "evaluator_gold";
}

function evaluateUniqueL2(
  gold: SemanticGoldAction,
  oracleText: string,
  oracleId: string,
): { result: "TP" | "FN"; emitted: unknown[] } {
  const parse = parseOracleSemanticsRC3({ oracleId, oracleText });
  const hit = parse.actions.some(
    (a) =>
      a.reviewStatus === "accepted" &&
      a.actionType === gold.actionType &&
      a.executionContext === "granted_ability" &&
      a.semanticOwner === "granted_object" &&
      a.provenance.actionSpan.text.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12)),
  );
  return {
    result: hit ? "TP" : "FN",
    emitted: parse.actions
      .filter((a) => a.reviewStatus === "accepted" && a.executionContext === "granted_ability")
      .map((a) => ({
        actionType: a.actionType,
        text: a.provenance.actionSpan.text,
        executionContext: a.executionContext,
        semanticOwner: a.semanticOwner,
        provenanceStart: a.provenance.actionSpan.start,
      })),
  };
}

function main() {
  const freeze = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/granted-v137-parser-state-freeze.json"), "utf8"),
  );
  if (freeze.parserExecutionCount !== 0) {
    throw new Error("Parser state freeze requires parserExecutionCount=0 before first run");
  }
  if (freeze.parserVersion !== ORACLE_ACTION_RC3_PARSER_VERSION) {
    throw new Error(`Parser version mismatch: freeze=${freeze.parserVersion} current=${ORACLE_ACTION_RC3_PARSER_VERSION}`);
  }

  resetRC3PromotedFamiliesToDefault();
  const envelope = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-nested-stage-c-v137.json"), "utf8"));
  const cases: Case[] = envelope.cases;

  const rawRecords = collectRegionLinkedLayer2Records(cases);
  const { uniqueSemanticActions } = dedupeSemanticGoldActions(rawRecords);

  let tp = 0;
  let fn = 0;
  let fp = 0;
  const missLedger: Array<Record<string, unknown>> = [];
  const caseReports: Array<Record<string, unknown>> = [];

  const familyBuckets: Record<string, { tp: number; fp: number; fn: number; pool: number }> = {
    activated: { tp: 0, fp: 0, fn: 0, pool: 0 },
    triggered: { tp: 0, fp: 0, fn: 0, pool: 0 },
    static: { tp: 0, fp: 0, fn: 0, pool: 0 },
  };

  for (const tc of cases) {
    const goldTarget = tc.benchmarkTargets[0]!;
    const adj = goldTarget.semanticAdjudication!;
    const abilityType = adj.layer1Structure.abilityType;
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
    const structural = inspectNestedGrantStructure(tc.oracleText, tc.oracleId, goldTarget);

    const layer1Costs = parse.actions.filter(
      (a) =>
        a.reviewStatus === "accepted" &&
        adj.layer1Structure.costRegion &&
        spansOverlap(a.provenance.actionSpan, adj.layer1Structure.costRegion),
    );
    const layer2InGrant = parse.actions.filter(
      (a) =>
        a.reviewStatus === "accepted" &&
        a.executionContext === "granted_ability" &&
        goldTarget.fullRegionSpan &&
        spansOverlap(a.provenance.actionSpan, goldTarget.fullRegionSpan),
    );

    let caseResult: "pass" | "fail" = "pass";
    const caseMisses: MissClass[] = [];

    if (adj.certifiedEmptyLayer2) {
      familyBuckets.static!.pool++;
      const spuriousL2 = layer2InGrant.filter((a) => !adj.layer2Gold.some((g) => g.actionType === a.actionType));
      if (spuriousL2.length > 0) {
        familyBuckets.static!.fn++;
        fn++;
        caseResult = "fail";
        const missClass = classifyMiss({
          kind: "static_fail",
          abilityType,
          structural,
          parse,
          gold: null,
          goldTarget,
        });
        caseMisses.push(missClass);
        missLedger.push({
          caseId: tc.id,
          cardName: tc.cardName,
          abilityFamily: "static",
          missClass,
          expected: "certifiedEmptyLayer2=true, Layer-1 static recognized",
          observed: spuriousL2.map((a) => a.actionType),
        });
      } else if (structural.abilityBlockDetected || abilityType === "static") {
        familyBuckets.static!.tp++;
        tp++;
      } else {
        familyBuckets.static!.fn++;
        fn++;
        caseResult = "fail";
        caseMisses.push("static_layer1");
        missLedger.push({
          caseId: tc.id,
          cardName: tc.cardName,
          abilityFamily: "static",
          missClass: "static_layer1",
          expected: "static grant recognized",
          observed: "no ability block",
        });
      }
    } else {
      const bucket = abilityType === "triggered" ? "triggered" : "activated";
      familyBuckets[bucket]!.pool += adj.layer2Gold.length;

      for (const l2 of adj.layer2Gold) {
        const hit = parse.actions.some(
          (a) =>
            a.reviewStatus === "accepted" &&
            a.actionType === l2.actionType &&
            a.executionContext === "granted_ability" &&
            a.provenance.actionSpan.text.toLowerCase().includes(l2.evidenceContains.toLowerCase().slice(0, 12)),
        );
        if (hit) {
          tp++;
          familyBuckets[bucket]!.tp++;
        } else {
          fn++;
          familyBuckets[bucket]!.fn++;
          caseResult = "fail";
          const missClass = classifyMiss({
            kind: "fn",
            abilityType,
            structural,
            parse,
            gold: uniqueSemanticActions.find(
              (u) => u.caseId === tc.id && u.actionType === l2.actionType,
            ) ?? null,
            goldTarget,
          });
          caseMisses.push(missClass);
          missLedger.push({
            caseId: tc.id,
            cardName: tc.cardName,
            abilityFamily: bucket,
            missClass,
            expected: `${l2.actionType}: ${l2.evidenceContains}`,
            observed: layer2InGrant.map((a) => `${a.actionType}:${a.provenance.actionSpan.text.slice(0, 40)}`),
          });
        }
      }

      for (const action of layer2InGrant) {
        const expected = adj.layer2Gold.some(
          (g) =>
            g.actionType === action.actionType &&
            action.provenance.actionSpan.text.toLowerCase().includes(g.evidenceContains.toLowerCase().slice(0, 12)),
        );
        if (!expected) {
          fp++;
          familyBuckets[bucket]!.fp++;
          caseResult = "fail";
          const missClass = classifyMiss({
            kind: "fp",
            abilityType,
            structural,
            parse,
            gold: null,
            goldTarget,
          });
          caseMisses.push(missClass);
          missLedger.push({
            caseId: tc.id,
            cardName: tc.cardName,
            abilityFamily: bucket,
            missClass,
            expected: "no spurious L2",
            observed: `${action.actionType}:${action.provenance.actionSpan.text}`,
          });
        }
      }
    }

    const costLeak =
      abilityType === "activated" &&
      parse.actions.some(
        (a) =>
          a.reviewStatus === "accepted" &&
          ["discard", "sacrifice", "tap", "exile"].includes(a.actionType) &&
          adj.layer1Structure.costRegion &&
          spansOverlap(a.provenance.actionSpan, adj.layer1Structure.costRegion) &&
          a.executionContext !== "activated_cost" &&
          !adj.layer2Gold.some((g) => g.actionType === a.actionType),
      );

    caseReports.push({
      caseId: tc.id,
      cardName: tc.cardName,
      category: tc.category,
      caseScope: tc.caseScope,
      goldCompletenessStatus: tc.goldCompletenessStatus,
      abilityFamily: abilityType,
      certifiedEmptyLayer2: adj.certifiedEmptyLayer2,
      caseResult,
      caseMisses,
      structural: {
        ...structural,
        costEffectSegmentationOk: !costLeak,
        layer1CostActions: layer1Costs.map((a) => ({
          actionType: a.actionType,
          executionContext: a.executionContext,
          text: a.provenance.actionSpan.text,
        })),
        layer2Actions: layer2InGrant.map((a) => ({
          actionType: a.actionType,
          executionContext: a.executionContext,
          semanticOwner: a.semanticOwner,
          provenanceStart: a.provenance.actionSpan.start,
          provenanceText: a.provenance.actionSpan.text,
        })),
      },
    });
  }

  const uniqueEvalRows = uniqueSemanticActions.map((gold) => {
    const c = cases.find((x) => x.oracleId === gold.oracleId)!;
    const { result, emitted } = evaluateUniqueL2(gold, c.oracleText, c.oracleId);
    return { ...gold, result, emitted };
  });
  const uniqueTp = uniqueEvalRows.filter((r) => r.result === "TP").length;
  const uniqueFn = uniqueEvalRows.filter((r) => r.result === "FN").length;

  const precision = runGrantedDevPrecisionControls();
  const stageCUnique = execSync("npx --yes tsx scripts/eval-granted-v136-stage-c-unique.ts", {
    cwd: resolve("."),
    encoding: "utf8",
  });
  const stageCMetrics = JSON.parse(stageCUnique.trim());

  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v137-transfer-evaluation-run-1",
    parserExecutionCount: 1,
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    frozenFrom: freeze,
    promotedFamilies: getRC3PromotedFamilies(),
    uniqueLayer2Gold: {
      count: uniqueSemanticActions.length,
      rawRegionLinkedRecords: rawRecords.length,
      ...metricsFromCounts(uniqueTp, fp, uniqueFn),
      rows: uniqueEvalRows,
    },
    regionLinkedLayer2: metricsFromCounts(tp, fp, fn),
    byAbilityFamily: Object.fromEntries(
      Object.entries(familyBuckets).map(([fam, b]) => [fam, { ...b, ...metricsFromCounts(b.tp, b.fp, b.fn) }]),
    ),
    invariants: {
      activatedCostLayer2Leakage: precision.invariants.activatedCostLayer2Leakage,
      permissionLeakage: precision.invariants.permissionLeakage,
      tokenDefinitionCardNativeLeakage: precision.invariants.tokenDefinitionCardNativeLeakage,
      tokenCopyPrimitiveLeakage: precision.invariants.tokenCopyPrimitiveLeakage,
      semanticInvalidActionCount: precision.invariants.semanticInvalidActionCount,
      semanticValidatorViolationCount: precision.invariants.semanticValidatorViolationCount,
    },
    regressionProtection: {
      v136RegionEndToEnd: `${precision.v136Development.endToEnd.tp}/${precision.v136Development.endToEnd.fp}/${precision.v136Development.endToEnd.fn}`,
      v136UniqueStageC: `${stageCMetrics.tp}/${stageCMetrics.fp}/${stageCMetrics.fn}`,
      v135ValidRegression: precision.v135ValidRegression.pass ? "pass" : "fail",
      negativeControls: precision.negativeControls.grantedRegionFp,
      historicalDevUnion: precision.historicalDevUnion.expected,
      allInvariantsZero: precision.invariants.allZero,
    },
    caseReports,
    missLedger,
    tuningAuthorization: "WAIT — classify every miss before shared-grammar changes",
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v137-transfer-run-1-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  envelope.parserExecutionCount = 1;
  envelope.parserVersion = ORACLE_ACTION_RC3_PARSER_VERSION;
  writeFileSync(resolve("data/oracle-action-eval-granted-nested-stage-c-v137.json"), `${JSON.stringify(envelope, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        parserExecutionCount: 1,
        uniqueLayer2Gold: report.uniqueLayer2Gold,
        byAbilityFamily: report.byAbilityFamily,
        missCount: missLedger.length,
        regressionProtection: report.regressionProtection,
        invariants: report.invariants,
      },
      null,
      2,
    ),
  );
}

main();
