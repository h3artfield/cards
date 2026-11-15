/**
 * Professor v4.1 Research Professor — selectable research modes, patch-based working deck theory.
 */
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import {
  cardToMechanicChainV4,
  reverseSearchFromMechanicV4,
  type AbstractionChainV4,
  type MechanicReverseSearchResultV4,
} from "../../src/lib/deck-synthesis/professor-abstraction-levels-v4";
import { scoreDiscoveryV4, type ScoredDiscoveryV4 } from "../../src/lib/deck-synthesis/professor-discovery-score-v4";
import { addIdeaToBoardV4, moveIdeaLaneV4, type IdeaBoardV4 } from "../../src/lib/deck-synthesis/professor-idea-board-v4";
import { createResearchMessageV4, type ResearchMessageV4 } from "../../src/lib/deck-synthesis/professor-research-message-v4";
import {
  DEMONSTRATION_SEMANTIC_QUERIES_V4,
  type SemanticQueryResultV4,
} from "../../src/lib/deck-synthesis/professor-semantic-vocabulary-v4";
import { decomposeCreativePass1ClaimsV4 } from "../../src/lib/deck-synthesis/professor-v4-critic-v1";
import {
  runAllSemanticResearchPrimitivesV4,
  type SemanticResearchPrimitiveResultV4,
} from "../../src/lib/deck-synthesis/professor-semantic-research-primitives-v4";
import {
  applyWorkingDeckTheoryPatchesV4,
  seedWorkingDeckTheoryFromCreativePass1V4,
  type WorkingDeckTheoryPatchOpV4,
  type WorkingDeckTheoryV4,
} from "../../src/lib/deck-synthesis/professor-working-deck-theory-v4";
import {
  selectResearchModesForOpenQuestionV4,
  type ResearchModeV4,
} from "../../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";

export const PROFESSOR_V4_1_RESEARCH_PROFESSOR_V1_VERSION = "phase6a1-professor-v4-1-research-professor-v1";

const GENERIC_REVERSE_SEARCH_POOL = [
  "Ashnod's Altar",
  "Phyrexian Altar",
  "Spore Frog",
  "Sakura-Tribe Elder",
  "Reassembling Skeleton",
  "Pitiless Plunderer",
  "Doubling Season",
  "Parallel Lives",
  "Academy Manufactor",
  "Jaheira, Friend of the Forest",
  "Bootleggers' Stash",
  "Smothering Tithe",
];

function thesisBlob(theory: WorkingDeckTheoryV4): string {
  return JSON.stringify(theory.thesis).toLowerCase();
}

function pickOpenQuestion(theory: WorkingDeckTheoryV4): { questionId: string; question: string } | null {
  const open = theory.openQuestions.find((q) => q.status === "OPEN");
  if (open) return { questionId: open.questionId, question: open.question };
  if (theory.weaknesses.length > 0) {
    return { questionId: "derived-weakness", question: `Verify resilience against: ${theory.weaknesses[0]}` };
  }
  return { questionId: "derived-mechanic-chain", question: "Verify core mechanic chain holds under scrutiny." };
}

function semanticResultsFromPrimitives(primitives: SemanticResearchPrimitiveResultV4[]): SemanticQueryResultV4[] {
  return primitives.slice(0, 6).map((p) => ({
    query: {
      relation: p.primitive.includes("TOKEN") ? ("MODIFIES_TOKEN_CREATION" as const) : ("PRODUCES" as const),
      subject: p.producerStateOrEvent,
      object: p.candidates[0],
    },
    matches: p.candidates,
    mechanicalBasis: p.mechanicalBasis,
  }));
}

function estimateNoveltyFromPlan(pass1: CreativeProfessorPass1V4, pattern: string): number {
  const blob = JSON.stringify(pass1).toLowerCase();
  if (pattern.includes("TOKEN_CREATION_CROSS_RESOURCE")) {
    return ["treasure", "clue", "food", "artifact token", "noncreature"].some((k) => blob.includes(k)) ? 0.55 : 0.85;
  }
  if (pattern.includes("DEATH_ETB_RESET")) {
    return blob.includes("recur") || blob.includes("experience") ? 0.25 : 0.5;
  }
  return 0.45;
}

function scorePrimitiveDiscovery(args: {
  primitive: SemanticResearchPrimitiveResultV4;
  index: number;
  pass1: CreativeProfessorPass1V4;
}): ScoredDiscoveryV4 {
  const pattern = `${args.primitive.primitive}:${args.primitive.producerStateOrEvent}`;
  const novelty = estimateNoveltyFromPlan(args.pass1, pattern);
  return scoreDiscoveryV4({
    discoveryId: `disc-${args.index + 1}`,
    mechanicalPattern: pattern,
    axes: {
      novelty,
      mechanicalConfidence: 0.7,
      strategicImpact: pattern.includes("CROSS_RESOURCE") ? 0.75 : novelty < 0.35 ? 0.2 : 0.45,
      packageCompatibility: 0.55,
      commanderRelevance: 0.6,
      resilienceGain: pattern.includes("DEATH") ? 0.5 : 0.3,
      roleCompression: 0.35,
    },
  });
}

function applyIdeaBoardToTheory(theory: WorkingDeckTheoryV4, board: IdeaBoardV4): WorkingDeckTheoryV4 {
  return { ...theory, ideaBoard: board };
}

function runModeResearch(args: {
  mode: ResearchModeV4;
  theory: WorkingDeckTheoryV4;
  primitives: SemanticResearchPrimitiveResultV4[];
  revision: number;
}): { messages: ResearchMessageV4[]; patches: WorkingDeckTheoryPatchOpV4[]; board: IdeaBoardV4 } {
  const messages: ResearchMessageV4[] = [];
  const patches: WorkingDeckTheoryPatchOpV4[] = [];
  let board = args.theory.ideaBoard;

  if (args.mode === "MECHANIC") {
    const deathChain = args.primitives.find((p) => p.primitive === "DEATH_ETB_RESET_LOOPS");
    if (deathChain) {
      const msg = createResearchMessageV4({
        messageId: `msg-mechanic-${args.revision}`,
        intent: "CONFIRM",
        revision: args.revision,
        body: `Core chain verified: ${deathChain.mechanicalBasis}`,
        conceptProbe: "creature dies → graveyard resource → recursion",
      });
      messages.push(msg);
      patches.push({ op: "ADD_RESEARCH_MESSAGE", message: msg });
      patches.push({
        op: "ADD_VERIFIED_DISCOVERY",
        discovery: {
          discoveryId: "verified-death-recur",
          summary: deathChain.mechanicalBasis,
          mechanicalPattern: `${deathChain.primitive}:${deathChain.producerStateOrEvent}`,
          provenance: { source: "MECHANISM_FACT", confidence: "HIGH" },
          revision: args.revision,
        },
      });
    }
  }

  if (args.mode === "EXPLORER") {
    const cross = args.primitives.find((p) => p.primitive === "TOKEN_CREATION_CROSS_RESOURCE");
    if (cross) {
      const msg = createResearchMessageV4({
        messageId: `msg-explore-${args.revision}`,
        intent: "DISCOVERY",
        revision: args.revision,
        body: `One token event may produce two resource classes — ${cross.mechanicalBasis}`,
        conceptProbe: "token event → original resource + additional creature-token resource",
      });
      messages.push(msg);
      patches.push({ op: "ADD_RESEARCH_MESSAGE", message: msg });
      board = addIdeaToBoardV4({
        board,
        idea: {
          title: "Cross-resource token engines",
          description: cross.mechanicalBasis,
          lane: "EXPLORE",
          origin: { source: "RESEARCH_PROFESSOR", confidence: "MEDIUM" },
          mechanicalBasis: [cross.producerStateOrEvent],
          relatedPackages: args.theory.packages.slice(0, 2).map((p) => p.packageId),
          evidenceRefs: cross.evidenceRefs,
          createdRevision: args.revision,
        },
      });
    } else {
      board = addIdeaToBoardV4({
        board,
        idea: {
          title: "Adjacent sacrifice payoffs",
          description: "Search for batch-sacrifice scaling payoffs in unexplored mechanical space.",
          lane: "EXPLORE",
          origin: { source: "RESEARCH_PROFESSOR", confidence: "LOW" },
          mechanicalBasis: ["SACRIFICE_COUNT_SCALES_EFFECT"],
          relatedPackages: [],
          evidenceRefs: [],
          createdRevision: args.revision,
        },
      });
    }
  }

  if (args.mode === "SKEPTIC") {
    const highDep = args.theory.packages.filter((p) => p.commanderDependence === "HIGH");
    if (highDep.length > 0) {
      const msg = createResearchMessageV4({
        messageId: `msg-skeptic-${args.revision}`,
        intent: "WARNING",
        revision: args.revision,
        body: `Commander-dependent packages (${highDep.map((p) => p.name).join(", ")}) may make the plan fragile.`,
        relatedPackageIds: highDep.map((p) => p.packageId),
      });
      messages.push(msg);
      patches.push({ op: "ADD_RESEARCH_MESSAGE", message: msg });
      patches.push({ op: "ADD_WEAKNESS", item: "Commander dependency concentration in core packages." });
    }
  }

  if (args.mode === "ENGINEER") {
    const msg = createResearchMessageV4({
      messageId: `msg-engineer-${args.revision}`,
      intent: "PROPOSAL",
      revision: args.revision,
      body: "Can sacrifice outlets double as token producers or draw engines to compress roles?",
      conceptProbe: "role compression via dual-purpose slots",
    });
    messages.push(msg);
    patches.push({ op: "ADD_RESEARCH_MESSAGE", message: msg });
  }

  if (args.mode === "CONTRARIAN") {
    board = addIdeaToBoardV4({
      board,
      idea: {
        title: "Avoid obvious token-aristocrat lane",
        description: "Pursue noncreature token value engines fed by the same creation event.",
        lane: "WEIRD",
        origin: { source: "RESEARCH_PROFESSOR", confidence: "SPECULATIVE" },
        mechanicalBasis: ["MODIFY_TOKEN_CREATION_PRESERVES_ORIGINAL"],
        relatedPackages: [],
        evidenceRefs: [],
        createdRevision: args.revision,
      },
    });
    const weird = board.items.find((i) => i.lane === "WEIRD");
    if (weird) {
      board = moveIdeaLaneV4({
        board,
        ideaId: weird.ideaId,
        lane: "REJECTED",
        statusReason: "Explored contrarian branch — not adopted; preserves reason to avoid re-debate.",
      });
    }
  }

  return { messages, patches, board };
}

export type ResearchProfessorV41RunResultV1 = {
  workingDeckTheory: WorkingDeckTheoryV4;
  selectedResearchModes: ResearchModeV4[];
  currentOpenQuestionId: string | null;
  researchMessages: ResearchMessageV4[];
  scoredDiscoveries: ScoredDiscoveryV4[];
  abstractionChains: AbstractionChainV4[];
  reverseSearchResults: MechanicReverseSearchResultV4[];
  semanticQueryResults: SemanticQueryResultV4[];
  criticAnnotations: { claimId: string; annotation: string; notes: string }[];
  semanticPrimitiveResults: SemanticResearchPrimitiveResultV4[];
};

export function runResearchProfessorV41OfflineV1(args: {
  ctx: ProfessorPlanningContextV3;
  pass1: CreativeProfessorPass1V4;
}): ResearchProfessorV41RunResultV1 {
  let theory = seedWorkingDeckTheoryFromCreativePass1V4({ pass1: args.pass1 });
  const criticAnnotations = decomposeCreativePass1ClaimsV4({ ctx: args.ctx, pass1: args.pass1 }).map((c) => ({
    claimId: c.claimId,
    annotation: c.annotation,
    notes: c.notes,
  }));

  const primitives = runAllSemanticResearchPrimitivesV4(args.ctx);
  const hasCrossResourceSignal = primitives.some((p) => p.primitive === "TOKEN_CREATION_CROSS_RESOURCE");

  const openQ = pickOpenQuestion(theory);
  const selectedResearchModes = selectResearchModesForOpenQuestionV4({
    openQuestion: openQ?.question ?? "",
    thesisBlob: thesisBlob(theory),
    hasCrossResourceSignal,
  });

  const abstractionChains: AbstractionChainV4[] = [
    cardToMechanicChainV4({
      cardName: "Spore Frog",
      functionLabel: "repeatable combat protection",
      mechanicSteps: ["creature", "sacrifice self", "prevent combat damage", "enters graveyard", "recur from graveyard"],
    }),
  ];

  const reverseSearchResults = [
    reverseSearchFromMechanicV4({
      query: {
        mechanicSteps: ["sacrifice self", "prevent combat damage", "enters graveyard"],
        excludeCardNames: ["Spore Frog"],
      },
      candidatePool: GENERIC_REVERSE_SEARCH_POOL,
    }),
  ];

  const semanticQueryResults: SemanticQueryResultV4[] = [
    ...semanticResultsFromPrimitives(primitives),
    ...DEMONSTRATION_SEMANTIC_QUERIES_V4.slice(0, 3).map((q) => ({
      query: q,
      matches: [],
      mechanicalBasis: `Demonstration query: ${q.relation}`,
    })),
  ];

  const scoredDiscoveries = primitives.map((p, i) =>
    scorePrimitiveDiscovery({ primitive: p, index: i, pass1: args.pass1 }),
  );

  const allPatches: WorkingDeckTheoryPatchOpV4[] = [];
  const allMessages: ResearchMessageV4[] = [];
  let board = theory.ideaBoard;
  const nextRevision = theory.currentRevision + 1;

  for (const mode of selectedResearchModes) {
    const modeResult = runModeResearch({ mode, theory, primitives, revision: nextRevision });
    allMessages.push(...modeResult.messages);
    allPatches.push(...modeResult.patches);
    board = modeResult.board;
  }

  for (const scored of scoredDiscoveries) {
    if (scored.classification === "IDEA_BOARD" || scored.classification === "QUIET_INTEGRATION") {
      board = addIdeaToBoardV4({
        board,
        idea: {
          title: scored.mechanicalPattern.split(":")[0] ?? scored.mechanicalPattern,
          description: scored.classificationReason,
          lane: scored.classification === "QUIET_INTEGRATION" ? "VERIFY" : "EXPLORE",
          origin: { source: "SEMANTIC_ORACLE", confidence: "MEDIUM" },
          mechanicalBasis: [scored.mechanicalPattern],
          relatedPackages: [],
          evidenceRefs: [],
          discoveryScore: scored.compositeScore,
          createdRevision: nextRevision,
        },
      });
    }
  }

  theory = applyWorkingDeckTheoryPatchesV4({
    theory: applyIdeaBoardToTheory(theory, board),
    author: "RESEARCH_PROFESSOR",
    summary: `Research pass with modes: ${selectedResearchModes.join(", ")}`,
    patches: allPatches,
    preservedReasoning: [`Open question: ${openQ?.question ?? "none"}`, ...criticAnnotations.slice(0, 2).map((c) => c.notes)],
  });

  const rejectCandidate = theory.ideaBoard.items.find(
    (i) =>
      i.lane === "VERIFY" ||
      (i.lane === "EXPLORE" &&
        !scoredDiscoveries.some(
          (d) =>
            (d.classification === "ESCALATE_TO_CREATIVE" || d.classification === "MAJOR_CONTRADICTION") &&
            i.mechanicalBasis.some((b) => d.mechanicalPattern.includes(b)),
        )),
  );
  if (rejectCandidate && !theory.ideaBoard.items.some((i) => i.lane === "REJECTED")) {
    board = moveIdeaLaneV4({
      board: theory.ideaBoard,
      ideaId: rejectCandidate.ideaId,
      lane: "REJECTED",
      statusReason: "Explored branch — insufficient strategic impact for current thesis; retain to avoid re-debate.",
    });
    theory = applyWorkingDeckTheoryPatchesV4({
      theory: applyIdeaBoardToTheory(theory, board),
      author: "RESEARCH_PROFESSOR",
      summary: "Rejected explored branch with preserved reason.",
      patches: [],
      preservedReasoning: [rejectCandidate.title],
    });
  }

  return {
    workingDeckTheory: theory,
    selectedResearchModes,
    currentOpenQuestionId: openQ?.questionId ?? null,
    researchMessages: allMessages,
    scoredDiscoveries,
    abstractionChains,
    reverseSearchResults,
    semanticQueryResults,
    criticAnnotations,
    semanticPrimitiveResults: primitives,
  };
}
