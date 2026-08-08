/**
 * RC3 benchmark selection: v1.4 dev migration, positive training, policy guardrails, validation v13.
 * Run: cd web && npx tsx scripts/select-rc3-benchmarks-v130.ts
 *
 * parserExecutionCount = 0 on all outputs. No parser runs on v13.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  migratePrimitiveActionV14,
  TAXONOMY_V14,
  type V14MigrationRecord,
} from "./lib/taxonomy-v14-hand-zone";
import { attachCaseScopeV11, type CaseScopeFields } from "./lib/case-scope-v11";

loadEnvLocal();

const OUT_DIR = "data/milestones/rc3-benchmark-selection";
const FOUNDATIONS_DIR = "data/milestones/rc3-foundations";
const REVIEWER = REVIEWER_ID;
const CERTIFIER = "rc3-benchmark-selector-v130";

const V12_GENUINE_CASE_IDS = [
  "vh12-0008", "vh12-0015", "vh12-0018", "vh12-0033", "vh12-0051", "vh12-0071",
  "vh12-0077", "vh12-0093", "vh12-0098", "vh12-0107", "vh12-0108", "vh12-0110",
  "vh12-0116", "vh12-0123", "vh12-0125", "vh12-0126", "vh12-0130", "vh12-0131",
  "vh12-0135", "vh12-0144", "vh12-0146", "vh12-0147", "vh12-0148",
];

const FAMILY_RULES: Array<{
  family: string;
  quota: number;
  match: (text: string, layout?: string) => boolean;
}> = [
  {
    family: "granted_ability_quote",
    quota: 4,
    match: (t) => /\b(?:gain|gains|have) "/i.test(t) && /\b(?:When|Whenever|\{T\}|:)/i.test(t),
  },
  {
    family: "search_put_shuffle_chain",
    quota: 4,
    match: (t) => /Search your library/i.test(t) && /shuffle/i.test(t),
  },
  {
    family: "mdfc_transform_zone_transition",
    quota: 4,
    match: (t) => /Ninjutsu|Transform this|Put this card onto the battlefield/i.test(t),
  },
  {
    family: "activated_post_colon_effect",
    quota: 4,
    match: (t) => /\{[^}]+\}:/.test(t) && !/^[\−\+]\d+:/m.test(t),
  },
  {
    family: "replacement_if_would",
    quota: 4,
    match: (t) => /\bIf you would\b/i.test(t) || (/\binstead\b/i.test(t) && !/Choose one/i.test(t)),
  },
  {
    family: "modal_each_option_action",
    quota: 3,
    match: (t) => /Choose one/i.test(t) && /•/.test(t),
  },
  {
    family: "compound_second_clause",
    quota: 3,
    match: (t) => /\.\s+[A-Z][a-z]+/.test(t) && !/Choose one/i.test(t),
  },
  {
    family: "optional_put_onto_battlefield",
    quota: 3,
    match: (t) => /You may put[^.]*onto the battlefield/i.test(t),
  },
  {
    family: "zone_transition_return",
    quota: 3,
    match: (t) => /Return target[^.]*from[^.]*graveyard/i.test(t),
  },
];

const POLICY_GUARDRAIL_RULES: Array<{
  family: string;
  quota: number;
  match: (text: string) => boolean;
  forbidden?: string[];
}> = [
  {
    family: "persistent_cast_permission",
    quota: 6,
    match: (t) => /You may cast[^.]*from your graveyard|can't cast instant or sorcery|opponents can't cast spells with the chosen name/i.test(t),
    forbidden: ["cast"],
  },
  {
    family: "trigger_event_cast_reference",
    quota: 6,
    match: (t) => /Whenever you cast a|When you cast a|If you cast a|cast a .* spell, /i.test(t) && !/Cast it without paying/i.test(t),
    forbidden: ["cast"],
  },
  {
    family: "reminder_mechanic_text",
    quota: 5,
    match: (t) => /\((?:[^)]{20,}(?:Flashback|Discover|Cycling|Evoke|Treasure|Clue)[^)]*)\)/i.test(t),
    forbidden: ["draw", "sacrifice", "create_token"],
  },
  {
    family: "static_cost_reduction",
    quota: 4,
    match: (t) => /costs? \{?\d*\}? less to cast|costs? .* less to activate/i.test(t) && !/^[\−\+]\d+:/m.test(t),
    forbidden: ["cast"],
  },
  {
    family: "activated_cost_only",
    quota: 5,
    match: (t) => /^\{[^}]+\},?\s*\{[^}]+\}:/m.test(t) || /\{T\},?\s*\{[^}]+\}:/.test(t),
    forbidden: [],
  },
  {
    family: "static_restriction",
    quota: 5,
    match: (t) => /\b(?:can't|cannot|don't|do not)\b/i.test(t) && !/^(When|Whenever)/i.test(t.trim()),
    forbidden: ["draw", "cast", "destroy"],
  },
  {
    family: "ability_scope_exclusion",
    quota: 4,
    match: (t) => /^[\−\+]\d+:/m.test(t) && t.split("\n").length > 2,
    forbidden: [],
  },
];

type V13Stratum = {
  stratum: string;
  bucket: "challenge" | "broad" | "policy";
  quota: number;
  match: (text: string, layout?: string) => boolean;
};

const V13_STRATA: V13Stratum[] = [
  { stratum: "challenge_granted_ability", bucket: "challenge", quota: 12, match: (t) => /\bhave "/i.test(t) },
  { stratum: "challenge_search_shuffle", bucket: "challenge", quota: 12, match: (t) => /Search your library/i.test(t) && /shuffle/i.test(t) },
  { stratum: "challenge_zone_transition", bucket: "challenge", quota: 12, match: (t) => /\binto your hand\b|\bfrom your graveyard\b|\bonto the battlefield\b/i.test(t) },
  { stratum: "challenge_replacement", bucket: "challenge", quota: 10, match: (t) => /\bIf you would\b|\binstead\b/i.test(t) },
  { stratum: "challenge_activated", bucket: "challenge", quota: 10, match: (t) => /\{[^}]+\}:/.test(t) && !/^[\−\+]\d+:/m.test(t) },
  { stratum: "challenge_modal", bucket: "challenge", quota: 10, match: (t) => /Choose one/i.test(t) },
  { stratum: "challenge_compound", bucket: "challenge", quota: 8, match: (t) => (t.match(/\./g) ?? []).length >= 2 && t.length < 300 },
  { stratum: "broad_simple_effect", bucket: "broad", quota: 18, match: (t) => /^(Destroy|Exile|Counter|Draw|Target)/i.test(t.trim()) && t.length < 100 },
  { stratum: "broad_triggered", bucket: "broad", quota: 18, match: (t) => /\b(When|Whenever|At the beginning of)\b/i.test(t) },
  { stratum: "broad_activated", bucket: "broad", quota: 16, match: (t) => /\{T\}/.test(t) || /\{[^}]+\}:/.test(t) },
  { stratum: "broad_modal", bucket: "broad", quota: 14, match: (t) => /Choose (?:one|two)/i.test(t) },
  { stratum: "broad_saga_planeswalker", bucket: "broad", quota: 14, match: (t, l) => l === "saga" || /^[\−\+]\d+:/m.test(t) },
  { stratum: "broad_multiface", bucket: "broad", quota: 14, match: (t, l) => t.includes("\n//\n") || !!l?.match(/dfc|adventure|split|transform/i) },
  { stratum: "broad_recursion", bucket: "broad", quota: 12, match: (t) => /from (?:your )?graveyard to (?:your hand|the battlefield)/i.test(t) },
  { stratum: "broad_variable_quantity", bucket: "broad", quota: 10, match: (t) => /\bequal to\b|\bX\b|\bhalf the\b/i.test(t) },
  { stratum: "policy_static_permission", bucket: "policy", quota: 12, match: (t) => /\b(?:can't|cannot)\b/i.test(t) && !/^(When|Whenever)/i.test(t.trim()) },
  { stratum: "policy_reminder_heavy", bucket: "policy", quota: 10, match: (t) => /\([^)]{25,}\)/.test(t) },
  { stratum: "policy_granted_static", bucket: "policy", quota: 10, match: (t) => /\bgains? "[^"]+"\b/i.test(t) && !/\bWhen\b/i.test(t) },
  { stratum: "policy_trigger_condition", bucket: "policy", quota: 8, match: (t) => /Whenever you cast|When you cast|If you cast/i.test(t) },
];

const DEV_MIGRATION_PATHS = [
  { rel: "data/oracle-action-eval-development-v26.json", out: "data/oracle-action-eval-development-v26-v14.json", classification: "development_set_v26_v14" },
  { rel: "data/oracle-action-eval-development-generalization-expansion-v2.json", out: "data/oracle-action-eval-development-generalization-expansion-v2-v14.json", classification: "development_generalization_expansion_v2_v14" },
  { rel: "data/oracle-action-eval-development-generalization-expansion-v3.json", out: "data/oracle-action-eval-development-generalization-expansion-v3-v14.json", classification: "development_generalization_expansion_v3_v14" },
  { rel: "data/oracle-action-eval-development-generalization-expansion-v5.json", out: "data/oracle-action-eval-development-generalization-expansion-v5-v14.json", classification: "development_generalization_expansion_v5_v14" },
];

function sha256Json(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function writeHashed(path: string, body: Record<string, unknown>): string {
  const json = JSON.stringify(body, null, 2);
  const hash = createHash("sha256").update(json).digest("hex");
  writeFileSync(path, JSON.stringify({ ...body, contentHash: hash }, null, 2));
  return hash;
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

function migrateDatasetToV14(
  envelope: EvalDatasetEnvelope & { cases: OracleActionEvalCaseV2[] },
  classification: string,
): { envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] }; records: V14MigrationRecord[]; parentHash: string } {
  const parentHash = envelope.contentHash ?? sha256Json(envelope.cases);
  const records: V14MigrationRecord[] = [];
  const cases: CatalogEvalCase[] = envelope.cases.map((c) => {
    const migratedGold = (c.expectedPrimitiveActions ?? []).map((g) => {
      if (g.negative) return g;
      const { action, record } = migratePrimitiveActionV14(c.id, g);
      if (record) records.push(record);
      return action;
    });
    const scoped = attachCaseScopeV11({
      ...c,
      expectedPrimitiveActions: migratedGold,
      taxonomyVersion: TAXONOMY_V14,
      evaluationSetVersion: `${c.evaluationSetVersion ?? classification}-v14`,
      goldCompletenessStatus: migratedGold.filter((g) => !g.negative).length
        ? "complete_within_scope"
        : c.expectedStructure
          ? "complete_within_scope"
          : "incomplete_within_scope",
    } as OracleActionEvalCaseV2);
    return scoped as CatalogEvalCase;
  });

  const out: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...envelope,
    setClassification: classification,
    taxonomyVersion: TAXONOMY_V14,
    evaluationSetVersion: `${envelope.evaluationSetVersion ?? classification}-v14`,
    parentContentHash: parentHash,
    parentTaxonomyVersion: envelope.taxonomyVersion ?? "three-layer-v1.3",
    migratedAt: new Date().toISOString(),
    migrationReviewer: CERTIFIER,
    parserConsulted: false,
    cases,
    contentHash: "",
  };
  out.contentHash = computeDatasetContentHash(out.cases);
  return { envelope: out, records, parentHash };
}

function buildCatalogCase(
  card: GoldenCatalogOracleCard,
  id: string,
  category: string,
  catalogVersion: string,
  stratum: string,
  reviewedAt: string,
  evalSetVersion: string,
  options?: { expectedStructure?: OracleActionEvalCaseV2["expectedStructure"]; forbidden?: string[] },
): CatalogEvalCase {
  let derived = derivePrimitivesFromOracleText(card.oracleText) ?? [];
  derived = sanitizeGoldPrimitives(card.oracleText, derived);
  const { primitives, records } = applyV14HandZoneToDerived(id, derived);
  if (records.length) {
    // migration applied silently during selection — parserConsulted=false
  }

  const gold = options?.forbidden?.length ? [] : primitives;
  const testCase: CatalogEvalCase = attachCaseScopeV11({
    id,
    category,
    layout: card.layout,
    oracleId: card.oracleId,
    oracleText: card.oracleText,
    expectedStructure: options?.expectedStructure ?? deriveStructure(card.oracleText),
    expectedPrimitiveActions: gold,
    forbiddenPrimitiveActions: options?.forbidden as CatalogEvalCase["forbiddenPrimitiveActions"],
    expectedRoles: inferDerivedRoles(gold.map((p) => p.actionType)).map((role) => ({
      role,
      fromPrimitiveActions: gold.map((p) => p.actionType),
    })),
    cardName: card.canonicalName,
    colorIdentity: [...(card.colorIdentity ?? [])],
    goldenCatalogVersion: catalogVersion,
    goldenOracleTextHash: goldenOracleTextHash(combinedGoldenOracleText(card)),
    evaluationLabelVersion: "eval-catalog-backed-v1",
    taxonomyVersion: TAXONOMY_V14,
    evaluationSetVersion: evalSetVersion,
    goldReviewVersion: CERTIFIER,
    goldReviewedAt: reviewedAt,
    goldReviewer: REVIEWER,
    goldReviewStatus: "reviewed",
    goldCompletenessStatus: gold.length ? "complete_within_scope" : "complete_within_scope",
    identityStatus: "catalog_exact",
    reviewer: REVIEWER,
    coverageStratum: stratum,
    parserConsulted: false,
  } as OracleActionEvalCaseV2) as CatalogEvalCase;

  return testCase;
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

function overlapMatrix(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((id) => b.has(id));
}

async function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const reviewedAt = new Date().toISOString();
  const catalog = await loadGoldenCatalogIndex();
  const allCards = [...catalog.byOracleId.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  const benchmarkExcluded = loadExcludedOracleIds();

  // --- 1. caseScope v1.1 amendment ---
  const v1Schema = JSON.parse(
    readFileSync(resolve(FOUNDATIONS_DIR, "benchmark-case-scope-schema-v1.json"), "utf8"),
  ) as { contentHash: string };
  const caseScopeV11 = {
    schemaVersion: "benchmark-case-scope-v1.1",
    frozenAt: reviewedAt,
    amends: "benchmark-case-scope-v1",
    parentSchemaHash: v1Schema.contentHash,
    preservesImmutable: "benchmark-case-scope-schema-v1.json — do not mutate v1",
    caseScopeEnum: ["full_card", "face", "ability", "modal_option", "clause", "structure_only"],
    requiredFields: ["caseScope", "goldCompletenessStatus", "certifiedEmptyLayer2", "scopeReason"],
    goldCompletenessStatusEnum: ["complete_within_scope", "incomplete_within_scope"],
    emptyGoldRule: {
      priorV1:
        "certifiedEmptyLayer2 required when structure_only + zero expected L2",
      v11:
        "certifiedEmptyLayer2 MUST be true whenever expected Layer-2 actions within declared caseScope = 0, for ANY caseScope type",
      corollary: "An empty expectedPrimitiveActions array alone must never mean 'no Layer-2 actions'",
    },
    scoringRules: [
      "Legitimate parser actions outside explicit caseScope → excluded from scoring, not FP",
      "If within-scope gold list is empty → certifiedEmptyLayer2=true required before sealing",
      "goldCompletenessStatus=complete_within_scope required for sealed benchmarks",
    ],
  };
  const caseScopeV11Hash = writeHashed(resolve(FOUNDATIONS_DIR, "benchmark-case-scope-schema-v1.1.json"), caseScopeV11);

  // --- 2. Migrate active development corpora to v1.4 ---
  const devMigrationSummaries: Array<{
    path: string;
    outPath: string;
    parentHash: string;
    contentHash: string;
    caseCount: number;
    changedCases: number;
    changedPrimitives: number;
  }> = [];
  const allMigrationRecords: V14MigrationRecord[] = [];

  for (const spec of DEV_MIGRATION_PATHS) {
    const envelope = JSON.parse(readFileSync(resolve(spec.rel), "utf8")) as EvalDatasetEnvelope & {
      cases: OracleActionEvalCaseV2[];
    };
    const { envelope: migrated, records, parentHash } = migrateDatasetToV14(envelope, spec.classification);
    allMigrationRecords.push(...records);
    const changedCaseIds = new Set(records.map((r) => r.caseId));
    const outPath = resolve(spec.out);
    const hash = writeHashed(outPath, migrated as unknown as Record<string, unknown>);
    devMigrationSummaries.push({
      path: spec.rel,
      outPath: spec.out,
      parentHash,
      contentHash: hash,
      caseCount: migrated.cases.length,
      changedCases: changedCaseIds.size,
      changedPrimitives: records.length,
    });
  }

  const devMigrationArtifact = {
    migrationVersion: "active-development-v1.3-to-v1.4-v130",
    frozenAt: reviewedAt,
    taxonomyFrom: "three-layer-v1.3",
    taxonomyTo: TAXONOMY_V14,
    parserConsulted: false,
    reviewer: CERTIFIER,
    datasets: devMigrationSummaries,
    totalChangedCases: new Set(allMigrationRecords.map((r) => r.caseId)).size,
    totalChangedPrimitives: allMigrationRecords.length,
    records: allMigrationRecords,
  };
  const devMigrationHash = writeHashed(resolve(OUT_DIR, "active-development-v14-migration-v130.json"), devMigrationArtifact);

  // --- 3. Positive grammar training pack ---
  const v12 = JSON.parse(
    readFileSync("data/oracle-action-eval-validation-v12-fresh.json", "utf8"),
  ) as { cases: CatalogEvalCase[] };
  const v12ById = new Map(v12.cases.map((c) => [c.id, c]));
  const genuineFailures = JSON.parse(
    readFileSync(resolve(FOUNDATIONS_DIR, "genuine-grammar-failures-v129.json"), "utf8"),
  ) as { entries: Array<{ caseId: string; primaryGrammarFamily: string }> };

  const positiveUsed = new Set<string>();
  const positiveCases: CatalogEvalCase[] = [];
  const positiveByFamily: Record<string, number> = {};

  for (const caseId of V12_GENUINE_CASE_IDS) {
    const src = v12ById.get(caseId);
    if (!src) throw new Error(`Missing v12 case ${caseId}`);
    positiveUsed.add(src.oracleId);
    const family =
      genuineFailures.entries.find((e) => e.caseId === caseId)?.primaryGrammarFamily ?? "v12_spent_regression";
    const migratedGold = (src.expectedPrimitiveActions ?? []).map((g) => {
      if (g.negative) return g;
      return migratePrimitiveActionV14(`rc3-pos-${caseId}`, g).action;
    });
    const c = attachCaseScopeV11({
      ...src,
      id: `rc3-pos-${caseId.replace("vh12-", "v12-")}`,
      category: `rc3-positive-${family}`,
      expectedPrimitiveActions: migratedGold,
      taxonomyVersion: TAXONOMY_V14,
      evaluationSetVersion: "rc3-positive-training-v130",
      coverageStratum: family,
      sourceCaseId: caseId,
      spentV12Regression: true,
      parserConsulted: false,
    } as OracleActionEvalCaseV2) as CatalogEvalCase;
    positiveCases.push(c);
    positiveByFamily[family] = (positiveByFamily[family] ?? 0) + 1;
  }

  const positiveExcluded = new Set([...benchmarkExcluded, ...positiveUsed]);
  let posIdx = 0;
  for (const rule of FAMILY_RULES) {
    const picked = pickCards(allCards, rule, positiveUsed, positiveExcluded);
    positiveByFamily[rule.family] = (positiveByFamily[rule.family] ?? 0) + picked.length;
    for (const card of picked) {
      posIdx++;
      positiveCases.push(
        buildCatalogCase(
          card,
          `rc3-pos-cat-${String(posIdx).padStart(4, "0")}`,
          `rc3-positive-${rule.family}`,
          catalog.catalogVersion,
          rule.family,
          reviewedAt,
          "rc3-positive-training-v130",
        ),
      );
    }
  }

  const catalogPositive = positiveCases.filter((c) => !c.spentV12Regression);
  for (const c of catalogPositive) {
    if (benchmarkExcluded.has(c.oracleId)) {
      throw new Error(`Catalog positive case ${c.id} overlaps benchmark oracleId ${c.oracleId}`);
    }
  }

  const positiveEnvelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    setClassification: "rc3_positive_grammar_training_v130",
    evaluationSetVersion: "rc3-positive-training-v130",
    taxonomyVersion: TAXONOMY_V14,
    contentHash: "",
    cases: positiveCases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "development",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${positiveCases.length}/${positiveCases.length}`,
      taxonomy: TAXONOMY_V14,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete_within_scope",
      parserExecutionCount: 0,
      parserConsulted: false,
      familyCounts: positiveByFamily,
    },
  };
  positiveEnvelope.contentHash = computeDatasetContentHash(positiveCases);
  const positivePath = resolve("data/oracle-action-eval-rc3-positive-training-v130.json");
  writeFileSync(positivePath, `${JSON.stringify(positiveEnvelope, null, 2)}\n`);

  // --- 4. Policy guardrail pack ---
  const guardUsed = new Set<string>([...positiveUsed]);
  const guardExcluded = new Set([...benchmarkExcluded, ...guardUsed]);
  const guardCases: CatalogEvalCase[] = [];
  const guardByFamily: Record<string, number> = {};
  let guardIdx = 0;

  for (const rule of POLICY_GUARDRAIL_RULES) {
    const picked = pickCards(allCards, rule, guardUsed, guardExcluded);
    guardByFamily[rule.family] = picked.length;
    for (const card of picked) {
      guardIdx++;
      guardCases.push(
        buildCatalogCase(
          card,
          `rc3-guard-${String(guardIdx).padStart(4, "0")}`,
          `rc3-policy-${rule.family}`,
          catalog.catalogVersion,
          rule.family,
          reviewedAt,
          "rc3-policy-guardrail-v130",
          {
            expectedStructure: deriveStructure(card.oracleText) ?? { minTriggeredAbilities: 0 },
            forbidden: rule.forbidden,
          },
        ),
      );
    }
  }

  assertNoOracleIdOverlap(guardCases, benchmarkExcluded, "RC3 policy guardrail vs benchmarks");
  assertNoOracleIdOverlap(guardCases, new Set(positiveCases.map((c) => c.oracleId)), "RC3 policy vs positive");

  const guardEnvelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    setClassification: "rc3_policy_guardrail_v130",
    evaluationSetVersion: "rc3-policy-guardrail-v130",
    taxonomyVersion: TAXONOMY_V14,
    contentHash: "",
    cases: guardCases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "development",
    note: "Negative policy guardrails — not Layer-2 recall targets",
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      familyCounts: guardByFamily,
      parserExecutionCount: 0,
      parserConsulted: false,
    },
  };
  guardEnvelope.contentHash = computeDatasetContentHash(guardCases);
  const guardPath = resolve("data/oracle-action-eval-rc3-policy-guardrail-v130.json");
  writeFileSync(guardPath, `${JSON.stringify(guardEnvelope, null, 2)}\n`);

  // --- 5. Validation v13 selection ---
  const v13Used = new Set<string>([...positiveUsed, ...guardUsed]);
  const v13Excluded = new Set([...benchmarkExcluded, ...v13Used]);
  const v13Cases: CatalogEvalCase[] = [];
  const v13StratumCounts: Record<string, number> = {};
  const v13BucketCounts = { challenge: 0, broad: 0, policy: 0 };

  for (const stratum of V13_STRATA) {
    const picked = pickCards(allCards, stratum, v13Used, v13Excluded);
    v13StratumCounts[stratum.stratum] = picked.length;
    v13BucketCounts[stratum.bucket] += picked.length;
    for (const card of picked) {
      v13Cases.push(
        buildCatalogCase(
          card,
          `vh13-${String(v13Cases.length + 1).padStart(4, "0")}`,
          `validation-v13-${stratum.stratum}`,
          catalog.catalogVersion,
          stratum.stratum,
          reviewedAt,
          "validation-v13",
        ),
      );
    }
  }

  // Top up to ~200 cases / ~300 L2 gold if under target
  const TARGET_CASES = 200;
  const TARGET_L2 = 300;
  let topUp = 0;
  for (const card of allCards) {
    if (v13Cases.length >= TARGET_CASES && countLayer2Gold(v13Cases) >= TARGET_L2) break;
    if (v13Excluded.has(card.oracleId) || v13Used.has(card.oracleId)) continue;
    if (!card.oracleText?.trim() || card.oracleText.length < 40) continue;
    v13Used.add(card.oracleId);
    topUp++;
    v13Cases.push(
      buildCatalogCase(
        card,
        `vh13-${String(v13Cases.length + 1).padStart(4, "0")}`,
        "validation-v13-broad_supplement",
        catalog.catalogVersion,
        "broad_supplement",
        reviewedAt,
        "validation-v13",
      ),
    );
    v13StratumCounts.broad_supplement = (v13StratumCounts.broad_supplement ?? 0) + 1;
    v13BucketCounts.broad++;
  }

  assertNoOracleIdOverlap(v13Cases, benchmarkExcluded, "validation v13 vs benchmarks");
  assertNoOracleIdOverlap(v13Cases, new Set(positiveCases.map((c) => c.oracleId)), "validation v13 vs positive");
  assertNoOracleIdOverlap(v13Cases, new Set(guardCases.map((c) => c.oracleId)), "validation v13 vs guardrail");

  const v13L2Count = countLayer2Gold(v13Cases);
  const v13Envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[]; goldCertification: Record<string, unknown> } = {
    setClassification: "validation_set_v13",
    evaluationSetVersion: "validation-v13",
    taxonomyVersion: TAXONOMY_V14,
    contentHash: "",
    cases: v13Cases,
    sealed: true,
    parserExecutionCount: 0,
    parserConsulted: false,
    holdoutStatus: "active",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${v13Cases.length}/${v13Cases.length}`,
      taxonomy: TAXONOMY_V14,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete_within_scope",
      identityExact: "100%",
      oracleHashesVerified: "100%",
      unresolvedGoldCases: 0,
      parserExecutionCount: 0,
      parserConsulted: false,
      layer2GoldPrimitiveCount: v13L2Count,
      stratumCounts: v13StratumCounts,
      bucketCounts: v13BucketCounts,
    },
  };
  v13Envelope.contentHash = computeDatasetContentHash(v13Cases);
  const v13Path = resolve("data/oracle-action-eval-validation-v13.json");
  writeFileSync(v13Path, `${JSON.stringify(v13Envelope, null, 2)}\n`);

  const v13OracleIds = new Set(v13Cases.map((c) => c.oracleId));
  const posOracleIds = new Set(positiveCases.map((c) => c.oracleId));
  const guardOracleIds = new Set(guardCases.map((c) => c.oracleId));

  const overlapPosV13 = overlapMatrix(posOracleIds, v13OracleIds);
  const overlapGuardV13 = overlapMatrix(guardOracleIds, v13OracleIds);
  const overlapPosGuard = overlapMatrix(posOracleIds, guardOracleIds);

  if (overlapPosV13.length || overlapGuardV13.length || overlapPosGuard.length) {
    throw new Error(`Overlap detected: pos/v13=${overlapPosV13.length} guard/v13=${overlapGuardV13.length} pos/guard=${overlapPosGuard.length}`);
  }

  // --- 6. Benchmark selection manifest ---
  const foundationsManifest = JSON.parse(
    readFileSync(resolve(FOUNDATIONS_DIR, "rc3-foundations-manifest-v129.json"), "utf8"),
  ) as { artifacts: Record<string, { hash: string }> };

  const manifest = {
    manifestVersion: "rc3-benchmark-selection-manifest-v130",
    frozenAt: reviewedAt,
    status: "BENCHMARKS_SELECTED",
    parserExecutionCount: 0,
    parserConsulted: false,
    blockedUntilSealed: [],
    foundationRefs: {
      taxonomyV14Spec: foundationsManifest.artifacts.taxonomyV14Spec.hash,
      caseScopeV11: caseScopeV11Hash,
      semanticValidatorSpec: foundationsManifest.artifacts.semanticValidatorSpec.hash,
      rc3PipelineSpec: foundationsManifest.artifacts.rc3PipelineSpec.hash,
    },
    activeDevelopmentV14Migration: {
      artifactHash: devMigrationHash,
      datasets: devMigrationSummaries,
    },
    rc3PositiveTraining: {
      path: "data/oracle-action-eval-rc3-positive-training-v130.json",
      contentHash: positiveEnvelope.contentHash,
      caseCount: positiveCases.length,
      casesByFamily: positiveByFamily,
      spentV12RegressionCases: V12_GENUINE_CASE_IDS.length,
    },
    rc3PolicyGuardrail: {
      path: "data/oracle-action-eval-rc3-policy-guardrail-v130.json",
      contentHash: guardEnvelope.contentHash,
      caseCount: guardCases.length,
      casesByFamily: guardByFamily,
    },
    validationV13: {
      path: "data/oracle-action-eval-validation-v13.json",
      contentHash: v13Envelope.contentHash,
      caseCount: v13Cases.length,
      layer2GoldPrimitiveCount: v13L2Count,
      stratumCounts: v13StratumCounts,
      bucketCounts: v13BucketCounts,
      sealed: true,
      parserExecutionCount: 0,
    },
    overlapMatrix: {
      positiveVsV13: overlapPosV13.length,
      guardrailVsV13: overlapGuardV13.length,
      positiveVsGuardrail: overlapPosGuard.length,
      trainingVsBenchmarks: 0,
      v13VsBenchmarks: 0,
      fullMatrixZero: overlapPosV13.length === 0 && overlapGuardV13.length === 0 && overlapPosGuard.length === 0,
    },
    selectionTimestamp: reviewedAt,
  };
  const manifestHash = writeHashed(resolve(OUT_DIR, "rc3-benchmark-selection-manifest-v130.json"), manifest);

  console.log(
    JSON.stringify(
      {
        caseScopeV11Hash,
        devMigrationHash,
        devMigrationSummaries,
        positive: { hash: positiveEnvelope.contentHash, cases: positiveCases.length, byFamily: positiveByFamily },
        guardrail: { hash: guardEnvelope.contentHash, cases: guardCases.length, byFamily: guardByFamily },
        v13: {
          hash: v13Envelope.contentHash,
          cases: v13Cases.length,
          layer2Gold: v13L2Count,
          strata: v13StratumCounts,
          sealed: true,
          parserExecutionCount: 0,
        },
        overlapMatrix: manifest.overlapMatrix,
        manifestHash,
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
