/**
 * ResearchMessage v4 — Research Professor speaks to Creative Professor as another brewer.
 */
import type { ProvenanceRefV4 } from "./professor-provenance-v4";

export const PROFESSOR_RESEARCH_MESSAGE_V4_VERSION = "professor-research-message-v4";

export const RESEARCH_MESSAGE_INTENT_V4 = [
  "CONFIRM",
  "QUESTION",
  "CHALLENGE",
  "DISCOVERY",
  "ALTERNATIVE",
  "WARNING",
  "PROPOSAL",
  "USER_CHOICE",
] as const;

export type ResearchMessageIntentV4 = (typeof RESEARCH_MESSAGE_INTENT_V4)[number];

export type ResearchMessageV4 = {
  messageId: string;
  intent: ResearchMessageIntentV4;
  body: string;
  /** Optional concept the research is probing (card/function/mechanic abstraction). */
  conceptProbe?: string;
  relatedOpenQuestionId?: string;
  relatedPackageIds?: string[];
  provenance: ProvenanceRefV4;
  revision: number;
};

export function createResearchMessageV4(args: {
  messageId: string;
  intent: ResearchMessageIntentV4;
  body: string;
  revision: number;
  conceptProbe?: string;
  relatedOpenQuestionId?: string;
  relatedPackageIds?: string[];
  provenance?: ProvenanceRefV4;
}): ResearchMessageV4 {
  return {
    messageId: args.messageId,
    intent: args.intent,
    body: args.body,
    conceptProbe: args.conceptProbe,
    relatedOpenQuestionId: args.relatedOpenQuestionId,
    relatedPackageIds: args.relatedPackageIds,
    provenance: args.provenance ?? { source: "RESEARCH_PROFESSOR", confidence: "MEDIUM" },
    revision: args.revision,
  };
}

/** Example challenge message — probe concept behind a card, not just similar card names. */
export const PITILESS_PLUNDERER_CHALLENGE_EXAMPLE_V4: ResearchMessageV4 = createResearchMessageV4({
  messageId: "example-challenge-plunderer",
  intent: "CHALLENGE",
  revision: 0,
  conceptProbe: "controlled creature dies → reusable resource",
  body:
    "You are using Pitiless Plunderer as part of the finish, but the actual property we appear to need is: controlled creature dies → reusable resource. Is Plunderer essential to the strategy, or should I search for alternative death-resource converters?",
  provenance: { source: "RESEARCH_PROFESSOR", confidence: "MEDIUM", note: "Example fixture message" },
});
