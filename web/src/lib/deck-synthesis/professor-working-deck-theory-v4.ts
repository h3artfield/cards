/**
 * WorkingDeckTheory v4 — shared living deck object with patch-based revisions.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { DependencyLevel } from "./professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { IdeaBoardV4 } from "./professor-idea-board-v4";
import { createEmptyIdeaBoardV4 } from "./professor-idea-board-v4";
import type { ProvenanceRefV4 } from "./professor-provenance-v4";
import type { ResearchMessageV4 } from "./professor-research-message-v4";

export const PROFESSOR_WORKING_DECK_THEORY_V4_VERSION = "professor-working-deck-theory-v4";

export type WorkingDeckPackageV4 = {
  packageId: string;
  name: string;
  purpose: string;
  commanderDependence: DependencyLevel;
  status: "CORE" | "EXPLORING" | "WEAK" | "REJECTED";
  inputs: string[];
  outputs: string[];
  roles: string[];
  candidateCards: string[];
  evidenceRefs: EvidenceRef[];
  notes: string[];
};

export type WorkingDeckThesisV4 = {
  summary: string;
  deckIdentity: string;
  mechanicChain: string[];
};

export type WorkingDeckOpenQuestionV4 = {
  questionId: string;
  question: string;
  status: "OPEN" | "ANSWERED" | "NEEDS_USER";
  answer?: string;
};

export type VerifiedDiscoveryV4 = {
  discoveryId: string;
  summary: string;
  mechanicalPattern: string;
  provenance: ProvenanceRefV4;
  revision: number;
};

export type WorkingDeckTheoryRevisionV4 = {
  revision: number;
  author: ProvenanceRefV4["source"];
  summary: string;
  patches: WorkingDeckTheoryPatchOpV4[];
  preservedReasoning: string[];
};

export type ConversationStateV4 =
  | "RESEARCHING"
  | "NEEDS_USER_DIRECTION"
  | "ESCALATE_TO_CREATIVE"
  | "COMPLETE";

export type UserDirectionForkV4 = {
  forkId: string;
  label: string;
  description: string;
  whyInteresting: string;
  conventionality: "CONVENTIONAL" | "MODERATE" | "UNCONVENTIONAL";
  commanderDependence: DependencyLevel;
  mechanicalConfidence: "HIGH" | "MEDIUM" | "LOW";
  expectedPlayStyle: string;
};

export type WorkingDeckTheoryV4 = {
  version: typeof PROFESSOR_WORKING_DECK_THEORY_V4_VERSION;
  commander: string;
  userIntent: string[];
  thesis: WorkingDeckThesisV4;
  packages: WorkingDeckPackageV4[];
  winPaths: { id: string; description: string; commanderDependence: DependencyLevel; evidenceRefs: EvidenceRef[] }[];
  independentEngines: {
    id: string;
    description: string;
    worksWithoutCommander: DependencyLevel;
    evidenceRefs: EvidenceRef[];
  }[];
  resiliencePlan: string[];
  weaknesses: string[];
  openQuestions: WorkingDeckOpenQuestionV4[];
  verifiedDiscoveries: VerifiedDiscoveryV4[];
  ideaBoard: IdeaBoardV4;
  conversationState: ConversationStateV4;
  userDirectionForks?: UserDirectionForkV4[];
  researchMessages: ResearchMessageV4[];
  revisionHistory: WorkingDeckTheoryRevisionV4[];
  currentRevision: number;
};

export type WorkingDeckTheoryPatchOpV4 =
  | { op: "ADD_OPEN_QUESTION"; question: WorkingDeckOpenQuestionV4 }
  | { op: "ANSWER_OPEN_QUESTION"; questionId: string; answer: string }
  | { op: "ADD_VERIFIED_DISCOVERY"; discovery: VerifiedDiscoveryV4 }
  | { op: "UPDATE_PACKAGE_STATUS"; packageId: string; status: WorkingDeckPackageV4["status"]; note?: string }
  | { op: "ADD_PACKAGE_NOTE"; packageId: string; note: string }
  | { op: "ADD_RESILIENCE"; item: string }
  | { op: "ADD_WEAKNESS"; item: string }
  | { op: "SET_CONVERSATION_STATE"; state: ConversationStateV4; userDirectionForks?: UserDirectionForkV4[] }
  | { op: "ADD_RESEARCH_MESSAGE"; message: ResearchMessageV4 };

export function seedWorkingDeckTheoryFromCreativePass1V4(args: {
  pass1: CreativeProfessorPass1V4;
  userIntent?: string[];
}): WorkingDeckTheoryV4 {
  const packages: WorkingDeckPackageV4[] = args.pass1.packages.map((pkg) => ({
    packageId: pkg.id,
    name: pkg.concept,
    purpose: pkg.purpose,
    commanderDependence: pkg.commanderDependence,
    status: "CORE",
    inputs: pkg.likelyCardsOrEffects.filter((c) => /produce|create|generate|add/i.test(c)),
    outputs: pkg.likelyCardsOrEffects.filter((c) => /payoff|drain|win|finish|scale/i.test(c)),
    roles: pkg.likelyCardsOrEffects,
    candidateCards: pkg.likelyCardsOrEffects,
    evidenceRefs: pkg.evidenceRefs ?? [],
    notes: [pkg.whyInteresting],
  }));

  const openQuestions: WorkingDeckOpenQuestionV4[] = args.pass1.openQuestions.map((q, i) => ({
    questionId: `oq-${i + 1}`,
    question: q,
    status: "OPEN",
  }));

  const seedRevision: WorkingDeckTheoryRevisionV4 = {
    revision: 0,
    author: "CREATIVE_PROFESSOR",
    summary: "Initial deck thesis seeded from Creative pass-1.",
    patches: [],
    preservedReasoning: [
      args.pass1.strategicThesis,
      ...args.pass1.mechanicInterpretation.slice(0, 3),
      ...args.pass1.confidenceNotes,
    ],
  };

  return {
    version: PROFESSOR_WORKING_DECK_THEORY_V4_VERSION,
    commander: args.pass1.commander,
    userIntent: args.userIntent ?? ["Improve one coherent deck collaboratively"],
    thesis: {
      summary: args.pass1.strategicThesis,
      deckIdentity: args.pass1.mechanicInterpretation[0] ?? args.pass1.strategicThesis.slice(0, 120),
      mechanicChain: args.pass1.mechanicInterpretation,
    },
    packages,
    winPaths: args.pass1.winPaths.map((w) => ({
      id: w.id,
      description: w.description,
      commanderDependence: w.commanderDependence,
      evidenceRefs: w.evidenceRefs ?? [],
    })),
    independentEngines: args.pass1.independentEngines.map((e) => ({
      id: e.id,
      description: e.description,
      worksWithoutCommander: e.worksWithoutCommander,
      evidenceRefs: e.evidenceRefs ?? [],
    })),
    resiliencePlan: [],
    weaknesses: [...args.pass1.vulnerabilities],
    openQuestions,
    verifiedDiscoveries: [],
    ideaBoard: createEmptyIdeaBoardV4(),
    conversationState: "RESEARCHING",
    researchMessages: [],
    revisionHistory: [seedRevision],
    currentRevision: 0,
  };
}

export function applyWorkingDeckTheoryPatchesV4(args: {
  theory: WorkingDeckTheoryV4;
  author: ProvenanceRefV4["source"];
  summary: string;
  patches: WorkingDeckTheoryPatchOpV4[];
  preservedReasoning?: string[];
}): WorkingDeckTheoryV4 {
  let next = { ...args.theory };
  const nextRevision = next.currentRevision + 1;

  for (const patch of args.patches) {
    switch (patch.op) {
      case "ADD_OPEN_QUESTION":
        next = { ...next, openQuestions: [...next.openQuestions, patch.question] };
        break;
      case "ANSWER_OPEN_QUESTION":
        next = {
          ...next,
          openQuestions: next.openQuestions.map((q) =>
            q.questionId === patch.questionId ? { ...q, status: "ANSWERED", answer: patch.answer } : q,
          ),
        };
        break;
      case "ADD_VERIFIED_DISCOVERY":
        next = { ...next, verifiedDiscoveries: [...next.verifiedDiscoveries, patch.discovery] };
        break;
      case "UPDATE_PACKAGE_STATUS":
        next = {
          ...next,
          packages: next.packages.map((p) =>
            p.packageId === patch.packageId
              ? { ...p, status: patch.status, notes: patch.note ? [...p.notes, patch.note] : p.notes }
              : p,
          ),
        };
        break;
      case "ADD_PACKAGE_NOTE":
        next = {
          ...next,
          packages: next.packages.map((p) =>
            p.packageId === patch.packageId ? { ...p, notes: [...p.notes, patch.note] } : p,
          ),
        };
        break;
      case "ADD_RESILIENCE":
        next = { ...next, resiliencePlan: [...next.resiliencePlan, patch.item] };
        break;
      case "ADD_WEAKNESS":
        next = { ...next, weaknesses: [...next.weaknesses, patch.item] };
        break;
      case "SET_CONVERSATION_STATE":
        next = {
          ...next,
          conversationState: patch.state,
          userDirectionForks: patch.userDirectionForks ?? next.userDirectionForks,
        };
        break;
      case "ADD_RESEARCH_MESSAGE":
        next = { ...next, researchMessages: [...next.researchMessages, patch.message] };
        break;
    }
  }

  const revision: WorkingDeckTheoryRevisionV4 = {
    revision: nextRevision,
    author: args.author,
    summary: args.summary,
    patches: args.patches,
    preservedReasoning: args.preservedReasoning ?? [],
  };

  return {
    ...next,
    currentRevision: nextRevision,
    revisionHistory: [...next.revisionHistory, revision],
  };
}

export function theoryWasIncrementallyPatchedV4(theory: WorkingDeckTheoryV4): boolean {
  return theory.revisionHistory.length > 1 && theory.currentRevision > 0;
}

export function revisionHistoryPreservesReasoningV4(theory: WorkingDeckTheoryV4): boolean {
  const seed = theory.revisionHistory[0];
  if (!seed) return false;
  return seed.preservedReasoning.length > 0 && theory.revisionHistory.every((r) => r.patches !== undefined);
}
