/**
 * Professor v4 fixtures — Meren from A/B dumb output; Chatterfang conventional creative baseline.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V4_CREATIVE_PASS1_FIXTURES_V1_VERSION = "phase6a1-professor-v4-creative-pass1-fixtures-v1";

export const MEREN_DUMB_PROFESSOR_ARM_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-ab-v1-dumb-professor-arm-v1.json",
);
export const MEREN_FROZEN_CONTEXT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-ab-v1-frozen-initial-context-v1.json",
);
export const MEREN_CREATIVE_PASS1_FIXTURE_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v4-creative-pass1-meren-fixture-v1.json",
);
export const CHATTERFANG_CREATIVE_PASS1_FIXTURE_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v4-creative-pass1-chatterfang-fixture-v1.json",
);

function dependencyFromLens(lens: StrategyHypothesisV3["lens"], commanderDependency: StrategyHypothesisV3["commanderDependency"]) {
  if (lens === "INDEPENDENT_SYNERGY") return "LOW" as const;
  if (lens === "HARMONY") return "MEDIUM" as const;
  return commanderDependency;
}

export function convertStrategyHypothesesToCreativePass1V4(args: {
  commander: string;
  hypotheses: StrategyHypothesisV3[];
}): CreativeProfessorPass1V4 {
  const mechanicInterpretation = args.hypotheses.flatMap((h) => [h.strategicClaim, h.causalReasoning]);
  const packages = args.hypotheses.flatMap((h) =>
    h.packages.map((pkg) => ({
      id: pkg.packageId,
      concept: h.title,
      purpose: pkg.purpose || h.strategicClaim,
      commanderDependence: pkg.commanderDependency,
      whyInteresting: h.causalReasoning.slice(0, 240),
      likelyCardsOrEffects: [...pkg.functionalRoles, ...pkg.inputs, ...pkg.outputs].filter(Boolean),
      evidenceRefs: pkg.evidenceRefs.length ? pkg.evidenceRefs : h.evidenceRefs,
    })),
  );
  const winPaths = args.hypotheses
    .filter((h) => h.lens === "DEPENDENT_SYNERGY" || h.lens === "AUTO")
    .map((h, i) => ({
      id: `win-${i + 1}`,
      description: h.strategicClaim,
      commanderDependence: h.commanderDependency,
      evidenceRefs: h.evidenceRefs,
    }));
  const independentEngines = args.hypotheses
    .filter((h) => h.lens === "INDEPENDENT_SYNERGY")
    .map((h, i) => ({
      id: `ind-${i + 1}`,
      description: h.strategicClaim,
      worksWithoutCommander: dependencyFromLens(h.lens, h.commanderDependency),
      evidenceRefs: h.evidenceRefs,
    }));

  return {
    version: PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION,
    commander: args.commander,
    strategicThesis: args.hypotheses.find((h) => h.lens === "AUTO")?.strategicClaim ?? args.hypotheses[0]?.strategicClaim ?? "",
    mechanicInterpretation,
    packages,
    winPaths,
    independentEngines,
    vulnerabilities: [...new Set(args.hypotheses.flatMap((h) => h.vulnerabilities ?? []))],
    openQuestions: args.hypotheses.flatMap((h) =>
      h.lens === "HARMONY" ? ["Can independent shell and commander recursion be merged without overcommitting to commander?"] : [],
    ),
    confidenceNotes: [
      "Converted from Meren A/B Dumb Professor one-shot output (professor-v3-ab-v1-dumb-professor-arm-v1).",
      "Preserves strategic content without typed assertion/causal-edge envelope.",
    ],
    evidenceRefs: args.hypotheses.flatMap((h) => h.evidenceRefs).slice(0, 6),
  };
}

export function loadMerenCreativePass1FixtureFromDumbProfessorArmV1(): CreativeProfessorPass1V4 {
  const arm = JSON.parse(readFileSync(MEREN_DUMB_PROFESSOR_ARM_PATH, "utf8")) as {
    normalization?: { normalized?: StrategyHypothesisV3[] };
  };
  const hypotheses = arm.normalization?.normalized;
  if (!hypotheses?.length) throw new Error("Meren dumb professor arm missing normalized hypotheses");
  const frozen = JSON.parse(readFileSync(MEREN_FROZEN_CONTEXT_PATH, "utf8")) as { commanderName?: string; frozenPlanningContext?: { commandZone?: { commanders?: string[] } } };
  const commander =
    frozen.commanderName ?? frozen.frozenPlanningContext?.commandZone?.commanders?.[0] ?? "Meren of Clan Nel Toth";
  return convertStrategyHypothesesToCreativePass1V4({ commander, hypotheses });
}

export function loadChatterfangCreativePass1FixtureV1(): CreativeProfessorPass1V4 {
  return JSON.parse(readFileSync(CHATTERFANG_CREATIVE_PASS1_FIXTURE_PATH, "utf8")) as CreativeProfessorPass1V4;
}

export function loadMerenCreativePass1FixtureV1(): CreativeProfessorPass1V4 {
  try {
    return JSON.parse(readFileSync(MEREN_CREATIVE_PASS1_FIXTURE_PATH, "utf8")) as CreativeProfessorPass1V4;
  } catch {
    return loadMerenCreativePass1FixtureFromDumbProfessorArmV1();
  }
}
