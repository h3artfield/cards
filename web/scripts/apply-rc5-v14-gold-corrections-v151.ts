/**
 * RC5 parser-blind gold corrections — vh14-0046 (copy) + vh14-0114 (draw).
 * Does NOT edit historical v14 forensic/adjudication artifacts.
 * Run: cd web && npx tsx scripts/apply-rc5-v14-gold-corrections-v151.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDatasetContentHash, type EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import type {
  Rc5ActionScoringCase,
  Rc5RegressionPack,
  Rc5ScoringTarget,
} from "./lib/rc5-regression-scoring-v1";

const SRC_PACK = "data/oracle-action-eval-rc5-v14-regression-v150.json";
const OUT_PACK = "data/oracle-action-eval-rc5-v14-regression-v151.json";
const OUT_MANIFEST = "data/milestones/rc5-development/rc5-v14-regression-pack-manifest-v151.json";

const GOLD_CORRECTIONS = [
  {
    sourceV14CaseId: "vh14-0046",
    priorTargetId: "bddfd9f887f0f6dd",
    reason: "invalid_gold_token_copy_not_primitive_copy",
    action: "remove_action_scoring_case" as const,
    preserveSemantics: "create_token + tokenCopyOf — not primitive copy",
  },
  {
    sourceV14CaseId: "vh14-0114",
    priorTargetId: "4aa183675774c1b3",
    reason: "invalid_gold_draw_in_trigger_header",
    action: "replace_scoring_targets" as const,
    replacementTargets: [
      {
        targetId: "rc5-goldcorr-0114-lose-life",
        actionType: "lose_life",
        evidenceContains: "target opponent loses 1 life",
        policyClass: "resolving_effect_layer2",
        adjudicationVerdict: "genuine_parser_fn" as const,
        rc5Family: "triggered_families" as const,
        coverageStratum: "broad_triggered",
        goldCorrectionNote: "L2 resolving effect — replaces invalid draw-in-trigger-header gold",
      },
      {
        targetId: "rc5-goldcorr-0114-gain-life",
        actionType: "gain_life",
        evidenceContains: "you gain 1 life",
        policyClass: "resolving_effect_layer2",
        adjudicationVerdict: "genuine_parser_fn" as const,
        rc5Family: "triggered_families" as const,
        coverageStratum: "broad_triggered",
        goldCorrectionNote: "L2 resolving effect — replaces invalid draw-in-trigger-header gold",
      },
    ],
    preserveSemantics: "draw remains L1 trigger event reference only",
  },
];

function rebuildLegacyCases(pack: Rc5RegressionPack) {
  return [
    ...pack.actionScoringCases,
    ...pack.fpScoringCases,
    ...pack.integrityAssertions.map((a) => ({
      id: a.assertionId,
      sourceV14CaseId: a.sourceV14CaseId,
      oracleId: a.oracleId,
      oracleText: a.oracleText,
      category: "rc5-v14-integrity_invariant",
      rc5Section: "integrity_invariant",
    })),
    ...pack.leakageAssertions.map((a) => ({
      id: a.assertionId,
      sourceV14CaseId: a.sourceV14CaseId,
      oracleId: a.oracleId,
      oracleText: a.oracleText,
      category: "rc5-v14-policy_leakage",
      rc5Section: "policy_leakage",
    })),
  ];
}

function main() {
  const src = JSON.parse(readFileSync(resolve(SRC_PACK), "utf8")) as Rc5RegressionPack &
    EvalDatasetEnvelope & { contentHash?: string };

  let actionScoringCases = [...src.actionScoringCases];
  const parserBlindGoldCorrections: Array<Record<string, unknown>> = [];

  for (const corr of GOLD_CORRECTIONS) {
    const idx = actionScoringCases.findIndex((c) => c.sourceV14CaseId === corr.sourceV14CaseId);
    if (idx < 0) throw new Error(`Missing action scoring case ${corr.sourceV14CaseId}`);

    if (corr.action === "remove_action_scoring_case") {
      const removed = actionScoringCases[idx]!;
      actionScoringCases = actionScoringCases.filter((_, i) => i !== idx);
      parserBlindGoldCorrections.push({
        sourceV14CaseId: corr.sourceV14CaseId,
        priorTargetId: corr.priorTargetId,
        reason: corr.reason,
        action: corr.action,
        preserveSemantics: corr.preserveSemantics,
        removedCaseId: removed.id,
      });
      continue;
    }

    const existing = actionScoringCases[idx]!;
    const scoringTargets: Rc5ScoringTarget[] = corr.replacementTargets!.map((t) => ({
      targetId: t.targetId,
      actionType: t.actionType,
      evidenceContains: t.evidenceContains,
      policyClass: t.policyClass,
      adjudicationVerdict: t.adjudicationVerdict,
      rc5Family: t.rc5Family,
      coverageStratum: t.coverageStratum,
    }));

    const updated: Rc5ActionScoringCase = {
      ...existing,
      scoringTargets,
      expectedPrimitiveActions: scoringTargets.map((t) => ({
        actionType: t.actionType,
        evidenceContains: t.evidenceContains,
      })),
      expectedRoles: [
        {
          role: "card_advantage",
          fromPrimitiveActions: ["gain_life", "lose_life"],
        },
      ],
      goldCorrectionApplied: corr.reason,
      goldCorrectionAt: new Date().toISOString(),
      evaluationSetVersion: "rc5-v14-regression-v151",
    };
    actionScoringCases[idx] = updated;
    parserBlindGoldCorrections.push({
      sourceV14CaseId: corr.sourceV14CaseId,
      priorTargetId: corr.priorTargetId,
      reason: corr.reason,
      action: corr.action,
      preserveSemantics: corr.preserveSemantics,
      replacementTargetIds: scoringTargets.map((t) => t.targetId),
    });
  }

  actionScoringCases = actionScoringCases.map((c) => ({
    ...c,
    evaluationSetVersion: "rc5-v14-regression-v151",
  }));

  const developmentOrder = src.developmentOrder.map((d) => {
    if (d.family === "modal_families") {
      return { ...d, actionTargetIds: d.actionTargetIds.filter((id) => id !== "bddfd9f887f0f6dd") };
    }
    if (d.family === "triggered_families") {
      return {
        ...d,
        actionTargetIds: d.actionTargetIds
          .filter((id) => id !== "4aa183675774c1b3")
          .concat(["rc5-goldcorr-0114-lose-life", "rc5-goldcorr-0114-gain-life"]),
      };
    }
    return d;
  });

  const accounting = {
    ...src.accounting,
    sourceGenuineParserFnCount: src.accounting.sourceGenuineParserFnCount,
    postCorrectionActionTargetCount: actionScoringCases.reduce((n, c) => n + c.scoringTargets.length, 0),
    parserBlindGoldCorrectionsApplied: GOLD_CORRECTIONS.length,
    invalidGoldFnReclassifiedInPack: 2,
    invalidGoldFnExcluded: src.accounting.invalidGoldFnExcluded + 2,
  };

  const pack: Rc5RegressionPack = {
    setClassification: "rc5_v14_regression_pack_v151",
    evaluationSetVersion: "rc5-v14-regression-v151",
    adjudicationRef: src.adjudicationRef,
    forensicRef: src.forensicRef,
    actionScoringCases,
    fpScoringCases: src.fpScoringCases.map((c) => ({
      ...c,
      evaluationSetVersion: "rc5-v14-regression-v151",
    })),
    integrityAssertions: src.integrityAssertions,
    leakageAssertions: src.leakageAssertions,
    developmentOrder,
    accounting,
    parserBlindGoldCorrections,
    priorPackVersion: "rc5-v14-regression-v150",
    priorContentHash: src.contentHash,
  };

  const legacyCases = rebuildLegacyCases(pack);
  const envelope = {
    ...pack,
    taxonomyVersion: src.taxonomyVersion ?? "three-layer-v1.4",
    contentHash: computeDatasetContentHash(legacyCases as never[]),
    cases: legacyCases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "development",
    note:
      "RC5 v14 regression pack v151 — parser-blind gold corrections for vh14-0046 (copy) and vh14-0114 (draw). Historical v14 artifacts unchanged.",
  };

  writeFileSync(resolve(OUT_PACK), `${JSON.stringify(envelope, null, 2)}\n`);

  const manifestBody = {
    manifestVersion: "rc5-v14-regression-pack-v151",
    frozenAt: new Date().toISOString(),
    parserExecutionCount: 0,
    packPath: OUT_PACK,
    contentHash: envelope.contentHash,
    priorManifestVersion: "rc5-v14-regression-pack-v150",
    priorContentHash: src.contentHash,
    forensicRef: src.forensicRef,
    adjudicationRef: src.adjudicationRef,
    accounting,
    parserBlindGoldCorrections,
    developmentOrder,
    actionScoringCaseIds: actionScoringCases.map((c) => c.sourceV14CaseId),
    fpScoringCaseIds: pack.fpScoringCases.map((c) => c.sourceV14CaseId),
    integrityCaseIds: pack.integrityAssertions.map((a) => a.sourceV14CaseId),
    leakageCaseIds: pack.leakageAssertions.map((a) => a.sourceV14CaseId),
    excludedInvalidGoldFnCount: accounting.invalidGoldFnExcluded,
    excludedMissingGoldFpCount: src.accounting.missingGoldFpExcluded,
    note: "RC5 development regression pack v151 — gold-corrected spent v14 ledger. v15 sealed until RC5 candidate freeze.",
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(manifestBody, null, 2)).digest("hex");
  mkdirSync(resolve("data/milestones/rc5-development"), { recursive: true });
  writeFileSync(resolve(OUT_MANIFEST), `${JSON.stringify({ ...manifestBody, manifestHash }, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        outPack: OUT_PACK,
        contentHash: envelope.contentHash,
        manifestHash,
        actionCases: actionScoringCases.length,
        actionTargets: accounting.postCorrectionActionTargetCount,
        goldCorrections: parserBlindGoldCorrections,
      },
      null,
      2,
    ),
  );
}

main();
