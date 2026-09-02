/**
 * PROFESSOR v4.16.1 — deterministic acceptance (no OpenAI).
 */
import assert from "node:assert/strict";
import {
  assessCanonicalDeckLegalityV4161,
  cardAlreadyInWorkingDeckV4161,
  isCardAvailableForSingletonAddV4161,
} from "./professor-canonical-legality-v4-16-1-v1";
import {
  assertReplaceMutationIntegrityV4161,
  commitReplaceMutationV4161,
} from "./professor-mutation-integrity-v4-16-1-v1";
import { validateHoldCourseV4161 } from "./professor-hold-course-validator-v4-16-1-v1";
import { evaluateBracketPowerUtilizationV4161 } from "./professor-bracket-power-utilization-v4-16-1-v1";
import { computeProfessorDeckGradeFromCouncilV48 } from "./professor-deck-grade-council-v4-8-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";

function card(name: string, oracleId?: string): CouncilCardV46 {
  return {
    cardId: `card-${oracleId ?? name.replace(/\s+/g, "-").toLowerCase()}`,
    oracleId: oracleId ?? `oid-${name.replace(/\s+/g, "-").toLowerCase()}`,
    name,
    category: "spell",
    roles: ["interaction"],
    origin: "GOLDEN_CATALOG",
    proposedBy: "RESEARCH",
    status: "SELECTED",
    oracleVerified: true,
    colorIdentityVerified: true,
    legalityVerified: true,
    addedAtRevision: 1,
    lastReviewedRevision: 1,
  };
}

function land(name: string): CouncilCardV46 {
  return { ...card(name), category: "land", roles: ["land"] };
}

function run(): void {
  const selected = [card("Demonic Tutor", "oid-demonic-tutor")];
  const secondAdd = isCardAvailableForSingletonAddV4161({
    selected,
    candidate: card("Demonic Tutor", "oid-demonic-tutor-alt"),
  });
  assert.equal(secondAdd.available, false, "second Demonic Tutor ADD must be rejected");

  const forests = [land("Forest"), land("Forest"), land("Forest")];
  const forestLegality = assessCanonicalDeckLegalityV4161({
    selectedCards: forests,
    commanderName: "Test",
  });
  assert.equal(forestLegality.gate.singletonPass, true, "basic Forest duplicates allowed");

  const cut = card("Grim Monolith", "oid-grim-monolith");
  const add = card("Whiplash, Vengeful Engineer", "oid-whiplash");
  const replaced = commitReplaceMutationV4161({
    selectedCards: [cut],
    cut,
    add,
    revision: 5,
  });
  assert.equal(replaced.pass, true);
  assert.equal(
    assertReplaceMutationIntegrityV4161({
      selectedCards: replaced.selectedCards,
      cutName: "Grim Monolith",
      addName: "Whiplash, Vengeful Engineer",
    }).pass,
    true,
  );

  const hold = validateHoldCourseV4161({
    portfolio: {
      version: "professor-bracket-power-portfolio-v4-16-v1",
      requestedBracket: 4,
      entries: [],
      criticalDeficits: ["PROTECTION"],
      highDeficits: ["PROTECTION"],
      overshoots: [],
      bracketPowerUtilization: "LOW",
      holdCourseForbidden: true,
      summary: "protection deficit",
    },
    gap: {
      version: "professor-bracket-gap-analysis-v4-10-v1",
      requestedBracket: 4,
      predictedBracket: 3,
      currentlyEstimatedBracket: 3,
      holdCourseForbidden: true,
      currentPowerDeficits: ["Protection below B4 floor"],
      unresolvedHighDeficits: ["PROTECTION"],
      recommendedPowerLevers: ["PROTECTION"],
      analysisStatus: "OK",
      checkpointMessage: "",
      compactnessStatus: "MEDIUM",
      tutorStatus: "LOW",
    },
    legality: assessCanonicalDeckLegalityV4161({ selectedCards: [card("Lightning Bolt")], commanderName: "Mogis" }),
    utilization: null,
    winReadiness: null,
    highDeficitCheckpointStreak: 2,
    primaryStrategy: "Sacrifice Synergy",
  });
  assert.equal(hold.allowed, false);
  assert.equal(hold.action, "RESEARCH_REQUIRED");

  const expensiveCouncil = {
    selectedCards: [
      ...Array.from({ length: 6 }, (_, i) =>
        card(`Lich's Caress ${i}`, `oid-lichs-${i}`),
      ),
      ...Array.from({ length: 30 }, (_, i) => land(`Swamp ${i}`)),
    ],
    snapshots: [{ interactionCoverage: 6, landCount: 30, commanderDependenceDistribution: { high: 0, medium: 0, low: 0 } }],
    discoveryReports: [],
  } as unknown as ProfessorCouncilStateV47;

  const expensiveLegality = assessCanonicalDeckLegalityV4161({
    selectedCards: expensiveCouncil.selectedCards,
    commanderName: "Test",
    requireFullLibrary: false,
  });
  const expensiveGrade = computeProfessorDeckGradeFromCouncilV48({
    councilState: expensiveCouncil,
    theory: null,
    charter: null,
    commanderName: "Test",
    legality: {
      ...expensiveLegality,
      gradeEligible: true,
      completeDeckLegal: true,
      finalDeckLegal: true,
    },
  });
  assert.ok(expensiveGrade);
  const interactionCat = expensiveGrade!.categories.find((c) => c.id === "interaction");
  assert.ok(interactionCat && interactionCat.score < 85, "expensive interaction must not auto-score 100");

  const illegalDupes = [
    card("Demonic Tutor", "oid-dt-1"),
    card("Demonic Tutor", "oid-dt-2"),
    card("Mana Vault", "oid-mv-1"),
    card("Mana Vault", "oid-mv-2"),
  ];
  const illegalLegality = assessCanonicalDeckLegalityV4161({
    selectedCards: illegalDupes,
    commanderName: "Mogis",
  });
  assert.equal(illegalLegality.effectiveBracketEvaluable, false);
  const utilization = evaluateBracketPowerUtilizationV4161({
    requestedBracket: 4,
    portfolio: null,
    snapshot: null,
    selectedCards: illegalDupes,
    legality: illegalLegality,
  });
  assert.equal(utilization.summary.includes("NOT_EVALUATED"), true);

  console.log("PROFESSOR v4.16.1 canonical legality acceptance: PASS");
  console.log(
    JSON.stringify(
      {
        singleton: "PASS",
        basicLands: "PASS",
        mutationIntegrity: "PASS",
        holdCourseBlocked: "PASS",
        interactionQualityGrade: "PASS",
        illegalBracketBlocked: "PASS",
      },
      null,
      2,
    ),
  );
}

run();
