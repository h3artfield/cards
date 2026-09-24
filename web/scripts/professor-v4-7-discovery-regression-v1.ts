/**
 * V4.7 regression — zero named Creative cards still yields legal candidate supply.
 * Run: npx tsx scripts/professor-v4-7-discovery-regression-v1.ts
 */
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { buildCollaborativeCouncilStateV45 } from "../src/lib/deck-synthesis/professor-council-orchestrator-v4-5-v1";
import { runInitialAssemblyV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";
import { decomposeCreativeConceptV47 } from "../src/lib/deck-synthesis/professor-deck-needs-v4-7-v1";
import { seedWorkingDeckTheoryFromCreativePass1V4 } from "../src/lib/deck-synthesis/professor-working-deck-theory-v4";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import type { ProfessorV41ConversationLoopResultV1 } from "../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";

const FRANK_PASS1: CreativeProfessorPass1V4 = {
  version: "professor-creative-pass1-contracts-v4",
  commander: "Agent Frank Horrigan",
  strategicThesis: "Build around +1/+1 counters, proliferate, and combat pressure with repeatable protection.",
  mechanicInterpretation: ["Frank grows with counters and wants proliferate payoffs."],
  packages: [
    {
      id: "proliferate-engine",
      concept: "Proliferate Counter Engine",
      purpose: "Repeatedly add and multiply +1/+1 counters across the board.",
      commanderDependence: "HIGH",
      whyInteresting: "Counters are the deck's core resource.",
      likelyCardsOrEffects: ["proliferate payoffs", "counter engines", "+1/+1 counter"],
      evidenceRefs: [],
    },
  ],
  independentEngines: [],
  winPaths: [{ id: "w1", description: "Combat with large creatures", commanderDependence: "HIGH", evidenceRefs: [] }],
  vulnerabilities: ["Removal on Frank"],
  openQuestions: ["How much proliferate is enough?"],
  confidenceNotes: [],
};

async function main() {
  console.log("=== Concept decomposition ===");
  for (const concept of ["proliferate payoffs", "counter engines", "+1/+1 counter"]) {
    console.log(concept, "→", decomposeCreativeConceptV47(concept));
  }

  console.log("\n=== Heroic Intervention role audit ===");
  const catalog = await loadDeckResolutionCatalog();
  const heroic = catalog.byNormalizedName.get("heroicintervention")?.[0];
  if (heroic) {
    const profile = buildFunctionalCardProfileV47(heroic);
    console.log("Heroic Intervention roles:", profile.roles);
    console.log("Has card-advantage?", profile.roles.includes("card-advantage"));
  }

  const theory = seedWorkingDeckTheoryFromCreativePass1V4({ pass1: FRANK_PASS1, userIntent: ["Bracket 3"] });
  const loopResult: ProfessorV41ConversationLoopResultV1 = {
    version: "professor-v4-1-conversation-loop-v1",
    creativePass1: FRANK_PASS1,
    selectedResearchModes: ["MECHANIC"],
    researchMessages: [],
    criticAnnotations: [],
    workingDeckTheory: null,
    warrantCreativeRevisit: false,
  };

  const charterState = buildCollaborativeCouncilStateV45({
    context: {
      commanderName: "Agent Frank Horrigan",
      bracket: 3,
      userIntent: ["Bracket 3"],
      relationshipLens: "HARMONY",
      playStyle: "upgraded",
      commanderRelationship: "Harmony",
      fixtureCase: null,
    },
    loopResult,
    theory,
  });

  const frank = catalog.byNormalizedName.get("agentfrankhorrigan")?.[0];
  if (!frank) {
    console.error("Frank Horrigan not found in catalog");
    process.exit(1);
  }

  const assembled = await runInitialAssemblyV47({
    state: charterState,
    context: {
      commanderName: "Agent Frank Horrigan",
      bracket: 3,
      userIntent: ["Bracket 3"],
      relationshipLens: "HARMONY",
      playStyle: "upgraded",
      commanderRelationship: "Harmony",
      fixtureCase: null,
    },
    loopResult,
    theory,
    catalog,
    commanderOracleId: frank.oracleId,
    colorIdentity: frank.colorIdentity ?? ["B", "G", "W"],
  });

  console.log("\n=== Initial assembly (zero named cards) ===");
  console.log("Candidate pool:", assembled.candidatePool.length);
  console.log("Selected:", assembled.selectedCards.map((c) => c.name).join(", "));
  console.log("Discovery reports:", assembled.discoveryReports.length);
  console.log("First report queries:", assembled.discoveryReports[0]?.queries.map((q) => q.conceptText).slice(0, 5));
  console.log("Card advantage coverage:", assembled.snapshots[0]?.cardAdvantageCoverage);
  console.log("Build phase:", assembled.buildPhase);

  if (assembled.selectedCards.length < 10) {
    console.error("FAIL: expected >= 10 cards from concept discovery");
    process.exit(1);
  }
  if (assembled.candidatePool.length < 12) {
    console.error("FAIL: expected healthy candidate buffer after initial discovery");
    process.exit(1);
  }
  console.log("\nPASS: V4.7 concept-driven discovery supplies initial batch without Creative card names.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
