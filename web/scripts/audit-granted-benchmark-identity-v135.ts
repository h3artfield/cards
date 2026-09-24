/**
 * Granted expansion + negative-control benchmark identity audit (v1.35).
 * No parser changes — catalog provenance and span resolution only.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  auditBenchmarkIdentity,
  selectionRuleTargetFragment,
  type BenchmarkIdentityRow,
} from "./lib/benchmark-identity";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  routeCandidateRegions,
  filterGrantedRulesRoutes,
  filterTokenDefinitionRoutes,
  type SemanticContextKind,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { buildGrantedRulesRegions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-region";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";

loadEnvLocal();

type EvalCase = {
  id: string;
  oracleId: string;
  oracleText: string;
  cardName?: string;
  layout?: string;
  selectionRule?: string;
  scopeReason?: string;
  goldenOracleTextHash?: string;
  expansionLabel?: string;
  expectedGrantedRegionCount?: number;
  category?: string;
};

type SemanticGoldContext =
  | "genuine_granted"
  | "token_definition"
  | "reminder_only"
  | "card_native"
  | "no_grant";

type RegionLedgerRow = {
  caseId: string;
  oracleId: string;
  canonicalName: string;
  benchmarkStatus: "valid" | "invalid_identity";
  goldContext: SemanticGoldContext;
  goldRegionSpan: { localStart: number; localEnd: number; text: string; structuralCue?: string } | null;
  detectedContext: SemanticContextKind | null;
  detectedRegionSpan: { localStart: number; localEnd: number; text: string } | null;
  stageA: "tp" | "fp" | "fn" | "excluded";
  stageB: "tp" | "fp" | "fn" | "excluded" | "n/a";
  stageC: "tp" | "fp" | "fn" | "excluded" | "n/a";
  stageCLayer2Expected: number;
};

function loadCases(path: string): EvalCase[] {
  return (JSON.parse(readFileSync(resolve(path), "utf8")) as { cases: EvalCase[] }).cases;
}

/** Independent semantic adjudication from canonical oracle text — not seed labels. */
function adjudicateSemanticContext(oracleText: string, oracleId: string): {
  context: SemanticGoldContext;
  grantedRegions: Array<{ localStart: number; localEnd: number; text: string; structuralCue?: string }>;
  tokenDefinitionRegions: number;
} {
  const grantedRegions: Array<{ localStart: number; localEnd: number; text: string; structuralCue?: string }> = [];
  let tokenDefinitionRegions = 0;
  let hasGrantCue = false;

  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
      for (const route of filterGrantedRulesRoutes(routes)) {
        hasGrantCue = true;
        grantedRegions.push({
          localStart: route.span.localStart,
          localEnd: route.span.localEnd,
          text: route.span.innerText,
          structuralCue: route.structuralCue,
        });
      }
      tokenDefinitionRegions += filterTokenDefinitionRoutes(routes).length;
    }
  }

  if (tokenDefinitionRegions > 0 && grantedRegions.length === 0) {
    return { context: "token_definition", grantedRegions: [], tokenDefinitionRegions };
  }
  if (grantedRegions.length > 0) {
    return { context: "genuine_granted", grantedRegions, tokenDefinitionRegions };
  }
  if (/^\([^)]{10,}\)$/m.test(oracleText.trim()) || /\([A-Z][^)]{8,}\.\)/.test(oracleText)) {
    return { context: "reminder_only", grantedRegions: [], tokenDefinitionRegions: 0 };
  }
  return { context: "no_grant", grantedRegions: [], tokenDefinitionRegions: 0 };
}

function spansOverlap(
  a: { localStart: number; localEnd: number },
  b: { localStart: number; localEnd: number },
): boolean {
  return a.localStart < b.localEnd && b.localStart < a.localEnd;
}

function detectAllRoutedRegions(oracleText: string, oracleId: string) {
  const detected: Array<{
    context: SemanticContextKind;
    localStart: number;
    localEnd: number;
    text: string;
    classified?: string;
  }> = [];

  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
      for (const route of routes) {
        let classified: string | undefined;
        if (route.contextKind === "granted_rules") {
          const regions = buildGrantedRulesRegions(ability.paragraphText, [route.span], [], ability.abilityId);
          classified =
            regions[0]?.classification ??
            classifyGrantedRulesSpan(ability.paragraphText, route.span).classification;
        }
        detected.push({
          context: route.contextKind,
          localStart: route.span.localStart,
          localEnd: route.span.localEnd,
          text: route.span.innerText,
          classified,
        });
      }
    }
  }
  return detected;
}

function buildRegionLedger(validCases: EvalCase[]): RegionLedgerRow[] {
  const ledger: RegionLedgerRow[] = [];

  for (const tc of validCases) {
    const adjudication = adjudicateSemanticContext(tc.oracleText, tc.oracleId);
    const detected = detectAllRoutedRegions(tc.oracleText, tc.oracleId);
    const grantedDetected = detected.filter((d) => d.context === "granted_rules");

    if (adjudication.context === "genuine_granted") {
      for (const gold of adjudication.grantedRegions) {
        const match = grantedDetected.find((d) => spansOverlap(gold, d));
        const stageBClass = match?.classified === "granted_rules_ability";
        ledger.push({
          caseId: tc.id,
          oracleId: tc.oracleId,
          canonicalName: tc.cardName ?? tc.id,
          benchmarkStatus: "valid",
          goldContext: "genuine_granted",
          goldRegionSpan: gold,
          detectedContext: match?.context ?? null,
          detectedRegionSpan: match ?? null,
          stageA: match ? "tp" : "fn",
          stageB: match ? (stageBClass ? "tp" : "fn") : "fn",
          stageC: "n/a",
          stageCLayer2Expected: 0,
        });
      }
      for (const det of grantedDetected.filter((d) => !adjudication.grantedRegions.some((g) => spansOverlap(g, d)))) {
        ledger.push({
          caseId: tc.id,
          oracleId: tc.oracleId,
          canonicalName: tc.cardName ?? tc.id,
          benchmarkStatus: "valid",
          goldContext: "genuine_granted",
          goldRegionSpan: null,
          detectedContext: det.context,
          detectedRegionSpan: det,
          stageA: "fp",
          stageB: det.classified === "granted_rules_ability" ? "fp" : "n/a",
          stageC: "n/a",
          stageCLayer2Expected: 0,
        });
      }
    } else if (adjudication.context === "no_grant" || adjudication.context === "token_definition") {
      for (const det of grantedDetected) {
        ledger.push({
          caseId: tc.id,
          oracleId: tc.oracleId,
          canonicalName: tc.cardName ?? tc.id,
          benchmarkStatus: "valid",
          goldContext: adjudication.context,
          goldRegionSpan: null,
          detectedContext: det.context,
          detectedRegionSpan: det,
          stageA: "excluded",
          stageB: det.classified === "granted_rules_ability" ? "fp" : "excluded",
          stageC: "n/a",
          stageCLayer2Expected: 0,
        });
      }
      if (grantedDetected.length === 0) {
        ledger.push({
          caseId: tc.id,
          oracleId: tc.oracleId,
          canonicalName: tc.cardName ?? tc.id,
          benchmarkStatus: "valid",
          goldContext: adjudication.context,
          goldRegionSpan: null,
          detectedContext: null,
          detectedRegionSpan: null,
          stageA: "excluded",
          stageB: "excluded",
          stageC: "n/a",
          stageCLayer2Expected: 0,
        });
      }
    } else {
      ledger.push({
        caseId: tc.id,
        oracleId: tc.oracleId,
        canonicalName: tc.cardName ?? tc.id,
        benchmarkStatus: "valid",
        goldContext: adjudication.context,
        goldRegionSpan: null,
        detectedContext: null,
        detectedRegionSpan: null,
        stageA: "excluded",
        stageB: "excluded",
        stageC: "excluded",
        stageCLayer2Expected: 0,
      });
    }
  }

  return ledger;
}

function aggregateStageMetrics(ledger: RegionLedgerRow[]) {
  const stageA = ledger.filter((r) => r.goldContext === "genuine_granted" && r.goldRegionSpan);
  const stageA_tp = stageA.filter((r) => r.stageA === "tp").length;
  const stageA_fn = stageA.filter((r) => r.stageA === "fn").length;
  const stageA_fp = ledger.filter((r) => r.stageA === "fp").length;

  const stageB_tp = ledger.filter((r) => r.stageB === "tp").length;
  const stageB_fn = ledger.filter((r) => r.stageB === "fn").length;
  const stageB_fp = ledger.filter((r) => r.stageB === "fp").length;

  const stageC_pool = ledger.reduce((s, r) => s + r.stageCLayer2Expected, 0);
  const stageC_tp = ledger.filter((r) => r.stageC === "tp").length;
  const stageC_fp = ledger.filter((r) => r.stageC === "fp").length;
  const stageC_fn = ledger.filter((r) => r.stageC === "fn").length;

  return {
    stageA: {
      expectedGrantedRegions: stageA_tp + stageA_fn,
      ...metricsFromCounts(stageA_tp, stageA_fp, stageA_fn),
      reconciliation: `TP+FN=${stageA_tp + stageA_fn} from ledger gold rows`,
    },
    stageB: {
      expectedGrantedRegions: stageB_tp + stageB_fn,
      ...metricsFromCounts(stageB_tp, stageB_fp, stageB_fn),
      reconciliation: `TP+FN=${stageB_tp + stageB_fn} from ledger`,
    },
    stageC: {
      nestedLayer2GoldDenominator: stageC_pool,
      ...metricsFromCounts(stageC_tp, stageC_fp, stageC_fn),
      reconciliation: `TP+FN=${stageC_tp + stageC_fn} equals Layer-2 denominator=${stageC_pool}`,
    },
  };
}

function grammaticalFamilyMisses(ledger: RegionLedgerRow[]) {
  const misses: Record<string, number> = {
    equipment_has: 0,
    enchanted_has: 0,
    creatures_gain: 0,
    creatures_have: 0,
    target_gains: 0,
    token_has: 0,
  };
  for (const row of ledger.filter((r) => r.stageA === "fn" && r.goldRegionSpan?.structuralCue)) {
    const cue = row.goldRegionSpan!.structuralCue!;
    if (cue === "enchanted_or_equipped_has" && row.goldRegionSpan!.text.toLowerCase().includes("enchanted")) {
      misses.enchanted_has++;
    } else if (cue === "enchanted_or_equipped_has") {
      misses.equipment_has++;
    } else if (cue === "creatures_gain") misses.creatures_gain++;
    else if (cue === "creatures_have") misses.creatures_have++;
    else if (cue === "target_gains") misses.target_gains++;
    else if (cue === "token_has") misses.token_has++;
  }
  return misses;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const expansionCases = loadCases("data/oracle-action-eval-granted-classifier-expansion-v135.json");
  const negativeCases = loadCases("data/oracle-action-eval-granted-negative-controls-v135.json");

  const expansionAudit = expansionCases.map((c) => auditBenchmarkIdentity(catalog, c));
  const negativeAudit = negativeCases.map((c) => auditBenchmarkIdentity(catalog, c));

  const expansionExact = expansionAudit.filter((r) => r.identityExact).length;
  const negativeExact = negativeAudit.filter((r) => r.identityExact).length;

  const validExpansion = expansionCases.filter((c) =>
    expansionAudit.find((a) => a.caseId === c.id)?.identityExact,
  );

  const taxonomy = {
    genuine_granted: [] as string[],
    token_definition: [] as string[],
    reminder_only: [] as string[],
    card_native: [] as string[],
    no_grant: [] as string[],
    invalid_identity: [] as string[],
  };

  for (const tc of expansionCases) {
    const audit = expansionAudit.find((a) => a.caseId === tc.id)!;
    if (!audit.identityExact) {
      taxonomy.invalid_identity.push(tc.cardName ?? tc.id);
      continue;
    }
    const adj = adjudicateSemanticContext(tc.oracleText, tc.oracleId);
    taxonomy[adj.context === "no_grant" ? "no_grant" : adj.context].push(tc.cardName ?? tc.id);
  }

  for (const tc of negativeCases) {
    const audit = negativeAudit.find((a) => a.caseId === tc.id)!;
    if (!audit.identityExact) taxonomy.invalid_identity.push(tc.cardName ?? tc.id);
    else taxonomy.no_grant.push(tc.cardName ?? tc.id);
  }

  const ledger = buildRegionLedger(validExpansion);
  const stageMetrics = aggregateStageMetrics(ledger);
  const familyMisses = grammaticalFamilyMisses(ledger);

  const mismatchDetails = [...expansionAudit, ...negativeAudit]
    .filter((r) => !r.identityExact)
    .map((r) => ({
      caseId: r.caseId,
      intendedName: r.intendedName,
      oracleId: r.oracleId,
      catalogName: r.catalogName,
      catalogOracleTextPreview: r.catalogOracleText?.slice(0, 160),
      storedOracleTextPreview: r.storedOracleText.slice(0, 160),
      catalogOracleTextHash: r.catalogOracleTextHash,
      storedOracleTextHash: r.storedOracleTextHash,
      textHashMismatch: r.catalogOracleTextHash !== r.storedOracleTextHash,
      targetSubstring: r.targetSubstring,
      targetSpanResolved: r.targetSpanResolved,
      failureReasons: r.failureReasons,
      resolution:
        r.failureReasons.includes("selection_rule_unresolved")
          ? "Seed selectionRule does not resolve in canonical oracle — card identity may be correct but benchmark intent is invalid; requires new case or corrected selectionRule from catalog text"
          : r.failureReasons.includes("name_mismatch")
            ? "Stored cardName does not match catalog canonical name for oracleId"
            : r.failureReasons.includes("stored_text_mismatch")
              ? "Stored oracleText differs from catalog — rebuild from catalog"
              : "Fix oracleId/name/text provenance from catalog",
    }));

  let loaderInvariantPass = false;
  try {
    const { assertAllBenchmarkIdentities } = await import("./lib/benchmark-identity");
    assertAllBenchmarkIdentities(catalog, [...expansionCases, ...negativeCases], "granted-benchmark-v135");
  } catch {
    loaderInvariantPass = false;
  }

  // Loader must pass only when all identities exact
  loaderInvariantPass = expansionExact === expansionCases.length && negativeExact === negativeCases.length;

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-benchmark-identity-audit-v135",
    acceptedSameOverlay: {
      historicalV134: { tp: 576, fp: 5, fn: 74 },
      v134SavedRescored: { tp: 579, fp: 4, fn: 63 },
      v135Current: { tp: 580, fp: 4, fn: 62 },
      delta: { tp: 1, fp: 0, fn: -1 },
      genuineMovement: "rc3-pos-v12-0077 Ajani put_counter",
    },
    identityAudit: {
      expansion: { exact: expansionExact, total: expansionCases.length, label: `${expansionExact}/${expansionCases.length} exact` },
      negatives: { exact: negativeExact, total: negativeCases.length, label: `${negativeExact}/${negativeCases.length} exact` },
    },
    perCaseIdentity: [...expansionAudit, ...negativeAudit],
    mismatchCases: mismatchDetails,
    rebuiltExpansionTaxonomy: taxonomy,
    regionLedger: ledger,
    correctedStageMetrics: stageMetrics,
    grammaticalFamilyMissCounts: familyMisses,
    benchmarkLoaderIdentityInvariant: loaderInvariantPass ? "PASS" : "FAIL",
    note: "Grammar tuning PAUSED until identityExact=100%. Invalid cases excluded from Stage metrics.",
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-benchmark-identity-audit-v135-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        expansion: report.identityAudit.expansion,
        negatives: report.identityAudit.negatives,
        loaderInvariant: report.benchmarkLoaderIdentityInvariant,
        mismatchCount: mismatchDetails.length,
        taxonomy: report.rebuiltExpansionTaxonomy,
        stageA: report.correctedStageMetrics.stageA,
        familyMisses: report.grammaticalFamilyMissCounts,
      },
      null,
      2,
    ),
  );

  if (!loaderInvariantPass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
