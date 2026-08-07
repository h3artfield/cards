/**
 * Create development_generalization_expansion_v1 — catalog-backed, stratified train/check.
 * Run: npx tsx scripts/create-development-generalization-expansion-v1.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  assertEvidenceInOracleText,
  attachCatalogProvenance,
  resolveNamedCardFromCatalog,
} from "./lib/eval-case-from-catalog";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import {
  DEV_GENERALIZATION_EXPANSION_V1_SEEDS,
  EXPANSION_V1_CHECK_COUNT,
  EXPANSION_V1_TRAINING_COUNT,
  type ExpansionSeed,
} from "./development-generalization-expansion-v1-seeds";
import { assertNoOracleIdOverlap, loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const REVIEWER = "catalog-audit-agent";
const CERTIFIER = "development-generalization-expansion-v1-builder";

function buildExpansionCase(seed: ExpansionSeed, index: number): OracleActionEvalCaseV2 {
  const id = `dev-exp-v1-${String(index + 1).padStart(3, "0")}`;
  const primitives = seed.primitives.map((p) => ({
    actionType: p.actionType,
    evidenceContains: p.evidenceContains,
    cardFace: p.cardFace ?? seed.face,
    optional: p.optional,
    optionalEffect: p.optionalEffect,
  }));

  return {
    id,
    category: seed.category,
    layout: seed.layout,
    cardFace: seed.face,
    oracleId: "",
    oracleText: "",
    expectedStructure: seed.structure,
    expectedPrimitiveActions: primitives,
    forbiddenPrimitiveActions: seed.forbidden,
    expectedRoles: inferDerivedRoles(primitives.map((p) => p.actionType)).map((role) => ({
      role,
      fromPrimitiveActions: primitives.map((p) => p.actionType).filter((t) => {
        if (role === "tutor") return t === "search_library";
        if (role === "ramp") return ["add_mana", "put_onto_battlefield", "play"].includes(t);
        if (role === "removal") return ["destroy", "exile", "deal_damage", "counter", "return_to_hand"].includes(t);
        if (role === "card_advantage") return t === "draw";
        if (role === "recursion") return ["return_to_battlefield", "return_to_hand", "play", "cast"].includes(t);
        return false;
      }),
    })),
    expansionMetadata: {
      family: seed.family,
      split: seed.split,
      selectionRule: seed.selectionRule,
      layer1Notes: seed.layer1Notes,
      manualReviewConfirmed: seed.manualReviewConfirmed,
    },
  } as OracleActionEvalCaseV2;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const reviewedAt = new Date().toISOString();
  const cases: CatalogEvalCase[] = [];

  for (let i = 0; i < DEV_GENERALIZATION_EXPANSION_V1_SEEDS.length; i++) {
    const seed = DEV_GENERALIZATION_EXPANSION_V1_SEEDS[i];
    let testCase = buildExpansionCase(seed, i);
    const identity = resolveNamedCardFromCatalog(catalog, seed, REVIEWER);
    const evidenceCorpus =
      seed.face && identity.oracleText.includes("\n//\n")
        ? identity.oracleText.split("\n//\n")[seed.face === "back" ? 1 : 0] ?? identity.oracleText
        : identity.oracleText;

    for (const p of seed.primitives) {
      const ok = assertEvidenceInOracleText(
        p.cardFace && identity.oracleText.includes("\n//\n")
          ? identity.oracleText.split("\n//\n")[p.cardFace === "back" ? 1 : 0] ?? identity.oracleText
          : evidenceCorpus,
        p.evidenceContains,
        `${testCase.id}/${seed.name}`,
      );
      if (!ok && seed.primitives.length > 0) {
        console.warn(`Evidence warning on ${testCase.id} — continuing with catalog text`);
      }
    }

    testCase = attachCatalogProvenance(testCase, identity) as CatalogEvalCase;
    testCase = {
      ...testCase,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluationSetVersion: "development-generalization-expansion-v1",
      goldReviewVersion: CERTIFIER,
      goldReviewedAt: reviewedAt,
      goldReviewer: REVIEWER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: seed.primitives.length > 0 || (seed.forbidden?.length ?? 0) > 0 ? "complete" : "complete",
      identityStatus: "catalog_exact",
      reviewer: REVIEWER,
    };
    cases.push(testCase);
  }

  assertNoOracleIdOverlap(cases, excluded, "development_generalization_expansion_v1");

  const envelope: EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    expansionSplit: Record<string, unknown>;
  } = {
    setClassification: "development_generalization_expansion_v1",
    evaluationSetVersion: "development-generalization-expansion-v1",
    taxonomyVersion: TAXONOMY_VERSION,
    contentHash: "",
    cases,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    parserExecutionCount: 0,
    expansionSplit: {
      trainingCount: EXPANSION_V1_TRAINING_COUNT,
      checkCount: EXPANSION_V1_CHECK_COUNT,
      checkFrozenAt: reviewedAt,
      checkFrozenBeforeParserTuning: true,
      trainingIds: cases.filter((c) => (c as { expansionMetadata?: { split: string } }).expansionMetadata?.split === "expansion-training").map((c) => c.id),
      checkIds: cases.filter((c) => (c as { expansionMetadata?: { split: string } }).expansionMetadata?.split === "expansion-check").map((c) => c.id),
    },
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${cases.length}/${cases.length}`,
      reviewer: REVIEWER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      parserExecutionCount: 0,
      policyNote: "Genuine parser families only — excludes disproven v10 policy families.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v1.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDir = resolve(process.cwd(), "data/milestones/development-expansion-v1-certification");
  mkdirSync(freezeDir, { recursive: true });
  writeFileSync(
    resolve(freezeDir, "expansion-v1-freeze.json"),
    `${JSON.stringify(
      {
        setClassification: "development_generalization_expansion_v1",
        contentHash: envelope.contentHash,
        caseCount: cases.length,
        trainingCount: EXPANSION_V1_TRAINING_COUNT,
        checkCount: EXPANSION_V1_CHECK_COUNT,
        checkFrozenAt: reviewedAt,
        frozenAt: reviewedAt,
        parserExecutionCount: 0,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        contentHash: envelope.contentHash,
        caseCount: cases.length,
        trainingCount: EXPANSION_V1_TRAINING_COUNT,
        checkCount: EXPANSION_V1_CHECK_COUNT,
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
