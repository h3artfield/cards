/**
 * V4.6 acceptance demo — proves deck-aware checkpoint collaboration without live LLM.
 * Run: npx tsx scripts/professor-v4-6-acceptance-demo-v1.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCollaborativeCouncilStateV45 } from "../src/lib/deck-synthesis/professor-council-orchestrator-v4-5-v1";
import {
  advanceCouncilAssemblyV46,
  computeDeckSnapshotV46,
  type ProfessorCouncilStateV46,
} from "../src/lib/deck-synthesis/professor-council-assembly-v4-6-v1";
import { seedWorkingDeckTheoryFromCreativePass1V4 } from "../src/lib/deck-synthesis/professor-working-deck-theory-v4";
import type { ProfessorV41ConversationLoopResultV1 } from "../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";

const AERITH_PASS1: CreativeProfessorPass1V4 = {
  version: "professor-creative-pass1-contracts-v4",
  commander: "Aerith Gainsborough",
  strategicThesis:
    "Build a lifegain-led value deck where legendary creatures and incremental life gain create card advantage, then convert board presence into a durable win.",
  mechanicInterpretation: [
    "Aerith rewards lifegain with counters and scaling.",
    "Legendary creatures create a shared board identity.",
    "Independent lifegain engines should function without Aerith.",
  ],
  packages: [
    {
      id: "lifegain-engine",
      concept: "Lifegain Value Engine",
      purpose: "Generate frequent life gain events and convert them into resources.",
      commanderDependence: "MEDIUM",
      whyInteresting: "Lifegain is the deck's primary repeated event.",
      likelyCardsOrEffects: [
        "Soul Warden",
        "Essence Warden",
        "Ajani's Pridemate",
        "Authority of the Consuls",
        "Suture Priest",
      ],
      evidenceRefs: [],
    },
    {
      id: "legendary-bridge",
      concept: "Legendary Harmony Bridge",
      purpose: "Legendary creatures that benefit from shared board states.",
      commanderDependence: "MEDIUM",
      whyInteresting: "Bridges commander scaling with independent value.",
      likelyCardsOrEffects: ["Kytheon, Hero of Akros", "Thalia, Guardian of Thraben", "Alseid of Life's Bounty"],
      evidenceRefs: [],
    },
    {
      id: "payoff-conversion",
      concept: "Lifegain Payoff Conversion",
      purpose: "Convert life gain into cards or durable advantage.",
      commanderDependence: "LOW",
      whyInteresting: "Prevents narrow lifegain slots without payoffs.",
      likelyCardsOrEffects: ["Well of Lost Dreams", "Vito, Thorn of the Dusk Rose", "Dawn of Hope", "Rhystic Study"],
      evidenceRefs: [],
    },
  ],
  independentEngines: [
    {
      id: "ind-lifegain",
      description: "Soul Warden / Essence Warden lifegain shell with card-advantage payoffs.",
      worksWithoutCommander: "HIGH",
      evidenceRefs: [],
    },
  ],
  winPaths: [
    { id: "w1", description: "Incremental lifegain value into overwhelming board", commanderDependence: "MEDIUM", evidenceRefs: [] },
    { id: "w2", description: "Legendary board into combat finish", commanderDependence: "MEDIUM", evidenceRefs: [] },
  ],
  openQuestions: ["How much lifegain is too much without payoffs?"],
  confidenceNotes: ["Harmony target requires independent engines."],
  vulnerabilities: ["Too much narrow lifegain without card advantage", "Commander removal slows engine"],
};

function patchTheoryWithCardNames(theory: ReturnType<typeof seedWorkingDeckTheoryFromCreativePass1V4>) {
  theory.packages[0]!.candidateCards = [
    "Soul Warden",
    "Essence Warden",
    "Ajani's Pridemate",
    "Authority of the Consuls",
    "Suture Priest",
    "Soul's Attendant",
    "Auriok Champion",
    "Cathars' Crusade",
  ];
  theory.packages[1]!.candidateCards = ["Kytheon, Hero of Akros", "Thalia, Guardian of Thraben", "Alseid of Life's Bounty", "Heroic Intervention"];
  theory.packages[2]!.candidateCards = ["Well of Lost Dreams", "Vito, Thorn of the Dusk Rose", "Dawn of Hope", "Rhystic Study", "Skullclamp", "Swords to Plowshares"];
  return theory;
}

function summarizeSnapshot(state: ProfessorCouncilStateV46, label: string) {
  const snap = computeDeckSnapshotV46(state);
  console.log(`\n=== ${label} ===`);
  console.log(`Cards: ${snap.cardCount} (${snap.nonlandCount} nonland)`);
  console.log(`Selected: ${state.selectedCards.map((c) => c.name).join(", ")}`);
  console.log(`Weaknesses: ${snap.weaknesses.join("; ") || "none"}`);
  console.log(`Research question: ${snap.researchQuestion}`);
  console.log(`Role coverage: ${JSON.stringify(snap.roleCoverage)}`);
  return snap;
}

function main() {
  const loopResult: ProfessorV41ConversationLoopResultV1 = {
    version: "professor-v4-1-conversation-loop-v1",
    creativePass1: AERITH_PASS1,
    selectedResearchModes: ["MECHANIC", "ENGINEER"],
    researchMessages: [],
    criticAnnotations: [],
    workingDeckTheory: null,
    warrantCreativeRevisit: false,
  };

  let theory = patchTheoryWithCardNames(
    seedWorkingDeckTheoryFromCreativePass1V4({
      pass1: AERITH_PASS1,
      userIntent: ["Bracket 3", "weird deck", "Harmony"],
    }),
  );

  let state = buildCollaborativeCouncilStateV45({
    context: {
      commanderName: "Aerith Gainsborough",
      bracket: 3,
      userIntent: ["Bracket 3", "weird deck", "Harmony"],
      relationshipLens: "HARMONY",
      playStyle: "weird deck",
      commanderRelationship: "Harmony",
      fixtureCase: null,
    },
    loopResult,
    theory,
  });

  summarizeSnapshot(state, "After initial assembly + first checkpoint");

  const checkpointTurns = state.conversation.filter((t) => t.phase === "CHECKPOINT").slice(0, 4);
  console.log("\n=== First checkpoint council dialogue ===");
  for (const t of checkpointTurns) {
    console.log(`${t.speaker}: ${t.message}`);
  }

  console.log("\n=== Card mutations after first checkpoint ===");
  for (const d of state.cardDecisions) {
    console.log(`${d.action} ${d.cardName}${d.replacedCardName ? ` (was ${d.replacedCardName})` : ""} — ${d.reason}`);
  }

  const beforeCount = state.selectedCards.length;
  const beforeNames = new Set(state.selectedCards.map((c) => c.name));

  for (let step = 0; step < 12; step++) {
    state = advanceCouncilAssemblyV46(state, 4);
  }

  summarizeSnapshot(state, "After 12 assembly advances");

  const added = state.selectedCards.filter((c) => !beforeNames.has(c.name));
  const removed = [...beforeNames].filter((n) => !state.selectedCards.some((c) => c.name === n));
  console.log(`\nNet change: +${added.length} new cards, -${removed.length} removed`);
  if (added.length) console.log(`Added: ${added.map((c) => c.name).join(", ")}`);
  if (removed.length) console.log(`Removed: ${removed.join(", ")}`);

  const secondCheckpoint = state.conversation.filter((t) => t.phase === "CHECKPOINT").slice(-3);
  console.log("\n=== Latest checkpoint dialogue ===");
  for (const t of secondCheckpoint) {
    console.log(`${t.speaker}: ${t.message}`);
  }

  console.log("\n=== Checkpoints completed ===", state.checkpointsCompleted.join(", "));
  console.log("=== Assembly revision ===", state.assemblyRevision);
  console.log("=== Phase ===", state.phase);

  const reportPath = join(process.cwd(), "data", "milestones", "deck-synthesis", "professor-v4-6-acceptance-demo-output-v1.json");
  try {
    writeReport(reportPath, state);
    console.log(`\nWrote ${reportPath}`);
  } catch {
    console.log("\n(Skip JSON write — run from web/ directory for full output path)");
  }
}

function writeReport(path: string, state: ProfessorCouncilStateV46) {
  const payload = {
    decision: "PROFESSOR_V4_6_COLLABORATIVE_DECK_ASSEMBLY_AND_CHECKPOINT_COUNCIL_V1_AUTHORIZED",
    deckCharter: state.deckCharter,
    initialSelectedCards: state.snapshots[0]?.selectedCardsSummary ?? [],
    firstSnapshot: state.snapshots[0] ?? null,
    checkpointsCompleted: state.checkpointsCompleted,
    cardDecisions: state.cardDecisions,
    replacementHistory: state.replacementHistory,
    finalSelectedCards: state.selectedCards.map((c) => ({ name: c.name, roles: c.roles, status: c.status })),
    finalSnapshot: state.snapshots[state.snapshots.length - 1] ?? null,
    latestResearchQuestion: state.snapshots[state.snapshots.length - 1]?.researchQuestion ?? null,
  };
  const { writeFileSync, mkdirSync } = require("node:fs");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2));
}

main();
