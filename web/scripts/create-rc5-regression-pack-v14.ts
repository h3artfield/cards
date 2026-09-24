/**
 * RC5 regression pack — mechanically from validation-v14-forensic-adjudication-v2.json.
 * Action scoring targets = genuine_parser_fn (19) + genuine_parser_fp (3) only.
 * Excludes invalid_gold FN (23) and missing_gold FP (8) from action scoring.
 * Integrity/leakage = structural/policy assertions, not TP/FN denominators.
 *
 * Run: cd web && npx tsx scripts/create-rc5-regression-pack-v14.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDatasetContentHash, type CatalogEvalCase, type EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import type {
  Rc5ActionScoringCase,
  Rc5DevelopmentFamily,
  Rc5FpScoringCase,
  Rc5IntegrityAssertion,
  Rc5LeakageAssertion,
  Rc5RegressionPack,
  Rc5ScoringTarget,
} from "./lib/rc5-regression-scoring-v1";
import { rc5FamilyForStratum } from "./lib/rc5-regression-scoring-v1";

const OUT_DIR = "data/milestones/rc5-development";
const V14_PATH = "data/oracle-action-eval-validation-v14.json";
const FORENSIC_PATH = "data/milestones/validation-v14-certification/validation-v14-forensic-adjudication-v2.json";
const ADJUDICATION_PATH = "data/milestones/validation-v14-certification/validation-v14-policy-adjudication-v2.json";

type FnRow = {
  mismatchId: string;
  caseId: string;
  cardName: string;
  expectedAction: string;
  goldEvidence: string;
  coverageStratum: string;
  finalVerdict: string;
  policyClass: string;
  invalidGoldSubpartition?: string | null;
  adjudicationReason: string;
  optionalEffect?: boolean;
};

type FpRow = {
  gateFpId: string;
  caseId: string;
  cardName: string;
  observedAction: string;
  observedEvidence: string;
  coverageStratum: string;
  finalVerdict: string;
  adjudicationReason: string;
};

/** Structural integrity probes — full-card parse id/provenance invariants. */
const INTEGRITY_CASE_IDS = ["vh14-0052", "vh14-0087", "vh14-0195"];

const DEVELOPMENT_ORDER: Rc5DevelopmentFamily[] = [
  "granted_nested_actions",
  "replacement_effect_parsing",
  "modal_families",
  "triggered_families",
  "saga_planeswalker",
  "scattered_one_offs",
];

function pickCardFace(src: CatalogEvalCase, evidence: string): string | undefined {
  const match = src.expectedPrimitiveActions.find(
    (g) => g.evidenceContains === evidence || g.evidenceContains?.startsWith(evidence.slice(0, 20)),
  );
  return match?.cardFace;
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const v14 = JSON.parse(readFileSync(V14_PATH, "utf8")) as EvalDatasetEnvelope & { cases: CatalogEvalCase[] };
  const forensic = JSON.parse(readFileSync(FORENSIC_PATH, "utf8")) as {
    fnLedger: { rows: FnRow[] };
    fpLedger: { rows: FpRow[] };
  };

  const byId = new Map(v14.cases.map((c) => [c.id, c]));
  const fnRows = forensic.fnLedger.rows;
  const fpRows = forensic.fpLedger.rows;

  const fnTargets = fnRows.filter((r) => r.finalVerdict === "genuine_parser_fn");
  const fpTargets = fpRows.filter((r) => r.finalVerdict === "genuine_parser_fp");
  const invalidGoldFn = fnRows.filter((r) => r.finalVerdict === "invalid_gold");
  const missingGoldFp = fpRows.filter((r) => r.finalVerdict === "missing_gold");

  if (fnTargets.length !== 19) throw new Error(`Expected 19 genuine_parser_fn rows, got ${fnTargets.length}`);
  if (fpTargets.length !== 3) throw new Error(`Expected 3 genuine_parser_fp rows, got ${fpTargets.length}`);
  if (invalidGoldFn.length !== 23) throw new Error(`Expected 23 invalid_gold FN rows, got ${invalidGoldFn.length}`);
  if (missingGoldFp.length !== 8) throw new Error(`Expected 8 missing_gold FP rows, got ${missingGoldFp.length}`);

  const targetIds = new Set(fnTargets.map((r) => r.mismatchId));
  const duplicateTargets = fnTargets.length - targetIds.size;
  const unclassifiedTargets = fnTargets.filter((r) => !r.policyClass || r.policyClass === "unclassified").length;

  if (duplicateTargets !== 0) throw new Error(`duplicateTargets=${duplicateTargets}`);
  if (unclassifiedTargets !== 0) throw new Error(`unclassifiedTargets=${unclassifiedTargets}`);

  const fnByCase = new Map<string, FnRow[]>();
  for (const row of fnTargets) {
    if (!fnByCase.has(row.caseId)) fnByCase.set(row.caseId, []);
    fnByCase.get(row.caseId)!.push(row);
  }

  const actionScoringCases: Rc5ActionScoringCase[] = [];
  for (const [caseId, rows] of fnByCase) {
    const src = byId.get(caseId);
    if (!src) throw new Error(`Missing v14 case ${caseId}`);
    const scoringTargets: Rc5ScoringTarget[] = rows.map((r) => ({
      targetId: r.mismatchId,
      actionType: r.expectedAction,
      evidenceContains: r.goldEvidence,
      policyClass: r.policyClass,
      adjudicationVerdict: "genuine_parser_fn",
      rc5Family: rc5FamilyForStratum(r.coverageStratum, "fn", r.caseId),
      coverageStratum: r.coverageStratum,
      ...(pickCardFace(src, r.goldEvidence) ? { cardFace: pickCardFace(src, r.goldEvidence) } : {}),
      ...(r.optionalEffect || src.expectedPrimitiveActions.find((g) => g.evidenceContains === r.goldEvidence)?.optionalEffect
        ? { optionalEffect: true }
        : {}),
    }));
    actionScoringCases.push({
      ...src,
      id: `rc5-action-${caseId.replace("vh14-", "")}`,
      category: "rc5-v14-action_scoring",
      sourceV14CaseId: caseId,
      scoringTargets,
      expectedPrimitiveActions: scoringTargets.map((t) => ({
        actionType: t.actionType,
        evidenceContains: t.evidenceContains,
        ...(t.cardFace ? { cardFace: t.cardFace } : {}),
        ...(t.optionalEffect ? { optionalEffect: true } : {}),
      })),
      evaluationSetVersion: "rc5-v14-regression-v150",
      parserConsulted: false,
      spentV14Regression: true,
    });
  }
  actionScoringCases.sort((a, b) => a.sourceV14CaseId.localeCompare(b.sourceV14CaseId));

  const fpScoringCases: Rc5FpScoringCase[] = fpTargets.map((fp) => {
    const src = byId.get(fp.caseId)!;
    return {
      ...src,
      id: `rc5-fp-${fp.caseId.replace("vh14-", "")}`,
      category: "rc5-v14-fp_scoring",
      sourceV14CaseId: fp.caseId,
      falsePositiveTarget: {
        gateFpId: fp.gateFpId,
        observedAction: fp.observedAction,
        observedEvidence: fp.observedEvidence,
        adjudicationVerdict: "genuine_parser_fp",
        policyReason: fp.adjudicationReason,
        rc5Family: rc5FamilyForStratum(fp.coverageStratum, "fp", fp.caseId),
        coverageStratum: fp.coverageStratum,
      },
      evaluationSetVersion: "rc5-v14-regression-v150",
      parserConsulted: false,
      spentV14Regression: true,
    };
  });

  const integrityAssertions: Rc5IntegrityAssertion[] = INTEGRITY_CASE_IDS.map((caseId) => {
    const src = byId.get(caseId)!;
    return {
      assertionId: `rc5-integrity-${caseId.replace("vh14-", "")}`,
      sourceV14CaseId: caseId,
      oracleId: src.oracleId,
      oracleText: src.oracleText,
      cardName: src.cardName ?? caseId,
      cardFace: src.cardFace,
      assertionType: "integrity",
      required: { idViolations: 0, provenanceViolations: 0 },
    };
  });

  const leakageByCase = new Map<string, Rc5LeakageAssertion["forbiddenEmissions"]>();
  for (const row of invalidGoldFn) {
    if (!leakageByCase.has(row.caseId)) leakageByCase.set(row.caseId, []);
    leakageByCase.get(row.caseId)!.push({
      actionType: row.expectedAction,
      evidenceContains: row.goldEvidence,
      policyClass: row.invalidGoldSubpartition ?? row.policyClass,
    });
  }

  const leakageAssertions: Rc5LeakageAssertion[] = [...leakageByCase.entries()].map(([caseId, forbiddenEmissions]) => {
    const src = byId.get(caseId)!;
    return {
      assertionId: `rc5-leakage-${caseId.replace("vh14-", "")}`,
      sourceV14CaseId: caseId,
      oracleId: src.oracleId,
      oracleText: src.oracleText,
      cardName: src.cardName ?? caseId,
      cardFace: src.cardFace,
      assertionType: "leakage",
      forbiddenEmissions,
    };
  });
  leakageAssertions.sort((a, b) => a.sourceV14CaseId.localeCompare(b.sourceV14CaseId));

  const developmentOrder = DEVELOPMENT_ORDER.map((family, index) => ({
    family,
    priority: index + 1,
    actionTargetIds: fnTargets.filter((r) => rc5FamilyForStratum(r.coverageStratum, "fn", r.caseId) === family).map((r) => r.mismatchId),
    fpTargetIds: fpTargets.filter((r) => rc5FamilyForStratum(r.coverageStratum, "fp", r.caseId) === family).map((r) => r.gateFpId),
  }));

  const accounting = {
    sourceGenuineParserFnCount: fnTargets.length,
    sourceGenuineParserFpCount: fpTargets.length,
    invalidGoldFnExcluded: invalidGoldFn.length,
    missingGoldFpExcluded: missingGoldFp.length,
    invalidGoldTargetsImported: 0,
    duplicateTargets: 0,
    unclassifiedTargets: 0,
    integrityAssertions: integrityAssertions.length,
    leakageAssertions: leakageAssertions.length,
    contrastAssertions: 0,
  };

  const pack: Rc5RegressionPack = {
    setClassification: "rc5_v14_regression_pack_v150",
    evaluationSetVersion: "rc5-v14-regression-v150",
    adjudicationRef: ADJUDICATION_PATH,
    forensicRef: FORENSIC_PATH,
    actionScoringCases,
    fpScoringCases,
    integrityAssertions,
    leakageAssertions,
    developmentOrder,
    accounting,
  };

  const legacyCases = [
    ...actionScoringCases,
    ...fpScoringCases,
    ...integrityAssertions.map((a) => ({
      id: a.assertionId,
      sourceV14CaseId: a.sourceV14CaseId,
      oracleId: a.oracleId,
      oracleText: a.oracleText,
      category: "rc5-v14-integrity_invariant",
      rc5Section: "integrity_invariant",
    })),
    ...leakageAssertions.map((a) => ({
      id: a.assertionId,
      sourceV14CaseId: a.sourceV14CaseId,
      oracleId: a.oracleId,
      oracleText: a.oracleText,
      category: "rc5-v14-policy_leakage",
      rc5Section: "policy_leakage",
    })),
  ];

  const envelope = {
    ...pack,
    taxonomyVersion: v14.taxonomyVersion,
    contentHash: computeDatasetContentHash(legacyCases as never[]),
    cases: legacyCases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "development",
    note:
      "Mechanically rebuilt from validation-v14-forensic-adjudication-v2 — action scoring uses 19 genuine_parser_fn + 3 genuine_parser_fp only. v15 NOT included.",
  };

  const packPath = resolve("data/oracle-action-eval-rc5-v14-regression-v150.json");
  writeFileSync(packPath, `${JSON.stringify(envelope, null, 2)}\n`);

  const manifest = {
    manifestVersion: "rc5-v14-regression-pack-v150",
    frozenAt: new Date().toISOString(),
    parserExecutionCount: 0,
    packPath: "data/oracle-action-eval-rc5-v14-regression-v150.json",
    contentHash: envelope.contentHash,
    forensicRef: FORENSIC_PATH,
    adjudicationRef: ADJUDICATION_PATH,
    accounting,
    developmentOrder,
    actionScoringCaseIds: actionScoringCases.map((c) => c.sourceV14CaseId),
    fpScoringCaseIds: fpScoringCases.map((c) => c.sourceV14CaseId),
    integrityCaseIds: INTEGRITY_CASE_IDS,
    leakageCaseIds: leakageAssertions.map((a) => a.sourceV14CaseId),
    excludedInvalidGoldFnCount: invalidGoldFn.length,
    excludedMissingGoldFpCount: missingGoldFp.length,
    note: "RC5 development regression pack from spent v14. v15 remains sealed until RC5 candidate freeze.",
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(manifest, null, 2)).digest("hex");
  writeFileSync(resolve(OUT_DIR, "rc5-v14-regression-pack-manifest-v150.json"), `${JSON.stringify({ ...manifest, manifestHash }, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        packHash: envelope.contentHash,
        manifestHash,
        accounting,
        actionCases: actionScoringCases.length,
        actionTargets: fnTargets.length,
        fpCases: fpScoringCases.length,
        leakageCases: leakageAssertions.length,
        developmentOrder: developmentOrder.map((d) => ({
          family: d.family,
          fn: d.actionTargetIds.length,
          fp: d.fpTargetIds.length,
        })),
      },
      null,
      2,
    ),
  );
}

main();
