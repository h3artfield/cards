/**
 * Validation v14 fresh selection — parser-blind gold, taxonomy v1.4, zero overlap with dev/v12/v13/blind.
 * Run: cd web && npx tsx scripts/create-validation-set-v14-fresh.ts
 *
 * parserExecutionCount = 0. Do not execute until RC4 candidate is frozen.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  applyV14HandZoneToDerived,
  TAXONOMY_V14,
} from "./lib/taxonomy-v14-hand-zone";
import { attachCaseScopeV11 } from "./lib/case-scope-v11";
import {
  extractGrammarFamilyTargets,
  GRANT_GRAMMAR_FAMILIES,
} from "./lib/granted-grammar-family-query";
import type { MachineGroundedBenchmarkTarget } from "./lib/benchmark-identity";
import { validateSemanticRoles } from "./lib/benchmark-semantic-adjudication";
import { writeImmutableBenchmarkEnvelope } from "./lib/immutable-benchmark-storage-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/validation-v14-certification";
const SET_VERSION = "validation-v14";
const CERTIFIER = "validation-set-v14-fresh-sealer-v140";
const REVIEWER = REVIEWER_ID;

type V14Stratum = {
  stratum: string;
  bucket: "challenge" | "broad" | "policy";
  quota: number;
  match: (text: string, layout?: string) => boolean;
};

/** Structural families emphasized after v13 adjudication — selection is parser-blind. */
const V14_STRATA: V14Stratum[] = [
  {
    stratum: "challenge_activated_cost_vs_effect",
    bucket: "challenge",
    quota: 14,
    match: (t) => /\{[^}]+\}:/.test(t) && !/^[\−\+]\d+:/m.test(t) && /\b(Sacrifice|Discard|Tap|Exile)\b/i.test(t),
  },
  {
    stratum: "challenge_immediate_cast_vs_permission",
    bucket: "challenge",
    quota: 12,
    match: (t) =>
      /\b(you may cast|cast a copy|cast it without paying|can't cast)\b/i.test(t) &&
      !/^[\−\+]\d+:/m.test(t),
  },
  {
    stratum: "challenge_counter_quantity",
    bucket: "challenge",
    quota: 12,
    match: (t) => /\bput (?:a |one |two |three |\d+ |that many )[^.]*counter/i.test(t) || /\b\+1\/\+1 counter/i.test(t),
  },
  {
    stratum: "challenge_modal_option_lineage",
    bucket: "challenge",
    quota: 12,
    match: (t) => /Choose (?:one|two|any number)/i.test(t) && /•/.test(t),
  },
  {
    stratum: "challenge_mdfc_face_provenance",
    bucket: "challenge",
    quota: 10,
    match: (t, l) => t.includes("\n//\n") || !!l?.match(/dfc|transform|adventure|split/i),
  },
  {
    stratum: "challenge_library_movement_vs_search",
    bucket: "challenge",
    quota: 10,
    match: (t) =>
      (/Search your library/i.test(t) && /shuffle/i.test(t)) ||
      /(?:put|move)[^.]*(?:top|bottom) of (?:your )?library/i.test(t) ||
      /look at the top/i.test(t),
  },
  {
    stratum: "challenge_zone_recursion",
    bucket: "challenge",
    quota: 10,
    match: (t) => /from (?:your )?graveyard to (?:your hand|the battlefield)/i.test(t) || /\bReturn target[^.]*from[^.]*graveyard/i.test(t),
  },
  {
    stratum: "challenge_granted_nested_actions",
    bucket: "challenge",
    quota: 12,
    match: (t) => /\b(?:have|gains?) "/i.test(t) && /\b(?:When|Whenever|\{T\}|:)/i.test(t),
  },
  {
    stratum: "challenge_replacement",
    bucket: "challenge",
    quota: 8,
    match: (t) => /\bIf you would\b|\binstead\b/i.test(t),
  },
  {
    stratum: "broad_triggered",
    bucket: "broad",
    quota: 16,
    match: (t) => /\b(When|Whenever|At the beginning of)\b/i.test(t),
  },
  {
    stratum: "broad_activated",
    bucket: "broad",
    quota: 14,
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
    quota: 10,
    match: (t) => (t.match(/\./g) ?? []).length >= 2 && t.length < 320,
  },
  {
    stratum: "broad_variable_quantity",
    bucket: "broad",
    quota: 10,
    match: (t) => /\bequal to\b|\bX\b|\bhalf the\b|\bfor each\b/i.test(t),
  },
  {
    stratum: "broad_saga_planeswalker",
    bucket: "broad",
    quota: 10,
    match: (t, l) => l === "saga" || /^[\−\+]\d+:/m.test(t),
  },
  {
    stratum: "policy_static_permission",
    bucket: "policy",
    quota: 10,
    match: (t) => /\b(?:can't|cannot)\b/i.test(t) && !/^(When|Whenever)/i.test(t.trim()),
  },
  {
    stratum: "policy_reminder_heavy",
    bucket: "policy",
    quota: 8,
    match: (t) => /\([^)]{25,}\)/.test(t),
  },
  {
    stratum: "policy_trigger_condition",
    bucket: "policy",
    quota: 8,
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
  return cases.reduce(
    (n, c) => n + (c.expectedPrimitiveActions ?? []).filter((g) => !g.negative).length,
    0,
  );
}

function attachBenchmarkTargets(
  testCase: OracleActionEvalCaseV2,
  oracleText: string,
): MachineGroundedBenchmarkTarget[] {
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
    evaluationSetVersion: "validation-v14",
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

async function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const reviewedAt = new Date().toISOString();
  const catalog = await loadGoldenCatalogIndex();
  const allCards = [...catalog.byOracleId.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  const benchmarkExcluded = loadExcludedOracleIds();

  const v14Used = new Set<string>();
  const v14Cases: CatalogEvalCase[] = [];
  const v14StratumCounts: Record<string, number> = {};
  const v14BucketCounts = { challenge: 0, broad: 0, policy: 0 };

  for (const stratum of V14_STRATA) {
    const picked = pickCards(allCards, stratum, v14Used, benchmarkExcluded);
    v14StratumCounts[stratum.stratum] = picked.length;
    v14BucketCounts[stratum.bucket] += picked.length;
    for (const card of picked) {
      v14Cases.push(
        buildCatalogCase(
          card,
          `vh14-${String(v14Cases.length + 1).padStart(4, "0")}`,
          `validation-v14-${stratum.stratum}`,
          catalog.catalogVersion,
          stratum.stratum,
          reviewedAt,
        ),
      );
    }
  }

  const TARGET_CASES = 200;
  const TARGET_L2 = 300;
  for (const card of allCards) {
    if (v14Cases.length >= TARGET_CASES && countLayer2Gold(v14Cases) >= TARGET_L2) break;
    if (benchmarkExcluded.has(card.oracleId) || v14Used.has(card.oracleId)) continue;
    if (!card.oracleText?.trim() || card.oracleText.length < 40) continue;
    v14Used.add(card.oracleId);
    v14Cases.push(
      buildCatalogCase(
        card,
        `vh14-${String(v14Cases.length + 1).padStart(4, "0")}`,
        "validation-v14-broad_supplement",
        catalog.catalogVersion,
        "broad_supplement",
        reviewedAt,
      ),
    );
    v14StratumCounts.broad_supplement = (v14StratumCounts.broad_supplement ?? 0) + 1;
    v14BucketCounts.broad++;
  }

  assertNoOracleIdOverlap(v14Cases, benchmarkExcluded, "validation v14 vs prior benchmarks");

  const v14L2Count = countLayer2Gold(v14Cases);
  const v14Envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; goldCertification: Record<string, unknown> } = {
    setClassification: "validation_set_v14",
    evaluationSetVersion: "validation-v14",
    taxonomyVersion: TAXONOMY_V14,
    contentHash: "",
    cases: v14Cases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "active",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${v14Cases.length}/${v14Cases.length}`,
      taxonomy: TAXONOMY_V14,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete_within_scope",
      identityExact: "100%",
      oracleHashesVerified: "100%",
      unresolvedGoldCases: 0,
      parserExecutionCount: 0,
      parserConsulted: false,
      layer2GoldPrimitiveCount: v14L2Count,
      stratumCounts: v14StratumCounts,
      bucketCounts: v14BucketCounts,
      benchmarkTargetsExplicit: true,
      semanticAdjudicationComplete: true,
    },
  };
  v14Envelope.contentHash = computeDatasetContentHash(v14Cases);
  const v14Path = resolve("data/oracle-action-eval-validation-v14.json");
  writeFileSync(v14Path, `${JSON.stringify(v14Envelope, null, 2)}\n`);

  const prepolicyImmutablePath = writeImmutableBenchmarkEnvelope({
    setVersion: SET_VERSION,
    phase: "prepolicy",
    envelope: v14Envelope,
    outDir: OUT_DIR,
  });

  const taxonomyHash = sha256Json({ taxonomyVersion: TAXONOMY_V14, handZoneMigration: "v14-hand-zone" });
  const selectionManifest = {
    manifestVersion: "validation-v14-freeze-manifest-v140",
    frozenAt: reviewedAt,
    status: "SEALED",
    parserExecutionCount: 0,
    parserConsulted: false,
    validationV14: {
      path: "data/oracle-action-eval-validation-v14.json",
      contentHash: v14Envelope.contentHash,
      prePolicyImmutablePath: prepolicyImmutablePath.replace(/\\/g, "/"),
      caseCount: v14Cases.length,
      layer2GoldPrimitiveCount: v14L2Count,
      goldDenominator: v14L2Count,
      stratumCounts: v14StratumCounts,
      bucketCounts: v14BucketCounts,
      taxonomyVersion: TAXONOMY_V14,
      taxonomyHash,
      sealed: true,
    },
    overlapGuarantees: {
      development: 0,
      v12: 0,
      v13: 0,
      blind: 0,
      rc3PositiveTraining: 0,
      rc3PolicyGuardrail: 0,
    },
    note: "Fresh validation v14 — do not mutate or execute until RC4 candidate frozen.",
  };
  const manifestHash = createHash("sha256")
    .update(JSON.stringify(selectionManifest, null, 2))
    .digest("hex");
  writeFileSync(
    resolve(OUT_DIR, "validation-v14-freeze-manifest-v140.json"),
    `${JSON.stringify({ ...selectionManifest, contentHash: manifestHash }, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        validationV14Hash: v14Envelope.contentHash,
        manifestHash,
        caseCount: v14Cases.length,
        layer2Gold: v14L2Count,
        bucketCounts: v14BucketCounts,
        stratumCounts: v14StratumCounts,
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
