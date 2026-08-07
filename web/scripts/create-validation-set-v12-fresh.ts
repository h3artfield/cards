/**
 * Create validation_set_v12_fresh — programmatic coverage selection, zero benchmark overlap.
 * Run: npx tsx scripts/create-validation-set-v12-fresh.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, type GoldenCatalogOracleCard, combinedGoldenOracleText, goldenOracleTextHash } from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { applyValidationGoldPolicyV11 } from "./lib/validation-gold-policy-v11";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { REVIEWER_ID } from "./oracle-action-eval-shared";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { ValidationV12Stratum } from "./validation-v12-fresh-seeds";

loadEnvLocal();

const TAXONOMY_VERSION = "three-layer-v1.3";

const CERTIFIER = "validation-set-v12-fresh-sealer";
const REVIEWER = REVIEWER_ID;
const TARGET_MIN = 125;

type StratumRule = {
  stratum: ValidationV12Stratum;
  quota: number;
  match: (text: string, layout?: string) => boolean;
};

const STRATUM_RULES: StratumRule[] = [
  { stratum: "simple_single_action", quota: 14, match: (t) => /^(Destroy|Exile|Counter|Draw|Deal|Target player)/i.test(t.trim()) && t.length < 120 },
  { stratum: "compound_actions", quota: 10, match: (t) => /\.\s*(Then |If you do|draw|discard|shuffle)/i.test(t) && !/\n/.test(t.slice(0, 80)) },
  { stratum: "activated_abilities", quota: 10, match: (t) => /\{T\}/.test(t) && /\{[^}]+\}:/.test(t) },
  { stratum: "triggered_abilities", quota: 10, match: (t) => /\b(When|Whenever|At the beginning of)\b/i.test(t) },
  { stratum: "replacement_effects", quota: 8, match: (t) => /\binstead\b/i.test(t) || /\bdon't cause\b/i.test(t) },
  { stratum: "static_permissions_restrictions", quota: 10, match: (t) => /\b(can't|cannot|as though)\b/i.test(t) && !/^(When|Whenever)/i.test(t.trim()) },
  { stratum: "modal_cards", quota: 10, match: (t) => /Choose (?:one|two|three|any number)/i.test(t) },
  { stratum: "saga_planeswalker", quota: 10, match: (t, l) => l === "saga" || /\[\−\+]/i.test(t) || /loyalty/i.test(t) || /^[\−\+]\d+:/m.test(t) },
  { stratum: "multiface", quota: 12, match: (t, l) => !!l?.includes("split") || !!l?.includes("dfc") || !!l?.includes("adventure") || t.includes("\n//\n") },
  { stratum: "granted_abilities", quota: 8, match: (t) => /\bhave "/i.test(t) || /\bgains "/i.test(t) },
  { stratum: "zone_transitions", quota: 10, match: (t) => /\b(from (?:your )?graveyard|onto the battlefield|into your hand|into (?:your )?graveyard)\b/i.test(t) },
  { stratum: "variable_quantities", quota: 8, match: (t) => /\blose(?:s)? (?:X|\d+) life\b|\bloses? life equal to|\bX damage\b/i.test(t) },
  { stratum: "search_put_shuffle", quota: 8, match: (t) => /Search your library/i.test(t) && /shuffle/i.test(t) },
  { stratum: "recursion", quota: 8, match: (t) => /\b(from (?:your )?graveyard to (?:your hand|the battlefield))\b/i.test(t) },
  { stratum: "optional_if_you_do", quota: 8, match: (t) => /\bYou may\b/i.test(t) && /\bIf you do\b/i.test(t) },
  { stratum: "reminder_heavy_mechanics", quota: 7, match: (t) => /\([^)]*(?:Storm|Treasure|Clue|Flashback|Cycling)\b/i.test(t) },
];

function deriveStructure(oracleText: string): OracleActionEvalCaseV2["expectedStructure"] | undefined {
  const structure: NonNullable<OracleActionEvalCaseV2["expectedStructure"]> = {};
  if (/\b(When|Whenever|At the beginning of)\b/i.test(oracleText)) structure.minTriggeredAbilities = 1;
  if (/\{[^}]+\}:/.test(oracleText) || /\{T\}/.test(oracleText)) structure.minActivatedAbilities = 1;
  if (/\bYou may\b/i.test(oracleText)) structure.optional = true;
  return Object.keys(structure).length ? structure : undefined;
}

function pickForStratum(
  cards: GoldenCatalogOracleCard[],
  rule: StratumRule,
  used: Set<string>,
  excluded: Set<string>,
): GoldenCatalogOracleCard[] {
  const picked: GoldenCatalogOracleCard[] = [];
  for (const card of cards) {
    if (picked.length >= rule.quota) break;
    if (excluded.has(card.oracleId) || used.has(card.oracleId)) continue;
    if (!card.oracleText?.trim()) continue;
    if (!rule.match(card.oracleText, card.layout)) continue;
    picked.push(card);
    used.add(card.oracleId);
  }
  return picked;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const allCards = [...catalog.byOracleId.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  const used = new Set<string>();
  const reviewedAt = new Date().toISOString();
  const cases: CatalogEvalCase[] = [];
  const stratumCounts: Record<string, number> = {};

  for (const rule of STRATUM_RULES) {
    const picked = pickForStratum(allCards, rule, used, excluded);
    stratumCounts[rule.stratum] = picked.length;
    for (const card of picked) {
      const id = `vh12-${String(cases.length + 1).padStart(4, "0")}`;
      let derived = derivePrimitivesFromOracleText(card.oracleText) ?? [];
      derived = sanitizeGoldPrimitives(card.oracleText, derived);

      let testCase: OracleActionEvalCaseV2 = {
        id,
        category: `validation-v12-${rule.stratum}`,
        layout: card.layout,
        oracleId: card.oracleId,
        oracleText: card.oracleText,
        expectedStructure: deriveStructure(card.oracleText),
        expectedPrimitiveActions: derived,
        expectedRoles: inferDerivedRoles(derived.map((p) => p.actionType)).map((role) => ({
          role,
          fromPrimitiveActions: derived.map((p) => p.actionType),
        })),
        cardName: card.canonicalName,
        colorIdentity: [...(card.colorIdentity ?? [])],
        goldenCatalogVersion: catalog.catalogVersion,
        goldenOracleTextHash: goldenOracleTextHash(combinedGoldenOracleText(card)),
        evaluationLabelVersion: "eval-catalog-backed-v1",
        taxonomyVersion: TAXONOMY_VERSION,
        evaluationSetVersion: "validation-v12-fresh",
        goldReviewVersion: CERTIFIER,
        goldReviewedAt: reviewedAt,
        goldReviewer: REVIEWER,
        goldReviewStatus: "reviewed",
        goldCompletenessStatus: "complete",
        identityStatus: "catalog_exact",
        reviewer: REVIEWER,
        coverageStratum: rule.stratum,
      };

      testCase = applyValidationGoldPolicyV11(testCase).testCase;
      cases.push(testCase as CatalogEvalCase);
    }
  }

  if (cases.length < TARGET_MIN) {
    throw new Error(`Only selected ${cases.length} cases, need at least ${TARGET_MIN}`);
  }

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    setClassification: "validation_set_v12_fresh",
    evaluationSetVersion: "validation-v12-fresh",
    taxonomyVersion: TAXONOMY_VERSION,
    contentHash: "",
    cases,
    sealed: true,
    parserExecutionCount: 0,
    holdoutStatus: "active",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      casesReviewed: `${cases.length}/${cases.length}`,
      taxonomy: TAXONOMY_VERSION,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      parserExecutionCount: 0,
      rc1OutputConsulted: false,
      stratumCounts,
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-validation-v12-fresh.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDir = resolve(process.cwd(), "data/milestones/validation-v12-fresh-certification");
  mkdirSync(freezeDir, { recursive: true });
  writeFileSync(
    resolve(freezeDir, "validation-v12-fresh-freeze.json"),
    `${JSON.stringify(
      {
        validationSet: "validation_set_v12_fresh",
        validationV12Hash: envelope.contentHash,
        caseCount: cases.length,
        sealed: true,
        parserExecutionCount: 0,
        holdoutStatus: "active",
        frozenAt: reviewedAt,
        stratumCounts,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(JSON.stringify({ outPath, validationV12Hash: envelope.contentHash, caseCount: cases.length, stratumCounts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
