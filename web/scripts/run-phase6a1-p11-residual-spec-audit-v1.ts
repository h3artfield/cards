#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 P11 — Residual spec consistency audit on 8 overlay cases only.
 * Audit only — Phase-5 frozen, no retriever tuning, no P14 baseline rerun.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  resolveBenchmarkCommanderOracleIds,
} from "../src/lib/deck-synthesis";
import type { RetrievalSpecification } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  PHASE6A1_SPEC_CORRECTION_OVERLAY_V12,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_2_VERSION,
  applySpecCorrectionOverlay,
} from "./lib/phase6a1-spec-correction-overlay-v1.2";

loadProjectEnvLocal();

const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-p11-residual-spec-audit-v1.json");
const ALL_CASES = [...ARCHETYPE_DISCOVERY_BENCHMARK_V1, ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5];

type FieldVerdict = "DEFENSIBLE" | "QUESTIONABLE" | "UNSUPPORTED" | "INTERNAL_CONFLICT";

type FieldAudit = {
  linkedSpecField: string;
  value: string;
  verdict: FieldVerdict;
  rationale: string;
  p11CorrectionApplied: boolean;
  residualAuditFocus: boolean;
};

function oracleBlob(texts: Array<{ oracleText: string }>): string {
  return texts.map((t) => t.oracleText).join("\n").toLowerCase();
}

function auditField(
  linkedSpecField: string,
  value: string,
  oracle: string,
  mechanicalDirection: string,
  focusSet: Set<string>,
  correctedValues: Set<string>,
): FieldAudit {
  const focus = focusSet.has(linkedSpecField);
  const p11Applied = correctedValues.has(`${linkedSpecField.split(":")[0]}:${value}`) || correctedValues.has(value);

  const v = value.toLowerCase();
  const mech = mechanicalDirection.toLowerCase();

  if (linkedSpecField === "constructionConstraints:minimize_controller_noncreature_spells") {
    if (/prowess|whenever you cast a noncreature spell|whenever you cast an instant or sorcery/.test(oracle)) {
      return {
        linkedSpecField,
        value,
        verdict: "INTERNAL_CONFLICT",
        rationale: "Constraint minimizes controller noncreature spells but commander Oracle rewards casting noncreature spells (prowess).",
        p11CorrectionApplied: p11Applied,
        residualAuditFocus: focus,
      };
    }
  }

  if (value === "top_library_cast" || v.includes("top_of_library") || v.includes("cast_from_library")) {
    if (!/cast .* from the top of your library|look at the top.*cast|may cast.*top of your library/.test(oracle)) {
      return {
        linkedSpecField,
        value,
        verdict: "UNSUPPORTED",
        rationale: "Top-of-library cast permission not present in supplied commander Oracle text.",
        p11CorrectionApplied: p11Applied,
        residualAuditFocus: focus,
      };
    }
  }

  if (mech.includes("cast_from_library_top") && !/top of your library/.test(oracle)) {
    if (linkedSpecField.startsWith("mechanicalDirection")) {
      return {
        linkedSpecField: "mechanicalDirection:CAST_FROM_LIBRARY_TOP",
        value: mechanicalDirection,
        verdict: "UNSUPPORTED",
        rationale: "Frozen mechanical direction references library-top casting not supported by commander Oracle.",
        p11CorrectionApplied: false,
        residualAuditFocus: focus,
      };
    }
  }

  if (v === "spell_copying" && !/copy .* spell|copies of .* spell|whenever you copy/.test(oracle)) {
    return {
      linkedSpecField,
      value,
      verdict: "QUESTIONABLE",
      rationale: "Spell copying not evident in commander Oracle text.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "opponent_noncreature_spells" && /prowess|whenever you cast a noncreature spell/.test(oracle)) {
    return {
      linkedSpecField,
      value,
      verdict: "DEFENSIBLE",
      rationale: "Commander rewards controller casting noncreature spells via prowess.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "combat_damage_to_player" && /deals combat damage to a player/.test(oracle)) {
    return {
      linkedSpecField,
      value,
      verdict: "DEFENSIBLE",
      rationale: "Commander triggers on combat damage to a player.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "mill_target_player" && /target player mills|mills three cards/.test(oracle)) {
    return {
      linkedSpecField,
      value,
      verdict: "DEFENSIBLE",
      rationale: "Commander mills target players and triggers on creature cards milled.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "creature_cards_milled" && /mills one or more creature cards/.test(oracle)) {
    return {
      linkedSpecField,
      value,
      verdict: "DEFENSIBLE",
      rationale: "Hive Mind trigger keyed to creature cards milled.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "opponent_graveyard_instant_sorcery_availability" && /exile target instant or sorcery card from an opponent's graveyard/.test(oracle)) {
    return {
      linkedSpecField,
      value,
      verdict: "DEFENSIBLE",
      rationale: "Typed requirement matches Nita activated exile-cast from opponent graveyard.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "graveyard_permanents" && /mill|graveyard/.test(oracle) && focus) {
    return {
      linkedSpecField,
      value,
      verdict: "QUESTIONABLE",
      rationale: "Generic graveyard permanents input may over-broad after mill_target_player correction.",
      p11CorrectionApplied: p11Applied,
      residualAuditFocus: focus,
    };
  }

  if (v === "sacrifice_outlet" && /sacrifice another creature|sacrifice a creature/.test(oracle)) {
    return { linkedSpecField, value, verdict: "DEFENSIBLE", rationale: "Sacrifice outlet in commander text.", p11CorrectionApplied: p11Applied, residualAuditFocus: focus };
  }

  if (v === "cast_from_exile" && /exile.*you may cast|cast.*exile/.test(oracle)) {
    return { linkedSpecField, value, verdict: "DEFENSIBLE", rationale: "Exile-cast permission in commander text.", p11CorrectionApplied: p11Applied, residualAuditFocus: focus };
  }

  if (v === "counter_synergy" && /\+1\/\+1 counter|counter on each creature/.test(oracle)) {
    return { linkedSpecField, value, verdict: "DEFENSIBLE", rationale: "Counter placement payoff in commander text.", p11CorrectionApplied: p11Applied, residualAuditFocus: focus };
  }

  if (v === "token_generation" && /create .* token|token/.test(oracle)) {
    return { linkedSpecField, value, verdict: "DEFENSIBLE", rationale: "Token generation in commander text.", p11CorrectionApplied: p11Applied, residualAuditFocus: focus };
  }

  if (v === "etb_permanents" && /dying causes|whenever .* dies|sacrifice/.test(oracle)) {
    return { linkedSpecField, value, verdict: "DEFENSIBLE", rationale: "Death/ETB-adjacent aristocrats shell defensible for Teysa.", p11CorrectionApplied: p11Applied, residualAuditFocus: focus };
  }

  return {
    linkedSpecField,
    value,
    verdict: focus ? "QUESTIONABLE" : "DEFENSIBLE",
    rationale: focus
      ? "Flagged in P11 residual audit focus — causal link not verified by narrow audit heuristics."
      : "No residual-audit flag; assumed defensible pending broader review.",
    p11CorrectionApplied: p11Applied,
    residualAuditFocus: focus,
  };
}

function collectSpecFields(spec: RetrievalSpecification): Array<{ linkedSpecField: string; value: string }> {
  const out: Array<{ linkedSpecField: string; value: string }> = [];
  const keys: (keyof RetrievalSpecification)[] = [
    "requiredFunctions",
    "desiredFunctions",
    "requiredInputs",
    "outputsToExploit",
    "resourcesToProduce",
    "resourcesToConsume",
    "statesToMaintain",
    "statesToIncrease",
    "relevantCardTypes",
    "relevantZones",
    "protectionNeeds",
    "redundancyNeeds",
    "structuralNeeds",
    "avoidFunctions",
    "avoidCardClasses",
    "selfPenaltyConditions",
    "constructionConstraints",
  ];
  for (const key of keys) {
    for (const value of spec[key] as string[]) {
      out.push({ linkedSpecField: `${key}:${value}`, value });
    }
  }
  return out;
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const caseAudits: Array<Record<string, unknown>> = [];

  for (const overlay of PHASE6A1_SPEC_CORRECTION_OVERLAY_V12) {
    const benchCase = ALL_CASES.find((c) => c.id === overlay.caseId)!;
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, benchCase.commanders);
    if (!resolution.resolved) throw new Error(`Unresolved: ${overlay.caseId}`);

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: benchCase.bracket },
      { catalog, shadowIndex, globalCatalogIndex: globalIndex },
    );
    const primary = report.buildDirections.find((d) => d.rank === 1)!;
    const frozenSpec = primary.retrievalSpecification;
    const overlaySpec = applySpecCorrectionOverlay(frozenSpec, [overlay]);

    const oracleTexts = resolution.oracleIds.map((id) => ({
      name: catalog.byOracleId.get(id)?.canonicalName ?? id,
      oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
    }));
    const oracle = oracleBlob(oracleTexts);
    const focusSet = new Set(overlay.residualAuditFocus);

    const correctedValues = new Set<string>();
    for (const c of overlay.corrections) {
      if (c.replaceWith) correctedValues.add(`${c.field}:${c.replaceWith}`);
      if (c.addValue) correctedValues.add(`${c.field}:${c.addValue}`);
    }

    const frozenFields = collectSpecFields(frozenSpec);
    const overlayFields = collectSpecFields(overlaySpec);

    const frozenAudits = frozenFields.map((f) =>
      auditField(f.linkedSpecField, f.value, oracle, primary.mechanicalDescription, focusSet, correctedValues),
    );
    const overlayAudits = overlayFields.map((f) =>
      auditField(f.linkedSpecField, f.value, oracle, primary.mechanicalDescription, focusSet, correctedValues),
    );

    overlayAudits.push(
      auditField(
        "mechanicalDirection:CAST_FROM_LIBRARY_TOP",
        primary.mechanicalDescription,
        oracle,
        primary.mechanicalDescription,
        focusSet,
        correctedValues,
      ),
    );

    const remainingIssues = overlayAudits.filter((a) => a.verdict !== "DEFENSIBLE");
    const confirmedCorrected = overlay.corrections.length > 0 && remainingIssues.every((i) => !i.p11CorrectionApplied || i.verdict === "DEFENSIBLE");

    caseAudits.push({
      caseId: overlay.caseId,
      commanders: benchCase.commanders,
      correctionId: overlay.correctionId,
      p11AdjudicationLabel: overlay.independentAdjudicationLabel,
      overlayStatus: overlay.overlayStatus,
      overlayCorrectionsApplied: overlay.corrections,
      specClassification: {
        note: "Do NOT classify as CONFIRMED_CORRECTED_SPEC solely because P11 field was accepted.",
        frozenPhase5FieldCount: frozenFields.length,
        afterOverlayFieldCount: overlayFields.length,
        remainingNonDefensibleCount: remainingIssues.length,
        provisionalStatus:
          remainingIssues.length === 0
            ? "OVERLAY_CLEAN_PENDING_FULL_REVIEW"
            : "RESIDUAL_CONTAMINATION_REMAINS",
        confirmedCorrectedSpec: false,
      },
      frozenPhase5MechanicalDirection: primary.mechanicalDescription,
      commanderOracleTexts: oracleTexts,
      frozenSpecFieldAudit: frozenAudits,
      afterOverlaySpecFieldAudit: overlayAudits,
      remainingIssues,
      residualAuditFocus: overlay.residualAuditFocus,
    });
  }

  const report = {
    version: "phase6a1-p11-residual-spec-audit-v1",
    overlayVersion: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_2_VERSION,
    generatedAt: new Date().toISOString(),
    scope: "8 P11 overlay cases only — not full Phase-5 reopening",
    phase5Artifacts: "FROZEN",
    correctionsMechanism: "Phase-6 RetrievalSpecificationCorrection overlay only",
    authorization: {
      p11IndependentAdjudication: "COMPLETE",
      applyFourAcceptedCorrections: "AUTHORIZED",
      implementFourDifferentCorrections: "AUTHORIZED",
      residualConsistencyAudit: "COMPLETE",
      cleanP14BaselineRerun: "WAIT",
      additionalRetrieverSemanticTuning: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    summary: {
      caseCount: caseAudits.length,
      casesWithResidualContamination: caseAudits.filter(
        (c) => (c.specClassification as { provisionalStatus: string }).provisionalStatus === "RESIDUAL_CONTAMINATION_REMAINS",
      ).length,
      casesOverlayClean: caseAudits.filter(
        (c) => (c.specClassification as { provisionalStatus: string }).provisionalStatus === "OVERLAY_CLEAN_PENDING_FULL_REVIEW",
      ).length,
      note: "Before clean P14 baseline, stratify SPEC_VALID / CONFIRMED_CORRECTED_SPEC / UPSTREAM_INVALID_EXCLUDED separately.",
    },
    caseAudits,
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  writeFileSync(
    resolve("data/milestones/deck-synthesis/phase6a1-p11-spec-correction-overlay-applied-v1.2.json"),
    JSON.stringify(
      {
        version: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_2_VERSION,
        generatedAt: new Date().toISOString(),
        entries: PHASE6A1_SPEC_CORRECTION_OVERLAY_V12,
        note: "Post-adjudication overlay. Phase-5 unchanged.",
      },
      null,
      2,
    ),
  );

  console.log(`Residual spec audit: ${OUT_PATH}`);
  console.log(
    `Cases with residual contamination: ${report.summary.casesWithResidualContamination}/${report.summary.caseCount}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
