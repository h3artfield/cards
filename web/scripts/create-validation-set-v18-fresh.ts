/**
 * Validation v18 fresh selection — parser-blind gold, taxonomy v1.4, Gold Policy v1.7.
 * Zero overlap with dev/v12–v17/blind/training/guardrails.
 * Card selection uses architectural-domain strata only — NOT v17 failure cards.
 * Run: cd web && npx tsx scripts/create-validation-set-v18-fresh.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  loadGoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { REVIEWER_ID } from "./oracle-action-eval-shared";
import { loadExcludedOracleIds, assertNoOracleIdOverlap } from "./lib/benchmark-oracle-id-exclusions";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { applyV14HandZoneToDerived, TAXONOMY_V14 } from "./lib/taxonomy-v14-hand-zone";
import { attachCaseScopeV11 } from "./lib/case-scope-v11";
import { extractGrammarFamilyTargets, GRANT_GRAMMAR_FAMILIES } from "./lib/granted-grammar-family-query";
import type { MachineGroundedBenchmarkTarget } from "./lib/benchmark-identity";
import { validateSemanticRoles } from "./lib/benchmark-semantic-adjudication";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";
import { validateBenchmarkGoldPolicy, validateGoldAction } from "./lib/gold-policy-validator-v1";
import { computeGoldPolicyStackHashes } from "./lib/gold-policy-stack-v1";
import {
  immutableBenchmarkFilename,
  writeImmutableBenchmarkEnvelope,
} from "./lib/immutable-benchmark-storage-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/validation-v18-certification";
const SET_VERSION = "validation-v18";
const CANONICAL_PATH = "data/oracle-action-eval-validation-v18.json";
const CERTIFIER = "validation-set-v18-fresh-sealer-v152";
const REVIEWER = REVIEWER_ID;

type V15Stratum = {
  stratum: string;
  bucket: "challenge" | "broad" | "policy";
  quota: number;
  rc5Family?: string;
  match: (text: string, layout?: string) => boolean;
};

/** Architectural-domain strata — parser-blind regex selection, independent of v17 mismatch cards. */
const V18_STRATA: V15Stratum[] = [
  {
    stratum: "challenge_granted_nested_actions",
    bucket: "challenge",
    quota: 20,
    rc5Family: "granted_nested_actions",
    match: (t) => /\b(?:have|gains?) "/i.test(t) && /\b(?:When|Whenever|\{T\}|:)/i.test(t),
  },
  {
    stratum: "challenge_replacement",
    bucket: "challenge",
    quota: 12,
    rc5Family: "replacement_effect_parsing",
    match: (t) => /\bIf you would\b|\binstead\b/i.test(t),
  },
  {
    stratum: "broad_saga_planeswalker",
    bucket: "broad",
    quota: 12,
    rc5Family: "saga_planeswalker",
    match: (t, l) => l === "saga" || /^[\−\+]\d+:/m.test(t),
  },
  {
    stratum: "challenge_modal_option_lineage",
    bucket: "challenge",
    quota: 14,
    rc5Family: "modal_triggered",
    match: (t) => /Choose (?:one|two|any number)/i.test(t) && /•/.test(t),
  },
  {
    stratum: "broad_triggered",
    bucket: "broad",
    quota: 18,
    rc5Family: "triggered_compound",
    match: (t) => /\b(When|Whenever|At the beginning of)\b/i.test(t),
  },
  {
    stratum: "challenge_activated_cost_vs_effect",
    bucket: "challenge",
    quota: 12,
    match: (t) => /\{[^}]+\}:/.test(t) && !/^[\−\+]\d+:/m.test(t) && /\b(Sacrifice|Discard|Tap|Exile)\b/i.test(t),
  },
  {
    stratum: "challenge_immediate_cast_vs_permission",
    bucket: "challenge",
    quota: 12,
    rc5Family: "immediate_cast_grammar",
    match: (t) =>
      /\b(you may cast|cast a copy|cast it without paying|can't cast)\b/i.test(t) && !/^[\−\+]\d+:/m.test(t),
  },
  {
    stratum: "challenge_counter_quantity",
    bucket: "challenge",
    quota: 10,
    match: (t) => /\bput (?:a |one |two |three |\d+ |that many )[^.]*counter/i.test(t) || /\b\+1\/\+1 counter/i.test(t),
  },
  {
    stratum: "challenge_mdfc_face_provenance",
    bucket: "challenge",
    quota: 8,
    match: (t, l) => t.includes("\n//\n") || !!l?.match(/dfc|transform|adventure|split/i),
  },
  {
    stratum: "challenge_library_movement_vs_search",
    bucket: "challenge",
    quota: 10,
    rc5Family: "library_movement_distinction",
    match: (t) =>
      (/Search your library/i.test(t) && /shuffle/i.test(t)) ||
      /(?:put|move)[^.]*(?:top|bottom) of (?:your )?library/i.test(t) ||
      /look at the top/i.test(t),
  },
  {
    stratum: "challenge_zone_recursion",
    bucket: "challenge",
    quota: 8,
    match: (t) =>
      /from (?:your )?graveyard to (?:your hand|the battlefield)/i.test(t) ||
      /\bReturn target[^.]*from[^.]*graveyard/i.test(t),
  },
  {
    stratum: "broad_activated",
    bucket: "broad",
    quota: 12,
    match: (t) => /\{T\}/.test(t) || /\{[^}]+\}:/.test(t),
  },
  {
    stratum: "broad_modal",
    bucket: "broad",
    quota: 12,
    match: (t) => /Choose (?:one|two)/i.test(t),
  },
  {
    stratum: "broad_compound",
    bucket: "broad",
    quota: 8,
    match: (t) => (t.match(/\./g) ?? []).length >= 2 && t.length < 320,
  },
  {
    stratum: "broad_variable_quantity",
    bucket: "broad",
    quota: 8,
    match: (t) => /\bequal to\b|\bX\b|\bhalf the\b|\bfor each\b/i.test(t),
  },
  {
    stratum: "policy_static_permission",
    bucket: "policy",
    quota: 6,
    match: (t) => /\b(?:can't|cannot)\b/i.test(t) && !/^(When|Whenever)/i.test(t.trim()),
  },
  {
    stratum: "policy_reminder_heavy",
    bucket: "policy",
    quota: 6,
    match: (t) => /\([^)]{25,}\)/.test(t),
  },
  {
    stratum: "policy_trigger_condition",
    bucket: "policy",
    quota: 6,
    match: (t) => /Whenever you cast|When you cast|If you cast/i.test(t),
  },
];

function sha256Json(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function deriveStructure(oracleText: string): OracleActionEvalCaseV2["expectedStructure"] | undefined {
  const structure: NonNullable<OracleActionEvalCaseV2["expectedStructure"]> = {};
  if (/\b(When|Whenever|At the beginning of)\b/i.test(oracleText)) structure.minTriggeredAbilities = 1;
  if (/\{[^}]+\}:/.test(oracleText) || /\{T\}/.test(oracleText)) structure.minActivatedAbilities = 1;
  if (/\bYou may\b/i.test(oracleText)) structure.optional = true;
  return Object.keys(structure).length ? structure : undefined;
}

function countLayer2Gold(cases: CatalogEvalCase[]): number {
  return cases.reduce((n, c) => n + (c.expectedPrimitiveActions ?? []).filter((g) => !g.negative).length, 0);
}

function goldKey(g: ExpectedPrimitiveAction): string {
  return `${g.actionType}|${(g.evidenceContains ?? "").toLowerCase().trim()}|${g.cardFace ?? ""}`;
}

function filterPolicyValidGold(testCase: OracleActionEvalCaseV2, candidates: ExpectedPrimitiveAction[]): ExpectedPrimitiveAction[] {
  const kept: ExpectedPrimitiveAction[] = [];
  const seen = new Set<string>();
  for (const gold of candidates) {
    if (gold.negative) continue;
    const key = goldKey(gold);
    if (seen.has(key)) continue;
    if (validateGoldAction(testCase, gold).length > 0) continue;
    seen.add(key);
    const semantic = enrichGoldAction(testCase, gold);
    kept.push({
      ...gold,
      semanticJustification: {
        clauseRole: semantic.clauseRole,
        abilityType: semantic.abilityType,
        executionContext: semantic.executionContext,
        semanticOwner: semantic.semanticOwner,
        cardNativeLayer2Eligible: semantic.cardNativeLayer2Eligible,
        evidenceSpan: semantic.evidenceSpan ?? undefined,
        optionalEffect: semantic.optionalEffect,
        optionalCost: semantic.optionalCost,
      },
    } as ExpectedPrimitiveAction);
  }
  return kept;
}

function attachBenchmarkTargets(testCase: OracleActionEvalCaseV2, oracleText: string): MachineGroundedBenchmarkTarget[] {
  const targets: MachineGroundedBenchmarkTarget[] = [];
  for (const def of GRANT_GRAMMAR_FAMILIES) {
    if (!def.catalogQuery.test(oracleText)) continue;
    for (const target of extractGrammarFamilyTargets(oracleText, def.family)) {
      const row =
        target.expectedContext === "genuine_granted"
          ? validateSemanticRoles(target, oracleText)
          : { status: "valid" as const };
      if (row.status !== "valid") continue;
      targets.push({
        ...target,
        oracleTextHash: goldenOracleTextHash(oracleText),
        adjudicationStatus: "parser_blind_adjudicated",
        ...(row.semanticAdjudication ? { semanticAdjudication: row.semanticAdjudication } : {}),
      });
    }
  }
  if (targets.length === 0) {
    targets.push({
      expectedContext: "source_owned_reference",
      fullRegionSpan: {
        start: 0,
        end: Math.min(oracleText.length, 120),
        text: oracleText.slice(0, Math.min(oracleText.length, 120)),
      },
      oracleTextHash: goldenOracleTextHash(oracleText),
      adjudicationStatus: "parser_blind_adjudicated",
    });
  }
  return targets;
}

function buildCatalogCase(
  card: GoldenCatalogOracleCard,
  id: string,
  category: string,
  catalogVersion: string,
  stratum: string,
  reviewedAt: string,
): CatalogEvalCase {
  let derived = derivePrimitivesFromOracleText(card.oracleText) ?? [];
  derived = sanitizeGoldPrimitives(card.oracleText, derived);
  const { primitives } = applyV14HandZoneToDerived(id, derived);

  const base: OracleActionEvalCaseV2 = {
    id,
    category,
    layout: card.layout,
    oracleId: card.oracleId,
    oracleText: card.oracleText,
    expectedStructure: deriveStructure(card.oracleText),
    expectedPrimitiveActions: primitives,
    expectedRoles: inferDerivedRoles(primitives.map((p) => p.actionType)).map((role) => ({
      role,
      fromPrimitiveActions: primitives.map((p) => p.actionType),
    })),
    cardName: card.canonicalName,
    colorIdentity: [...(card.colorIdentity ?? [])],
    goldenCatalogVersion: catalogVersion,
    goldenOracleTextHash: goldenOracleTextHash(combinedGoldenOracleText(card)),
    evaluationLabelVersion: "eval-catalog-backed-v1",
    taxonomyVersion: TAXONOMY_V14,
    evaluationSetVersion: SET_VERSION,
    goldReviewVersion: CERTIFIER,
    goldReviewedAt: reviewedAt,
    goldReviewer: REVIEWER,
    goldReviewStatus: "reviewed",
    goldCompletenessStatus: "complete_within_scope",
    identityStatus: "catalog_exact",
    reviewer: REVIEWER,
    coverageStratum: stratum,
    parserConsulted: false,
  };

  const scoped = attachCaseScopeV11(base) as OracleActionEvalCaseV2;
  scoped.benchmarkTargets = attachBenchmarkTargets(scoped, card.oracleText);
  return scoped as CatalogEvalCase;
}

function pickCards(
  cards: GoldenCatalogOracleCard[],
  rule: { match: (text: string, layout?: string) => boolean; quota: number },
  used: Set<string>,
  excluded: Set<string>,
): GoldenCatalogOracleCard[] {
  const picked: GoldenCatalogOracleCard[] = [];
  for (const card of cards) {
    if (picked.length >= rule.quota) break;
    if (!card.oracleText?.trim()) continue;
    if (excluded.has(card.oracleId) || used.has(card.oracleId)) continue;
    if (!rule.match(card.oracleText, card.layout)) continue;
    picked.push(card);
    used.add(card.oracleId);
  }
  return picked;
}

function applyPolicyCorrection(
  cases: CatalogEvalCase[],
  prePolicyHash: string,
): CatalogEvalCase[] {
  return cases.map((c) => {
    let derived = derivePrimitivesFromOracleText(c.oracleText) ?? [];
    derived = sanitizeGoldPrimitives(c.oracleText, derived);
    const merged = [...c.expectedPrimitiveActions.filter((g) => !g.negative), ...derived];
    const filtered = filterPolicyValidGold(c, merged);
    return attachCaseScopeV11({
      ...c,
      expectedPrimitiveActions: filtered,
      goldReviewVersion: "validation-v18-gold-policy-corrector-v1",
      goldReviewedAt: new Date().toISOString(),
      parserConsulted: false,
      prePolicyValidation: {
        preservedContentHash: prePolicyHash,
        preservedArtifact: `data/milestones/validation-v18-certification/${immutableBenchmarkFilename(SET_VERSION, "prepolicy", prePolicyHash)}`,
        status: "superseded_before_parser_contact",
        correctedAt: new Date().toISOString(),
        corrector: "validation-v18-gold-policy-corrector-v1",
      },
    } as OracleActionEvalCaseV2) as CatalogEvalCase;
  });
}

async function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const reviewedAt = new Date().toISOString();
  const catalog = await loadGoldenCatalogIndex();
  const allCards = [...catalog.byOracleId.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  const benchmarkExcluded = loadExcludedOracleIds();

  const used = new Set<string>();
  const cases: CatalogEvalCase[] = [];
  const stratumCounts: Record<string, number> = {};
  const bucketCounts = { challenge: 0, broad: 0, policy: 0 };
  const rc5FamilyCounts: Record<string, number> = {};

  for (const stratum of V18_STRATA) {
    const picked = pickCards(allCards, stratum, used, benchmarkExcluded);
    stratumCounts[stratum.stratum] = picked.length;
    bucketCounts[stratum.bucket] += picked.length;
    if (stratum.rc5Family) rc5FamilyCounts[stratum.rc5Family] = (rc5FamilyCounts[stratum.rc5Family] ?? 0) + picked.length;
    for (const card of picked) {
      cases.push(
        buildCatalogCase(
          card,
          `vh18-${String(cases.length + 1).padStart(4, "0")}`,
          `${SET_VERSION}-${stratum.stratum}`,
          catalog.catalogVersion,
          stratum.stratum,
          reviewedAt,
        ),
      );
    }
  }

  const TARGET_CASES = 225;
  const TARGET_L2 = 280;
  for (const card of allCards) {
    if (cases.length >= TARGET_CASES && countLayer2Gold(cases) >= TARGET_L2) break;
    if (benchmarkExcluded.has(card.oracleId) || used.has(card.oracleId)) continue;
    if (!card.oracleText?.trim() || card.oracleText.length < 40) continue;
    used.add(card.oracleId);
    cases.push(
      buildCatalogCase(
        card,
        `vh18-${String(cases.length + 1).padStart(4, "0")}`,
        `${SET_VERSION}-broad_supplement`,
        catalog.catalogVersion,
        "broad_supplement",
        reviewedAt,
      ),
    );
    stratumCounts.broad_supplement = (stratumCounts.broad_supplement ?? 0) + 1;
    bucketCounts.broad++;
  }

  assertNoOracleIdOverlap(cases, benchmarkExcluded, "validation v18 vs prior benchmarks");

  const prePolicyL2 = countLayer2Gold(cases);
  const prePolicyEnvelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; goldCertification: Record<string, unknown> } = {
    setClassification: "validation_set_v18",
    evaluationSetVersion: SET_VERSION,
    taxonomyVersion: TAXONOMY_V14,
    contentHash: "",
    cases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "active",
    benchmarkStatus: "catalog_clean_pre_policy",
    usableForParserEvaluation: false,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      layer2GoldPrimitiveCount: prePolicyL2,
      stratumCounts,
      bucketCounts,
      rc5FamilyCounts,
      parserExecutionCount: 0,
      parserConsulted: false,
    },
  };
  prePolicyEnvelope.contentHash = computeDatasetContentHash(cases);

  const prepolicyImmutablePath = writeImmutableBenchmarkEnvelope({
    setVersion: SET_VERSION,
    phase: "prepolicy",
    envelope: prePolicyEnvelope,
    outDir: OUT_DIR,
  });

  const correctedCases = applyPolicyCorrection(cases, prePolicyEnvelope.contentHash);
  const certifiedL2 = countLayer2Gold(correctedCases);
  const certifiedEnvelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; goldCertification: Record<string, unknown> } = {
    ...prePolicyEnvelope,
    cases: correctedCases,
    contentHash: "",
    benchmarkStatus: "policy_corrected_pending_certification",
    usableForParserEvaluation: true,
    goldCertification: {
      ...prePolicyEnvelope.goldCertification,
      layer2GoldPrimitiveCount: certifiedL2,
      prePolicyLayer2GoldPrimitiveCount: prePolicyL2,
      prePolicyImmutablePath: prepolicyImmutablePath.replace(/\\/g, "/"),
    },
  };
  certifiedEnvelope.contentHash = computeDatasetContentHash(correctedCases);
  writeFileSync(resolve(CANONICAL_PATH), `${JSON.stringify(certifiedEnvelope, null, 2)}\n`);

  const certifiedImmutablePath = writeImmutableBenchmarkEnvelope({
    setVersion: SET_VERSION,
    phase: "certified",
    envelope: certifiedEnvelope,
    outDir: OUT_DIR,
  });

  const validation = validateBenchmarkGoldPolicy({
    cases: correctedCases,
    benchmarkHash: certifiedEnvelope.contentHash,
    benchmarkPath: CANONICAL_PATH,
  });
  if (!validation.pass) {
    writeFileSync(
      resolve(OUT_DIR, "validation-v18-gold-policy-validation-failure-v1.json"),
      `${JSON.stringify(validation, null, 2)}\n`,
    );
    throw new Error(`v18 gold policy validation failed: ${validation.violations.length} violations`);
  }

  execSync(
    `npx tsx scripts/run-gold-policy-validator.ts ${CANONICAL_PATH} --out-dir ${OUT_DIR} --set-version ${SET_VERSION}`,
    { cwd: resolve("."), stdio: "inherit" },
  );

  const policyStack = computeGoldPolicyStackHashes();
  const taxonomyHash = sha256Json({ taxonomyVersion: TAXONOMY_V14, handZoneMigration: "v14-hand-zone" });
  const selectionManifest = {
    manifestVersion: "validation-v18-freeze-manifest-v152",
    frozenAt: reviewedAt,
    status: "SEALED",
    parserExecutionCount: 0,
    parserConsulted: false,
    policyStack,
    validationV18: {
      canonicalPath: CANONICAL_PATH,
      contentHash: certifiedEnvelope.contentHash,
      prePolicyContentHash: prePolicyEnvelope.contentHash,
      prePolicyImmutablePath: prepolicyImmutablePath.replace(/\\/g, "/"),
      certifiedImmutablePath: certifiedImmutablePath.replace(/\\/g, "/"),
      caseCount: correctedCases.length,
      prePolicyLayer2GoldPrimitiveCount: prePolicyL2,
      layer2GoldPrimitiveCount: certifiedL2,
      goldDenominator: certifiedL2,
      stratumCounts,
      bucketCounts,
      rc5FamilyCounts,
      taxonomyVersion: TAXONOMY_V14,
      taxonomyHash,
      sealed: true,
    },
    overlapGuarantees: {
      development: 0,
      v12: 0,
      v13: 0,
      v14: 0,
      v15: 0,
      v16: 0,
      v17: 0,
      blind: 0,
      rc3PositiveTraining: 0,
      rc3PolicyGuardrail: 0,
    },
    note: "Fresh validation v18 — parser-blind architectural strata. parserExecutionCount=0; no parser contact.",
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(selectionManifest, null, 2)).digest("hex");
  writeFileSync(
    resolve(OUT_DIR, "validation-v18-freeze-manifest-v152.json"),
    `${JSON.stringify({ ...selectionManifest, contentHash: manifestHash }, null, 2)}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v18-gold-policy-correction-report-v1.json"),
    `${JSON.stringify(
      {
        prePolicyHash: prePolicyEnvelope.contentHash,
        certifiedHash: certifiedEnvelope.contentHash,
        prePolicyL2,
        certifiedL2,
        removedInvalidGold: prePolicyL2 - certifiedL2,
        validation,
        prepolicyImmutablePath,
        certifiedImmutablePath,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        validationV18Hash: certifiedEnvelope.contentHash,
        prePolicyHash: prePolicyEnvelope.contentHash,
        prepolicyImmutablePath,
        certifiedImmutablePath,
        manifestHash,
        caseCount: correctedCases.length,
        prePolicyL2,
        certifiedL2,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        goldPolicyPass: validation.pass,
        parserExecutionCount: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
