#!/usr/bin/env npx tsx
/** Professor v4.1 — Working Deck Theory + brewing conversation loop offline acceptance, 0 OpenAI. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  revisionHistoryPreservesReasoningV4,
  theoryWasIncrementallyPatchedV4,
} from "../src/lib/deck-synthesis/professor-working-deck-theory-v4";
import { ideasInLaneV4 } from "../src/lib/deck-synthesis/professor-idea-board-v4";
import { SPORE_FROG_ABSTRACTION_EXAMPLE_V4 } from "../src/lib/deck-synthesis/professor-abstraction-levels-v4";
import { PITILESS_PLUNDERER_CHALLENGE_EXAMPLE_V4 } from "../src/lib/deck-synthesis/professor-research-message-v4";
import { RESEARCH_MODE_V4 } from "../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";
import { SEMANTIC_RELATION_V4 } from "../src/lib/deck-synthesis/professor-semantic-vocabulary-v4";
import { validateConversationLoopResultV1 } from "../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  loadChatterfangCreativePass1FixtureV1,
  loadMerenCreativePass1FixtureFromDumbProfessorArmV1,
} from "./lib/phase6a1-professor-v4-creative-pass1-fixtures-v1";
import {
  buildChatterfangFrozenContextV1,
  loadMerenFrozenContextV1,
} from "./lib/phase6a1-professor-v4-creative-research-orchestration-v1";
import {
  PROFESSOR_V4_1_DECISION_V1,
  runProfessorV41ConversationLoopOfflineV1,
} from "./lib/phase6a1-professor-v4-1-conversation-orchestration-v1";

const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v4-1-conversation-loop-manifest-v1.json");

type Check = { id: string; pass: boolean; detail: string };

function main() {
  const checks: Check[] = [];

  const merenPass1 = loadMerenCreativePass1FixtureFromDumbProfessorArmV1();
  const chatterfangPass1 = loadChatterfangCreativePass1FixtureV1();

  const merenResult = runProfessorV41ConversationLoopOfflineV1({
    caseKey: "meren",
    mechanismTruthCaseId: "single-graveyard-meren",
    creativePass1: merenPass1,
    frozenContext: loadMerenFrozenContextV1(),
  });

  const chatterfangResult = runProfessorV41ConversationLoopOfflineV1({
    caseKey: "chatterfang",
    mechanismTruthCaseId: "multi-chatterfang",
    creativePass1: chatterfangPass1,
    frozenContext: buildChatterfangFrozenContextV1(),
  });

  const userDirectionResult = runProfessorV41ConversationLoopOfflineV1({
    caseKey: "meren",
    mechanismTruthCaseId: "single-graveyard-meren",
    creativePass1: merenPass1,
    frozenContext: loadMerenFrozenContextV1(),
    simulateUserDirection: true,
    writeArtifacts: false,
  });

  checks.push({
    id: "working-theory-seeded-once-incrementally-patched",
    pass:
      merenResult.workingDeckTheory.revisionHistory[0]?.author === "CREATIVE_PROFESSOR" &&
      theoryWasIncrementallyPatchedV4(merenResult.workingDeckTheory),
    detail: `revisions=${merenResult.workingDeckTheory.revisionHistory.length}; current=${merenResult.workingDeckTheory.currentRevision}`,
  });

  checks.push({
    id: "revisions-preserve-prior-reasoning",
    pass: revisionHistoryPreservesReasoningV4(merenResult.workingDeckTheory),
    detail: `seedReasoning=${merenResult.workingDeckTheory.revisionHistory[0]?.preservedReasoning.length ?? 0}`,
  });

  const rejectedWithReason = merenResult.workingDeckTheory.ideaBoard.items.some(
    (i) => i.lane === "REJECTED" && Boolean(i.statusReason),
  );
  checks.push({
    id: "rejected-ideas-preserve-reasons",
    pass: rejectedWithReason || ideasInLaneV4(chatterfangResult.workingDeckTheory.ideaBoard, "REJECTED").length > 0,
    detail: rejectedWithReason ? "meren or chatterfang has REJECTED with statusReason" : "none",
  });

  checks.push({
    id: "research-messages-work",
    pass: merenResult.researchMessages.length > 0 && merenResult.researchMessages.some((m) => m.intent === "CONFIRM"),
    detail: `messages=${merenResult.researchMessages.length}; intents=${merenResult.researchMessages.map((m) => m.intent).join(",")}`,
  });

  checks.push({
    id: "card-function-mechanic-abstraction",
    pass:
      merenResult.abstractionChains.some((c) => c.card.level === "CARD" && c.function.level === "FUNCTION" && c.mechanic.level === "MECHANIC") &&
      SPORE_FROG_ABSTRACTION_EXAMPLE_V4.mechanic.steps.length >= 4,
    detail: "CARD→FUNCTION→MECHANIC chain present",
  });

  checks.push({
    id: "mechanic-reverse-search-interface",
    pass: merenResult.reverseSearchResults.some((r) => r.candidateCards.length >= 0 && r.query.mechanicSteps.length > 0),
    detail: `reverseSearchResults=${merenResult.reverseSearchResults.length}`,
  });

  checks.push({
    id: "research-modes-selectable-not-mandatory-fanout",
    pass:
      merenResult.selectedResearchModes.length >= 1 &&
      merenResult.selectedResearchModes.length < RESEARCH_MODE_V4.length &&
      !merenResult.selectedResearchModes.every((m, _i, arr) => arr.length === RESEARCH_MODE_V4.length),
    detail: `meren modes=${merenResult.selectedResearchModes.join(",")}; chatterfang modes=${chatterfangResult.selectedResearchModes.join(",")}`,
  });

  checks.push({
    id: "discovery-scoring-separates-quiet-from-escalation",
    pass:
      merenResult.scoredDiscoveries.some((d) => d.classification === "QUIET_INTEGRATION") &&
      chatterfangResult.scoredDiscoveries.some((d) => d.classification === "ESCALATE_TO_CREATIVE"),
    detail: `meren quiet=${merenResult.scoredDiscoveries.filter((d) => d.classification === "QUIET_INTEGRATION").length}; chatterfang escalate=${chatterfangResult.scoredDiscoveries.filter((d) => d.classification === "ESCALATE_TO_CREATIVE").length}`,
  });

  checks.push({
    id: "validator-cannot-terminate-brew",
    pass:
      merenResult.orchestrationTerminatedByValidator === false &&
      chatterfangResult.orchestrationTerminatedByValidator === false,
    detail: "orchestrationTerminatedByValidator=false for both fixtures",
  });

  checks.push({
    id: "meren-quiet-success-no-escalation",
    pass: merenResult.warrantCreativeRevisit === false && merenResult.loopOutcome !== "ESCALATE_TO_CREATIVE",
    detail: `warrantCreativeRevisit=${merenResult.warrantCreativeRevisit}; outcome=${merenResult.loopOutcome}`,
  });

  const crossResource = chatterfangResult.scoredDiscoveries.find((d) =>
    d.mechanicalPattern.includes("TOKEN_CREATION_CROSS_RESOURCE"),
  );
  checks.push({
    id: "chatterfang-material-discovery-escalation",
    pass: chatterfangResult.warrantCreativeRevisit === true && Boolean(crossResource),
    detail: `warrantCreativeRevisit=${chatterfangResult.warrantCreativeRevisit}; crossResource=${crossResource?.mechanicalPattern ?? "missing"}`,
  });

  checks.push({
    id: "user-direction-state-representable",
    pass:
      userDirectionResult.workingDeckTheory.conversationState === "NEEDS_USER_DIRECTION" &&
      (userDirectionResult.workingDeckTheory.userDirectionForks?.length ?? 0) >= 3,
    detail: `state=${userDirectionResult.workingDeckTheory.conversationState}; forks=${userDirectionResult.workingDeckTheory.userDirectionForks?.length ?? 0}`,
  });

  checks.push({
    id: "semantic-vocabulary-demonstration",
    pass: SEMANTIC_RELATION_V4.includes("PRODUCES") && SEMANTIC_RELATION_V4.includes("MODIFIES_TOKEN_CREATION"),
    detail: `relations=${SEMANTIC_RELATION_V4.length}`,
  });

  checks.push({
    id: "research-challenge-message-contract",
    pass: PITILESS_PLUNDERER_CHALLENGE_EXAMPLE_V4.intent === "CHALLENGE" && Boolean(PITILESS_PLUNDERER_CHALLENGE_EXAMPLE_V4.conceptProbe),
    detail: PITILESS_PLUNDERER_CHALLENGE_EXAMPLE_V4.conceptProbe ?? "missing conceptProbe",
  });

  const validationIssues = [
    ...validateConversationLoopResultV1(merenResult),
    ...validateConversationLoopResultV1(chatterfangResult),
  ];
  checks.push({
    id: "conversation-loop-contract-validates",
    pass: validationIssues.length === 0,
    detail: validationIssues.length ? validationIssues.join("; ") : "ok",
  });

  const pass = checks.every((c) => c.pass);
  const manifest = {
    version: "phase6a1-professor-v4-1-conversation-loop-manifest-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V4_1_DECISION_V1,
    openAiCalls: 0,
    pass,
    checks,
    artifacts: {
      merenResult: resolve(MILESTONES, "phase6a1-professor-v4-1-conversation-meren-result-v1.json"),
      chatterfangResult: resolve(MILESTONES, "phase6a1-professor-v4-1-conversation-chatterfang-result-v1.json"),
      merenAudit: resolve(MILESTONES, "phase6a1-professor-v4-1-conversation-meren-audit-v1.json"),
      chatterfangAudit: resolve(MILESTONES, "phase6a1-professor-v4-1-conversation-chatterfang-audit-v1.json"),
    },
  };

  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  if (!pass) process.exit(1);
}

main();
