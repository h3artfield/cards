/**
 * Build granted-classifier expansion v1.36 from golden catalog — parser-blind selection.
 * parserExecutionCount = 0 (no parser run in this script).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  loadGoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds, assertNoOracleIdOverlap } from "./lib/benchmark-oracle-id-exclusions";
import {
  assertAllBenchmarkIdentities,
  assertAllBenchmarkTargetValidities,
  type MachineGroundedBenchmarkTarget,
} from "./lib/benchmark-identity";
import {
  GRANT_GRAMMAR_FAMILIES,
  CONTEXT_CONTROL_QUERIES,
  extractGrammarFamilyTargets,
  extractContextControlTarget,
  catalogMatchesFamily,
  catalogMatchesContextControl,
  type GrammarFamily,
  type ContextControlKind,
} from "./lib/granted-grammar-family-query";

loadEnvLocal();

const OUT_CASES = "data/oracle-action-eval-granted-classifier-expansion-v136.json";
const OUT_MANIFEST = "data/milestones/rc3-development/granted-expansion-v136-selection-manifest.json";
const OUT_REGRESSION = "data/oracle-action-eval-granted-regression-v135-valid.json";

const CASES_PER_FAMILY = 4;
const V135_REGRESSION_ORACLE_IDS = new Set([
  "b5b4cf54-ed5e-42d0-9d98-5fec76b0b0b8", // Darksteel Plate
  "a02e1ca7-23c5-41e3-a744-72fc9e9dd8ba", // Fireshrieker
  "fd949f82-fc10-4e37-8aa9-6c7569fe3c55", // Akroma's Will
  "a5458de0-0f61-49a3-a013-d90f92559809", // Archetype of Imagination
  "86df1de7-967a-4420-847f-7a77d0217a15", // Holy Avenger
]);

const CONTEXT_CONTROLS_PER_KIND = 1;

export type GrantedExpansionCaseV136 = {
  id: string;
  category: string;
  layout?: string;
  oracleId: string;
  oracleText: string;
  cardName: string;
  expectedPrimitiveActions: [];
  expectedStructure: Record<string, never>;
  expectedRoles: [];
  coverageStratum: "granted_classifier_expansion_v136";
  expansionLabel: "positive_granted_region" | "context_control" | "hard_negative_surface";
  grammarFamily?: GrammarFamily;
  expectedContext: MachineGroundedBenchmarkTarget["expectedContext"];
  benchmarkTargets: MachineGroundedBenchmarkTarget[];
  goldenCatalogVersion: string;
  goldenOracleTextHash: string;
  evaluationLabelVersion: "granted-classifier-expansion-v136";
  taxonomyVersion: "benchmark-validation-split-v1";
  reviewer: "granted-expansion-v136-catalog-select";
  caseScope: "full_card";
  selectionRule: string;
  adjudicationStatus: "parser_blind_adjudicated";
  retiredFrom?: string;
};

function loadExclusions(): Set<string> {
  const excluded = loadExcludedOracleIds();
  for (const rel of [
    "data/oracle-action-eval-granted-classifier-expansion-v135.json",
    "data/oracle-action-eval-granted-negative-controls-v135.json",
    "data/oracle-action-eval-granted-regression-v135-valid.json",
  ]) {
    if (!existsSync(resolve(rel))) continue;
    for (const c of (JSON.parse(readFileSync(resolve(rel), "utf8")) as { cases: Array<{ oracleId: string }> }).cases) {
      excluded.add(c.oracleId);
    }
  }
  for (const id of V135_REGRESSION_ORACLE_IDS) excluded.add(id);
  return excluded;
}

function poolHash(cards: GoldenCatalogOracleCard[]): string {
  const payload = cards
    .map((c) => c.oracleId)
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

function queryCatalogPool(
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>,
  family: GrammarFamily,
  excluded: Set<string>,
): GoldenCatalogOracleCard[] {
  const def = GRANT_GRAMMAR_FAMILIES.find((f) => f.family === family)!;
  const matches: GoldenCatalogOracleCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    if (excluded.has(card.oracleId)) continue;
    const text = combinedGoldenOracleText(card);
    if (!def.catalogQuery.test(text)) continue;
    const targets = extractGrammarFamilyTargets(text, family);
    if (targets.length === 0) continue;
    matches.push(card);
  }
  matches.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  return matches;
}

function queryContextPool(
  catalog: Awaited<ReturnType<typeof loadGoldenCatalogIndex>>,
  kind: ContextControlKind,
  excluded: Set<string>,
): GoldenCatalogOracleCard[] {
  const matches: GoldenCatalogOracleCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    if (excluded.has(card.oracleId)) continue;
    const text = combinedGoldenOracleText(card);
    if (!catalogMatchesContextControl(text, kind)) continue;
    if (!extractContextControlTarget(text, kind)) continue;
    matches.push(card);
  }
  matches.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  return matches;
}

function buildCaseFromCard(input: {
  index: number;
  card: GoldenCatalogOracleCard;
  catalogVersion: string;
  grammarFamily?: GrammarFamily;
  expectedContext: MachineGroundedBenchmarkTarget["expectedContext"];
  benchmarkTargets: MachineGroundedBenchmarkTarget[];
  expansionLabel: GrantedExpansionCaseV136["expansionLabel"];
  category: string;
}): GrantedExpansionCaseV136 {
  const oracleText = combinedGoldenOracleText(input.card);
  const primary = input.benchmarkTargets[0]?.fullRegionSpan?.text ?? oracleText.slice(0, 80);
  return {
    id: `granted-exp-v136-${String(input.index).padStart(3, "0")}`,
    category: input.category,
    layout: input.card.layout ?? "normal",
    oracleId: input.card.oracleId,
    oracleText,
    cardName: input.card.canonicalName,
    expectedPrimitiveActions: [],
    expectedStructure: {},
    expectedRoles: [],
    coverageStratum: "granted_classifier_expansion_v136",
    expansionLabel: input.expansionLabel,
    grammarFamily: input.grammarFamily,
    expectedContext: input.expectedContext,
    benchmarkTargets: input.benchmarkTargets,
    goldenCatalogVersion: input.catalogVersion,
    goldenOracleTextHash: goldenOracleTextHash(oracleText),
    evaluationLabelVersion: "granted-classifier-expansion-v136",
    taxonomyVersion: "benchmark-validation-split-v1",
    reviewer: "granted-expansion-v136-catalog-select",
    caseScope: "full_card",
    selectionRule: primary,
    adjudicationStatus: "parser_blind_adjudicated",
  };
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExclusions();
  const usedOracleIds = new Set<string>();
  const cases: GrantedExpansionCaseV136[] = [];
  const familyManifest: Array<Record<string, unknown>> = [];
  let caseIndex = 1;

  for (const familyDef of GRANT_GRAMMAR_FAMILIES) {
    const pool = queryCatalogPool(catalog, familyDef.family, excluded);
    const available = pool.filter((c) => !usedOracleIds.has(c.oracleId));
    const selected = available.slice(0, CASES_PER_FAMILY);

    familyManifest.push({
      grammarFamily: familyDef.family,
      description: familyDef.description,
      catalogQuery: familyDef.catalogQuery.source,
      candidatePoolCount: pool.length,
      afterExclusionCount: available.length,
      selectedCount: selected.length,
      deterministicSelectionRule: `sort by oracleId ascending; take first ${CASES_PER_FAMILY} not in exclusion set`,
      candidatePoolHash: poolHash(pool),
      selectedOracleIds: selected.map((c) => c.oracleId),
      selectedCardNames: selected.map((c) => c.canonicalName),
    });

    for (const card of selected) {
      usedOracleIds.add(card.oracleId);
      const oracleText = combinedGoldenOracleText(card);
      const targets = extractGrammarFamilyTargets(oracleText, familyDef.family);
      cases.push(
        buildCaseFromCard({
          index: caseIndex++,
          card,
          catalogVersion: catalog.catalogVersion,
          grammarFamily: familyDef.family,
          expectedContext: "genuine_granted",
          benchmarkTargets: targets,
          expansionLabel: "positive_granted_region",
          category: `granted-expansion-${familyDef.family}`,
        }),
      );
    }
  }

  const contextManifest: Array<Record<string, unknown>> = [];
  for (const ctrl of CONTEXT_CONTROL_QUERIES) {
    const pool = queryContextPool(catalog, ctrl.kind, excluded);
    const available = pool.filter((c) => !usedOracleIds.has(c.oracleId));
    const selected = available.slice(0, CONTEXT_CONTROLS_PER_KIND);
    contextManifest.push({
      contextKind: ctrl.kind,
      description: ctrl.description,
      catalogQuery: ctrl.catalogQuery.source,
      candidatePoolCount: pool.length,
      selectedOracleIds: selected.map((c) => c.oracleId),
      candidatePoolHash: poolHash(pool),
    });
    for (const card of selected) {
      usedOracleIds.add(card.oracleId);
      const oracleText = combinedGoldenOracleText(card);
      const target = extractContextControlTarget(oracleText, ctrl.kind);
      if (!target) continue;
      cases.push(
        buildCaseFromCard({
          index: caseIndex++,
          card,
          catalogVersion: catalog.catalogVersion,
          expectedContext: target.expectedContext,
          benchmarkTargets: [target],
          expansionLabel: ctrl.kind === "hard_negative_surface" ? "hard_negative_surface" : "context_control",
          category: `granted-context-${ctrl.kind}`,
        }),
      );
    }
  }

  assertNoOracleIdOverlap(cases, excluded, "granted-expansion-v136");
  assertAllBenchmarkIdentities(catalog, cases, "granted-expansion-v136-identity");
  assertAllBenchmarkTargetValidities(catalog, cases, "granted-expansion-v136-target");

  const positiveRegions = cases
    .filter((c) => c.expectedContext === "genuine_granted")
    .reduce((n, c) => n + c.benchmarkTargets.length, 0);

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: "granted-expansion-v136-selection-manifest",
    parserExecutionCount: 0,
    selectionProtocol: [
      "grammar family definition",
      "catalog lexical/structural query (canonical oracle text only)",
      "candidate pool",
      "exclude development/v13/blind/v135-regression/v135-spent/v135-negatives",
      "deterministic sample (oracleId sort, first N)",
      "parser-blind span extraction + adjudication",
      "freeze gold",
    ],
    casesPerFamily: CASES_PER_FAMILY,
    grammarFamilies: familyManifest,
    contextControls: contextManifest,
    exclusionOracleIdCount: excluded.size,
    summary: {
      totalCases: cases.length,
      positiveGrantedCases: cases.filter((c) => c.expectedContext === "genuine_granted").length,
      positiveGrantedRegions: positiveRegions,
      contextControlCases: cases.filter((c) => c.expansionLabel === "context_control").length,
      hardNegativeSurfaceCases: cases.filter((c) => c.expansionLabel === "hard_negative_surface").length,
    },
    assertBenchmarkIdentity: "PASS",
    assertBenchmarkTargetValidity: "PASS",
  };

  const envelope = {
    generatedAt: new Date().toISOString(),
    setVersion: "granted-classifier-expansion-v136",
    caseCount: cases.length,
    contentHash: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
    parserExecutionCount: 0,
    manifestVersion: "granted-expansion-v136-selection-manifest",
    cases,
  };

  writeFileSync(resolve(OUT_CASES), `${JSON.stringify(envelope, null, 2)}\n`);
  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(resolve(OUT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  // Preserve v135 valid regression subset separately (not in v136 transfer)
  if (existsSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v135.json"))) {
    const v135 = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v135.json"), "utf8")) as {
      cases: Array<{ oracleId: string; id: string; cardName?: string }>;
    };
    const validNames = new Set([
      "Darksteel Plate",
      "Fireshrieker",
      "Akroma's Will",
      "Archetype of Imagination",
      "Holy Avenger",
    ]);
    const regression = v135.cases.filter((c) => validNames.has(c.cardName ?? ""));
    writeFileSync(
      resolve(OUT_REGRESSION),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          setVersion: "granted-regression-v135-valid",
          note: "v1.35 identity-valid subset — regression only, not transfer evidence",
          caseCount: regression.length,
          cases: regression,
        },
        null,
        2,
      )}\n`,
    );
  }

  console.log(JSON.stringify({ manifest: manifest.summary, assertBenchmarkIdentity: "PASS", assertBenchmarkTargetValidity: "PASS", parserExecutionCount: 0 }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
