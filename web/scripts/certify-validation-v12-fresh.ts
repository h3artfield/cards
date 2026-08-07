/**
 * Independent validation v12 fresh gold certification — no parser execution.
 * Run: npx tsx scripts/certify-validation-v12-fresh.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, combinedGoldenOracleText, goldenOracleTextHash } from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { applyValidationGoldPolicyV11 } from "./lib/validation-gold-policy-v11";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const V12_PATH = "data/oracle-action-eval-validation-v12-fresh.json";
const CERTIFIER = "validation-v12-fresh-gold-certifier-v1";
const TAXONOMY = "three-layer-v1.3";

const V12_ADJUDICATIONS: Record<string, Partial<CatalogEvalCase>> = {
  "vh12-0048": {
    expectedPrimitiveActions: [],
    forbiddenPrimitiveActions: ["create_token"],
  },
  "vh12-0049": {
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "Put one of those cards into your hand" },
    ],
  },
  "vh12-0097": {
    expectedPrimitiveActions: [],
    forbiddenPrimitiveActions: ["draw", "destroy", "deal_damage"],
  },
  "vh12-0116": {
    expectedPrimitiveActions: [
      { actionType: "deal_damage", evidenceContains: "deals that much damage to any target" },
    ],
  },
};

function isReplacementEffect(oracleText: string): boolean {
  return /\bIf you would\b/i.test(oracleText);
}

function isGrantedAbilityStatic(oracleText: string): boolean {
  return /\bhave "/i.test(oracleText);
}

function isCostCase(oracleText: string): boolean {
  return /\{[^}]+\}:/.test(oracleText) || /\{T\},/.test(oracleText);
}

function isStaticRestriction(oracleText: string): boolean {
  return /\b(?:can't|cannot|don't|do not)\b/i.test(oracleText);
}

function isReminderHeavy(oracleText: string): boolean {
  return /\([^)]{20,}\)/.test(oracleText);
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v12Path = resolve(process.cwd(), V12_PATH);
  const v12 = JSON.parse(readFileSync(v12Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const reviewedAt = new Date().toISOString();
  let identityExact = 0;
  let hashVerified = 0;
  let evidenceOk = 0;
  let evidenceDefects = 0;
  let incompleteCases = 0;
  let layer2Gold = 0;
  let forbiddenCases = 0;
  let multifaceCases = 0;
  let reminderHeavyCases = 0;
  let costCases = 0;
  let staticCases = 0;
  const changedCaseIds: string[] = [];

  const cases: CatalogEvalCase[] = v12.cases.map((c) => {
    const golden = catalog.byOracleId.get(c.oracleId);
    if (!golden) throw new Error(`Case ${c.id} oracleId ${c.oracleId} not in catalog`);

    const catalogText = combinedGoldenOracleText(golden);
    const catalogHash = goldenOracleTextHash(catalogText);
    if (c.goldenOracleTextHash === catalogHash || c.oracleText === catalogText) hashVerified += 1;
    if (c.identityStatus === "catalog_exact") identityExact += 1;

    let testCase: OracleActionEvalCaseV2 = {
      ...(c as OracleActionEvalCaseV2),
      ...(V12_ADJUDICATIONS[c.id] ?? {}),
      oracleText: catalogText,
    };

    let primitives = testCase.expectedPrimitiveActions.filter((p) => !p.negative);
    primitives = sanitizeGoldPrimitives(testCase.oracleText, primitives);
    testCase = { ...testCase, expectedPrimitiveActions: primitives };

    const policyResult = applyValidationGoldPolicyV11(testCase);
    testCase = policyResult.testCase;
    if (policyResult.changed) changedCaseIds.push(c.id);

    let caseEvidenceOk = true;
    for (const p of testCase.expectedPrimitiveActions) {
      if (p.negative) continue;
      if (!evidenceMatchesOracle(testCase.oracleText, p.evidenceContains)) {
        caseEvidenceOk = false;
        evidenceDefects += 1;
      }
    }
    if (caseEvidenceOk) evidenceOk += 1;

    const positives = testCase.expectedPrimitiveActions.filter((p) => !p.negative);
    layer2Gold += positives.length;
    if (testCase.forbiddenPrimitiveActions?.length) forbiddenCases += 1;
    if (testCase.cardFace || /\n\/\/\n/.test(testCase.oracleText)) multifaceCases += 1;
    if (isReminderHeavy(testCase.oracleText)) reminderHeavyCases += 1;
    if (isCostCase(testCase.oracleText)) costCases += 1;
    if (isStaticRestriction(testCase.oracleText)) staticCases += 1;

    const hasLayer1 =
      (testCase.expectedStructure?.minTriggeredAbilities ?? 0) > 0 ||
      (testCase.expectedStructure?.minActivatedAbilities ?? 0) > 0 ||
      testCase.expectedStructure?.optional === true ||
      (testCase.forbiddenPrimitiveActions?.length ?? 0) > 0 ||
      isStaticRestriction(testCase.oracleText) ||
      isReplacementEffect(testCase.oracleText) ||
      isGrantedAbilityStatic(testCase.oracleText);
    const complete = positives.length > 0 || hasLayer1;
    if (!complete) incompleteCases += 1;

    return {
      ...testCase,
      goldenOracleTextHash: catalogHash,
      identityStatus: "catalog_exact",
      taxonomyVersion: TAXONOMY,
      goldReviewVersion: CERTIFIER,
      goldReviewedAt: reviewedAt,
      goldReviewer: CERTIFIER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: complete ? "complete" : "incomplete",
    } as CatalogEvalCase;
  });

  if (incompleteCases > 0) {
    const bad = cases.filter((c) => c.goldCompletenessStatus === "incomplete").map((c) => c.id);
    throw new Error(`v12 has ${incompleteCases} incomplete cases: ${bad.slice(0, 10).join(", ")}`);
  }

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v12,
    taxonomyVersion: TAXONOMY,
    contentHash: "",
    cases,
    sealed: true,
    parserExecutionCount: 0,
    holdoutStatus: "active",
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      priorContentHash: v12.contentHash,
      casesReviewed: `${cases.length}/${cases.length}`,
      casesChanged: changedCaseIds.length,
      changedCaseIds,
      identityExact: `${identityExact}/${cases.length}`,
      oracleTextHashVerified: `${hashVerified}/${cases.length}`,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      incompleteCaseCount: 0,
      evaluatorCompatibleEvidence: `${evidenceOk}/${cases.length}`,
      evidenceDefects,
      layer2GoldPrimitiveCount: layer2Gold,
      forbiddenPrimitiveActionCases: forbiddenCases,
      multifaceCases,
      reminderHeavyCases,
      costCases,
      staticPermissionRestrictionCases: staticCases,
      parserExecutionCount: 0,
      rc1OutputConsulted: false,
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  writeFileSync(v12Path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDir = resolve(process.cwd(), "data/milestones/validation-v12-fresh-certification");
  mkdirSync(freezeDir, { recursive: true });
  const freeze = {
    validationSet: "validation_set_v12_fresh",
    validationV12Hash: envelope.contentHash,
    caseCount: cases.length,
    sealed: true,
    parserExecutionCount: 0,
    holdoutStatus: "active",
    taxonomyVersion: TAXONOMY,
    goldReviewStatus: "reviewed",
    goldCompletenessStatus: "complete",
    identityExact: `${cases.length}/${cases.length}`,
    oracleTextHashVerified: `${hashVerified}/${cases.length}`,
    evaluatorCompatibleEvidence: `${evidenceOk}/${cases.length}`,
    layer2GoldPrimitiveCount: layer2Gold,
    forbiddenPrimitiveActionCases: forbiddenCases,
    multifaceCases,
    reminderHeavyCases,
    costCases,
    staticPermissionRestrictionCases: staticCases,
    frozenAt: reviewedAt,
    stratumCounts: v12.goldCertification?.stratumCounts ?? {},
  };
  writeFileSync(resolve(freezeDir, "validation-v12-fresh-freeze.json"), `${JSON.stringify(freeze, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(freeze, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
