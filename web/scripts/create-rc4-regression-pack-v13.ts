/**
 * RC4 regression pack — mechanically from validation-v13-policy-adjudication-v2.json.
 * Action scoring targets = valid_gold_parser_fn + genuine_parser_fp only.
 * Integrity/leakage = structural assertions, not TP/FN denominators.
 *
 * Run: cd web && npx tsx scripts/create-rc4-regression-pack-v13.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDatasetContentHash, type CatalogEvalCase, type EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import type {
  Rc4ActionScoringCase,
  Rc4FpScoringCase,
  Rc4IntegrityAssertion,
  Rc4LeakageAssertion,
  Rc4RegressionPack,
  Rc4ScoringTarget,
} from "./lib/rc4-regression-scoring-v1";

const OUT_DIR = "data/milestones/rc4-development";
const V13_PATH = "data/oracle-action-eval-validation-v13.json";
const ADJUDICATION_PATH =
  "data/milestones/validation-v13-rc3-certification/validation-v13-policy-adjudication-v2.json";

type FnRow = {
  mismatchId: string;
  caseId: string;
  card: string;
  expectedAction: string;
  goldEvidence: string;
  finalVerdict: string;
  policyClass: string;
  adjudicationReason: string;
};

type FpRow = {
  gateFpId: string;
  caseId: string;
  card: string;
  observedAction: string;
  observedEvidence: string;
  finalVerdict: string;
  adjudicationReason: string;
};

const INTEGRITY_CASE_IDS = ["vh13-0131", "vh13-0137", "vh13-0138"];

const LEAKAGE_CASE_FORBIDDEN: Record<
  string,
  Array<{ actionType: string; evidenceContains?: string; policyClass: string }>
> = {
  "vh13-0016": [
    { actionType: "discard", evidenceContains: "Discard this card:", policyClass: "landcycling_cost_layer1" },
    { actionType: "discard", evidenceContains: "discarded a nonland card", policyClass: "condition_reference" },
  ],
  "vh13-0018": [{ actionType: "discard", evidenceContains: "Discard this card:", policyClass: "landcycling_cost_layer1" }],
  "vh13-0024": [{ actionType: "discard", evidenceContains: "Discard this card:", policyClass: "landcycling_cost_layer1" }],
  "vh13-0074": [{ actionType: "sacrifice", evidenceContains: "Sacrifice this artifact:", policyClass: "token_reminder_cost" }],
  "vh13-0163": [{ actionType: "discard", evidenceContains: "discards a land card", policyClass: "trigger_event_reference" }],
};

function pickCardFace(src: CatalogEvalCase, evidence: string): string | undefined {
  const match = src.expectedPrimitiveActions.find(
    (g) => g.evidenceContains === evidence || g.evidenceContains?.startsWith(evidence.slice(0, 20)),
  );
  return match?.cardFace;
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const v13 = JSON.parse(readFileSync(V13_PATH, "utf8")) as EvalDatasetEnvelope & { cases: CatalogEvalCase[] };
  const adjudication = JSON.parse(readFileSync(ADJUDICATION_PATH, "utf8")) as {
    canonicalFnLedger: { rows: FnRow[] };
    canonicalGateFpLedger: { rows: FpRow[] };
  };

  const byId = new Map(v13.cases.map((c) => [c.id, c]));
  const fnTargets = adjudication.canonicalFnLedger.rows.filter((r) => r.finalVerdict === "valid_gold_parser_fn");
  const fpTargets = adjudication.canonicalGateFpLedger.rows.filter((r) => r.finalVerdict === "genuine_parser_fp");

  if (fnTargets.length !== 9) throw new Error(`Expected 9 valid_gold_parser_fn rows, got ${fnTargets.length}`);
  if (fpTargets.length !== 1) throw new Error(`Expected 1 genuine_parser_fp row, got ${fpTargets.length}`);

  const invalidImported = adjudication.canonicalFnLedger.rows.filter((r) =>
    fnTargets.some((t) => t.mismatchId === r.mismatchId && r.finalVerdict !== "valid_gold_parser_fn"),
  ).length;
  const targetIds = new Set(fnTargets.map((r) => r.mismatchId));
  const duplicateTargets = fnTargets.length - targetIds.size;
  const unclassifiedTargets = fnTargets.filter((r) => !r.policyClass).length;

  const fnByCase = new Map<string, FnRow[]>();
  for (const row of fnTargets) {
    if (!fnByCase.has(row.caseId)) fnByCase.set(row.caseId, []);
    fnByCase.get(row.caseId)!.push(row);
  }

  const actionScoringCases: Rc4ActionScoringCase[] = [];
  for (const [caseId, rows] of fnByCase) {
    const src = byId.get(caseId);
    if (!src) throw new Error(`Missing v13 case ${caseId}`);
    const scoringTargets: Rc4ScoringTarget[] = rows.map((r) => ({
      targetId: r.mismatchId,
      actionType: r.expectedAction,
      evidenceContains: r.goldEvidence,
      policyClass: r.policyClass,
      adjudicationVerdict: "valid_gold_parser_fn",
      ...(pickCardFace(src, r.goldEvidence) ? { cardFace: pickCardFace(src, r.goldEvidence) } : {}),
      ...(src.expectedPrimitiveActions.find((g) => g.evidenceContains === r.goldEvidence)?.optionalEffect
        ? { optionalEffect: true }
        : {}),
    }));
    actionScoringCases.push({
      ...src,
      id: `rc4-action-${caseId.replace("vh13-", "")}`,
      category: "rc4-v13-action_scoring",
      sourceV13CaseId: caseId,
      scoringTargets,
      expectedPrimitiveActions: scoringTargets.map((t) => ({
        actionType: t.actionType,
        evidenceContains: t.evidenceContains,
        ...(t.cardFace ? { cardFace: t.cardFace } : {}),
        ...(t.optionalEffect ? { optionalEffect: true } : {}),
      })),
      evaluationSetVersion: "rc4-v13-regression-v140",
      parserConsulted: false,
      spentV13Regression: true,
    });
  }
  actionScoringCases.sort((a, b) => a.sourceV13CaseId.localeCompare(b.sourceV13CaseId));

  const fpScoringCases: Rc4FpScoringCase[] = fpTargets.map((fp) => {
    const src = byId.get(fp.caseId)!;
    return {
      ...src,
      id: `rc4-fp-${fp.caseId.replace("vh13-", "")}`,
      category: "rc4-v13-fp_scoring",
      sourceV13CaseId: fp.caseId,
      falsePositiveTarget: {
        gateFpId: fp.gateFpId,
        observedAction: fp.observedAction,
        observedEvidence: fp.observedEvidence,
        adjudicationVerdict: "genuine_parser_fp",
        policyReason: fp.adjudicationReason,
      },
      evaluationSetVersion: "rc4-v13-regression-v140",
      parserConsulted: false,
      spentV13Regression: true,
    };
  });

  const integrityAssertions: Rc4IntegrityAssertion[] = INTEGRITY_CASE_IDS.map((caseId) => {
    const src = byId.get(caseId)!;
    return {
      assertionId: `rc4-integrity-${caseId.replace("vh13-", "")}`,
      sourceV13CaseId: caseId,
      oracleId: src.oracleId,
      oracleText: src.oracleText,
      cardName: src.cardName ?? caseId,
      cardFace: src.cardFace,
      assertionType: "integrity",
      required: { idViolations: 0, provenanceViolations: 0 },
    };
  });

  const leakageAssertions: Rc4LeakageAssertion[] = Object.entries(LEAKAGE_CASE_FORBIDDEN).map(([caseId, forbiddenEmissions]) => {
    const src = byId.get(caseId)!;
    return {
      assertionId: `rc4-leakage-${caseId.replace("vh13-", "")}`,
      sourceV13CaseId: caseId,
      oracleId: src.oracleId,
      oracleText: src.oracleText,
      cardName: src.cardName ?? caseId,
      cardFace: src.cardFace,
      assertionType: "leakage",
      forbiddenEmissions,
    };
  });

  const accounting = {
    sourceValidParserFnCount: fnTargets.length,
    sourceGenuineParserFpCount: fpTargets.length,
    invalidGoldTargetsImported: invalidImported,
    duplicateTargets,
    unclassifiedTargets,
    integrityAssertions: integrityAssertions.length,
    leakageAssertions: leakageAssertions.length,
    contrastAssertions: 0,
  };

  if (accounting.sourceValidParserFnCount !== 9) throw new Error("sourceValidParserFnCount !== 9");
  if (accounting.sourceGenuineParserFpCount !== 1) throw new Error("sourceGenuineParserFpCount !== 1");
  if (accounting.invalidGoldTargetsImported !== 0) throw new Error("invalidGoldTargetsImported !== 0");
  if (accounting.duplicateTargets !== 0) throw new Error("duplicateTargets !== 0");
  if (accounting.unclassifiedTargets !== 0) throw new Error("unclassifiedTargets !== 0");

  const pack: Rc4RegressionPack = {
    setClassification: "rc4_v13_regression_pack_v140",
    evaluationSetVersion: "rc4-v13-regression-v140",
    adjudicationRef: ADJUDICATION_PATH,
    actionScoringCases,
    fpScoringCases,
    integrityAssertions,
    leakageAssertions,
    accounting,
  };

  const legacyCases = [
    ...actionScoringCases,
    ...fpScoringCases,
    ...integrityAssertions.map((a) => ({
      id: a.assertionId,
      sourceV13CaseId: a.sourceV13CaseId,
      oracleId: a.oracleId,
      oracleText: a.oracleText,
      category: "rc4-v13-integrity_invariant",
      rc4Section: "integrity_invariant",
    })),
    ...leakageAssertions.map((a) => ({
      id: a.assertionId,
      sourceV13CaseId: a.sourceV13CaseId,
      oracleId: a.oracleId,
      oracleText: a.oracleText,
      category: "rc4-v13-activated_cost_layer2_leakage",
      rc4Section: "activated_cost_layer2_leakage",
    })),
  ];

  const envelope = {
    ...pack,
    taxonomyVersion: v13.taxonomyVersion,
    contentHash: computeDatasetContentHash(legacyCases as never[]),
    cases: legacyCases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "development",
    note: "Mechanically rebuilt from validation-v13-policy-adjudication-v2 — action scoring uses adjudicated targets only.",
  };

  const packPath = resolve("data/oracle-action-eval-rc4-v13-regression-v140.json");
  writeFileSync(packPath, `${JSON.stringify(envelope, null, 2)}\n`);

  const manifest = {
    manifestVersion: "rc4-v13-regression-pack-v140",
    frozenAt: new Date().toISOString(),
    parserExecutionCount: 0,
    packPath: "data/oracle-action-eval-rc4-v13-regression-v140.json",
    contentHash: envelope.contentHash,
    adjudicationRef: ADJUDICATION_PATH,
    accounting,
    actionScoringCaseIds: actionScoringCases.map((c) => c.sourceV13CaseId),
    fpScoringCaseIds: fpScoringCases.map((c) => c.sourceV13CaseId),
    integrityCaseIds: INTEGRITY_CASE_IDS,
    leakageCaseIds: Object.keys(LEAKAGE_CASE_FORBIDDEN),
    note: "Action scoring separated from structural/policy assertions.",
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(manifest, null, 2)).digest("hex");
  writeFileSync(resolve(OUT_DIR, "rc4-v13-regression-pack-manifest-v140.json"), `${JSON.stringify({ ...manifest, manifestHash }, null, 2)}\n`);

  console.log(JSON.stringify({ packHash: envelope.contentHash, manifestHash, accounting, actionCases: actionScoringCases.length }, null, 2));
}

main();
