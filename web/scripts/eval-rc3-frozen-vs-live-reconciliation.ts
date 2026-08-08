/**
 * Reconcile frozen-rescore (581/5/71) vs live-parse (576/5/76) under identical gold overlay.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { evidenceMatchesExtracted, type ExpectedPrimitiveAction } from "./oracle-action-eval-shared";
import { countParserFalsePositives, type ExtractedActionForMatch } from "./oracle-action-unified-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { sortIndicesByKey, stableGoldKey } from "./lib/semantic-action-identity";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { cardName?: string };

type FrozenAction = {
  actionType: string;
  evidenceText: string;
  evidenceStart?: number;
  faceId?: string;
  optionalEffect?: boolean;
};

type FrozenCase = { caseId: string; emittedActions: FrozenAction[] };

function loadCombined(): Case[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const all: Case[] = [];
  for (const p of paths) all.push(...(JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases);
  return all;
}

function loadFrozen(): Map<string, FrozenCase> {
  const frozen = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/frozen-parse-output-v134-stabilization.json"), "utf8"),
  ) as { cases: FrozenCase[] };
  return new Map(frozen.cases.map((c) => [c.caseId, c]));
}

function frozenMatchesGoldLoose(emitted: FrozenAction, gold: ExpectedPrimitiveAction): boolean {
  if (emitted.actionType !== gold.actionType) return false;
  return evidenceMatchesExtracted(emitted.evidenceText, gold.evidenceContains);
}

function scoreFrozenLoose(testCase: Case, frozen: FrozenCase) {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const matched = new Set<number>();
  let tp = 0;
  const goldOrder = sortIndicesByKey(expected, (exp, idx) => stableGoldKey(testCase.id, exp, idx));
  const emOrder = sortIndicesByKey(frozen.emittedActions, (_, i) => String(i).padStart(4, "0"));

  for (const gi of goldOrder) {
    const gold = expected[gi]!;
    for (const ei of emOrder) {
      if (matched.has(ei)) continue;
      if (frozenMatchesGoldLoose(frozen.emittedActions[ei]!, gold)) {
        matched.add(ei);
        tp++;
        break;
      }
    }
  }
  const unmatched: number[] = [];
  for (let i = 0; i < frozen.emittedActions.length; i++) {
    if (!matched.has(i)) unmatched.push(i);
  }
  const extracted: ExtractedActionForMatch[] = frozen.emittedActions.map((a, index) => ({
    index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart ?? 0,
    evidenceEnd: (a.evidenceStart ?? 0) + a.evidenceText.length,
    cardFaceId: a.faceId ?? "front",
    abilityIndex: 0,
    reviewStatus: "accepted" as const,
    optionalEffect: a.optionalEffect,
  }));
  const fp = countParserFalsePositives(testCase, unmatched, extracted);
  return { tp, fp, fn: expected.length - tp };
}

function goldOutcome(
  testCase: Case,
  gold: ExpectedPrimitiveAction,
  goldIndex: number,
  mode: "frozen_loose" | "frozen_strict" | "live",
  frozen: FrozenCase,
  parsed: ReturnType<typeof parseOracleSemanticsRC3>,
): "tp" | "fn" {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  if (mode === "live") {
    const row = evaluateCaseSemantic(testCase, parsed);
    const matched = row.accepted.tp; // case-level only — need per-gold
    void matched;
    const actions = parsed.actions.filter((a) => a.reviewStatus === "accepted");
    for (const action of actions) {
      if (action.actionType !== gold.actionType) continue;
      if (!evidenceMatchesExtracted(action.provenance.actionSpan.text, gold.evidenceContains)) continue;
      const exp = expected[goldIndex];
      if (!exp) continue;
      const optionalOk =
        (exp.optionalEffect ?? exp.optional) === undefined ||
        (action.optionalEffect ?? false) === (exp.optionalEffect ?? exp.optional ?? false);
      if (exp.abilityIndex !== undefined && action.segmentAbilityIndex !== exp.abilityIndex) continue;
      if (exp.cardFace) {
        const parent = parsed.abilities.find((a) => a.abilityId === action.parentAbilityId);
        if (parent && parent.faceId !== exp.cardFace) continue;
      }
      if (optionalOk) return "tp";
    }
    return "fn";
  }

  for (let i = 0; i < frozen.emittedActions.length; i++) {
    const em = frozen.emittedActions[i]!;
    if (!frozenMatchesGoldLoose(em, gold)) continue;
    if (mode === "frozen_loose") return "tp";
    const exp = expected[goldIndex]!;
    const optionalOk =
      (exp.optionalEffect ?? exp.optional) === undefined ||
      (em.optionalEffect ?? false) === (exp.optionalEffect ?? exp.optional ?? false);
    if (optionalOk) return "tp";
    return "fn";
  }
  return "fn";
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const rawCases = loadCombined();
  const cases = applyGoldMigrationV135(rawCases);
  const frozenById = loadFrozen();

  const frozenLooseRows = cases.map((tc) => scoreFrozenLoose(tc, frozenById.get(tc.id)!));
  const frozenLoose = sumSemanticMetrics(
    frozenLooseRows.map((m, i) => ({
      caseId: cases[i]!.id,
      accepted: m,
      needsReview: { tp: 0, fp: 0, fn: 0 },
    })),
  );

  const liveRows = cases.map((tc) =>
    evaluateCaseSemantic(
      tc,
      parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace }),
    ),
  );
  const live = sumSemanticMetrics(liveRows);

  const diffs: Array<Record<string, unknown>> = [];
  cases.forEach((testCase, caseIdx) => {
    const frozen = frozenById.get(testCase.id)!;
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    expected.forEach((gold, goldIndex) => {
      const loose = goldOutcome(testCase, gold, goldIndex, "frozen_loose", frozen, parsed);
      const strict = goldOutcome(testCase, gold, goldIndex, "frozen_strict", frozen, parsed);
      const liveResult = goldOutcome(testCase, gold, goldIndex, "live", frozen, parsed);
      if (loose === liveResult && strict === liveResult) return;
      let reason = "unknown";
      if (loose === "tp" && liveResult === "fn" && strict === "fn") {
        reason = "frozen_loose_matcher_overcounts_optional_or_metadata";
      } else if (loose === "tp" && liveResult === "fn" && strict === "tp") {
        reason = "live_reparse_differs_from_frozen_export";
      } else if (loose === "fn" && liveResult === "tp") {
        reason = "live_reparse_gains_vs_frozen_export";
      } else if (strict === "tp" && liveResult === "fn") {
        reason = "live_reparse_regression_vs_frozen_export";
      }
      diffs.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        frozenLooseOutcome: loose,
        frozenStrictOutcome: strict,
        liveOutcome: liveResult,
        reason,
        frozenEmissionCount: frozen.emittedActions.length,
        liveEmissionCount: parsed.actions.filter((a) => a.reviewStatus === "accepted").length,
      });
    });
  });

  const netFiveDelta = diffs.filter(
    (d) =>
      (d.frozenLooseOutcome === "tp" && d.liveOutcome === "fn") ||
      (d.frozenLooseOutcome === "fn" && d.liveOutcome === "tp"),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sharedConditions: {
      corpus: "combined development (431 cases)",
      goldOverlay: "persistent-permission-gold-migration-v135",
      promotionFlags: "default (search + activated)",
      scoringTier: "accepted",
      parserVersion: "oracle-action-v1.34-rc3-ast-dev (uncommitted working tree on 776093)",
    },
    metrics: {
      frozenLooseRescore: frozenLoose,
      liveReparse: live,
      delta: {
        tp: live.tp - frozenLoose.tp,
        fp: live.fp - frozenLoose.fp,
        fn: live.fn - frozenLoose.fn,
      },
    },
    authoritativeBaseline: {
      designation: "live_reparse_with_full_semantic_matcher",
      rationale:
        "Frozen loose rescore uses actionType+evidence only; live dev gate uses full semanticPrimitiveMatchesExpected (optionalEffect, abilityIndex, cardFace, modal option). Authoritative baseline must use live reparse + full matcher.",
      metrics: live,
    },
    netFiveDelta: {
      explanation:
        "581/5/69 (frozen loose rescore) vs 576/5/74 (live reparse): five gold actions counted TP under frozen loose matcher but FN under live full semantic matcher",
      actions: netFiveDelta,
    },
    actionLevelDiffs: diffs,
    summary:
      diffs.length === 0
        ? "No action-level divergence under comparable matching"
        : `${diffs.length} gold actions differ between frozen-loose and live-strict evaluation`,
  };

  const out = resolve("data/milestones/rc3-development/frozen-vs-live-reconciliation-v134.json");
  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
