import type { MtgKnowledgeCorpus, MtgQueryIntent } from "./types";

const INTENT_CORPORA: Partial<Record<MtgQueryIntent, MtgKnowledgeCorpus[]>> = {
  terminology_question: ["glossary"],
  color_identity_question: ["color_identity", "glossary"],
  rules_question: ["comprehensive_rules"],
  commander_strategy: ["commander_primer", "youtube_transcript"],
  deckbuilding_education: ["youtube_transcript", "glossary"],
  mixed: ["glossary", "color_identity", "comprehensive_rules", "commander_primer", "youtube_transcript"],
};

export function corporaForIntent(intent: MtgQueryIntent): MtgKnowledgeCorpus[] {
  return INTENT_CORPORA[intent] ?? ["glossary"];
}

export function isKnowledgeIntent(intent: MtgQueryIntent): boolean {
  return (
    intent === "terminology_question" ||
    intent === "color_identity_question" ||
    intent === "rules_question" ||
    intent === "commander_strategy" ||
    intent === "deckbuilding_education" ||
    intent === "mixed"
  );
}
