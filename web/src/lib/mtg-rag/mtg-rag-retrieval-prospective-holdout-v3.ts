/**
 * Prospective non-gold MTG RAG retrieval holdout v3.
 * Sealed after automated integrity validation — disjoint from spent v1/v2 and DEV 45.
 */
import type { MtgKnowledgeRetrievalMode } from "../deck-intelligence/mtg-knowledge-service";
import type { HoldoutIntegrityExpectation } from "./holdout-integrity";

export type MtgRagRetrievalHoldoutQuery = {
  id: string;
  mode: MtgKnowledgeRetrievalMode;
  query: string;
  commanderName?: string;
  designNote: string;
  integrityExpectation?: HoldoutIntegrityExpectation;
};

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3_VERSION =
  "mtg-rag-retrieval-prospective-holdout-v3";

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3: MtgRagRetrievalHoldoutQuery[] = [
  {
    id: "holdout-v3-rules-01",
    mode: "RULES",
    query: "120.5 damage marked on creatures until cleanup",
    designNote: "Validated damage-marking anchor.",
    integrityExpectation: { ruleRef: "120.5", conceptTerms: ["damage", "marked", "creature"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-02",
    mode: "RULES",
    query: "702.7 first strike combat damage step before regular",
    designNote: "Validated first strike keyword anchor.",
    integrityExpectation: { ruleRef: "702.7", conceptTerms: ["first strike", "combat", "damage"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-03",
    mode: "RULES",
    query: "104.3b life total zero or less player loses the game",
    designNote: "Validated zero-life loss anchor.",
    integrityExpectation: { ruleRef: "104.3", conceptTerms: ["life", "loses", "game"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-04",
    mode: "RULES",
    query: "117.3 priority active player may cast activate",
    designNote: "Validated priority anchor.",
    integrityExpectation: { ruleRef: "117.3", conceptTerms: ["priority", "player", "cast"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-05",
    mode: "RULES",
    query: "400.7 object changed zones is new object with no memory",
    designNote: "Validated zone-change memory anchor.",
    integrityExpectation: { ruleRef: "400.7", conceptTerms: ["zone", "object", "memory"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-06",
    mode: "RULES",
    query: "405.2 stack top last added order resolves",
    designNote: "Validated stack order anchor.",
    integrityExpectation: { ruleRef: "405.2", conceptTerms: ["stack", "top", "order"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-07",
    mode: "RULES",
    query: "306.8 damage planeswalker loyalty counters removed",
    designNote: "Validated planeswalker damage anchor.",
    integrityExpectation: { ruleRef: "306.8", conceptTerms: ["planeswalker", "loyalty", "damage"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-08",
    mode: "RULES",
    query: "605.1 mana abilities do not use the stack",
    designNote: "Validated mana ability anchor.",
    integrityExpectation: { ruleRef: "605.1", conceptTerms: ["mana", "ability", "stack"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-09",
    mode: "RULES",
    query: "402.2 hand maximum size seven discard",
    designNote: "Validated hand size anchor.",
    integrityExpectation: { ruleRef: "402.2", conceptTerms: ["hand", "maximum", "discard"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-10",
    mode: "RULES",
    query: "903.9 commander state based action command zone graveyard exile",
    designNote: "Validated commander SB action anchor.",
    integrityExpectation: { ruleRef: "903.9", conceptTerms: ["commander", "command zone", "state"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-11",
    mode: "RULES",
    query: "701.19 regenerate replaces destruction",
    designNote: "Validated regeneration anchor.",
    integrityExpectation: { ruleRef: "701.19", conceptTerms: ["regenerate", "destruction", "replace"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-rules-12",
    mode: "RULES",
    query: "111.7 token zone other than battlefield ceases to exist",
    designNote: "Validated token zone SB anchor.",
    integrityExpectation: { ruleRef: "111.7", conceptTerms: ["token", "ceases", "exist"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-strategy-01",
    mode: "STRATEGY",
    query: "mass draw wheel effects strategy Commander",
    designNote: "Alias specificity / wheel sense disambiguation probe.",
  },
  {
    id: "holdout-v3-strategy-02",
    mode: "STRATEGY",
    query: "stax resource denial hate pieces strategy Commander",
    designNote: "Stax glossary-title probe.",
  },
  {
    id: "holdout-v3-strategy-03",
    mode: "STRATEGY",
    query: "voltron equipment aura protection win condition strategy",
    designNote: "Voltron glossary-title probe.",
  },
  {
    id: "holdout-v3-strategy-04",
    mode: "STRATEGY",
    query: "aristocrats sacrifice outlets death triggers strategy Commander",
    designNote: "Aristocrats strategy probe.",
  },
  {
    id: "holdout-v3-strategy-05",
    mode: "STRATEGY",
    query: "tokens go wide anthems combat strategy Commander",
    designNote: "Token strategy probe.",
  },
  {
    id: "holdout-v3-strategy-06",
    mode: "STRATEGY",
    query: "blink flicker ETB value strategy Commander",
    designNote: "Blink strategy probe.",
  },
  {
    id: "holdout-v3-interaction-01",
    mode: "INTERACTION",
    query: "510.1 blocking creature assign combat damage order",
    designNote: "Blocking damage assignment interaction.",
    integrityExpectation: { ruleRef: "510.1", conceptTerms: ["block", "damage", "assign"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-interaction-02",
    mode: "INTERACTION",
    query: "613.1 layers dependency continuous effects timestamps",
    designNote: "Layers interaction anchor.",
    integrityExpectation: { ruleRef: "613.1", conceptTerms: ["layer", "dependency", "timestamp"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-interaction-03",
    mode: "INTERACTION",
    query: "614.1 replacement effects modify events before they happen",
    designNote: "Replacement effect interaction anchor.",
    integrityExpectation: { ruleRef: "614.1", conceptTerms: ["replacement", "event", "modify"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-interaction-04",
    mode: "INTERACTION",
    query: "205.4 legendary legend rule state-based action",
    designNote: "Legend rule supertype anchor.",
    integrityExpectation: { ruleRef: "205.4", conceptTerms: ["legendary", "legend", "state-based"], minConceptMatches: 2 },
  },
  {
    id: "holdout-v3-primer-01",
    mode: "COMMANDER_PRIMER",
    query: "Korvold Fae-Cursed King sacrifice growth strategy overview",
    commanderName: "Korvold, Fae-Cursed King",
    designNote: "Commander primer exact-field probe.",
  },
  {
    id: "holdout-v3-primer-02",
    mode: "COMMANDER_PRIMER",
    query: "Wilhelt the Rotcleaver zombie aristocrats strategy plan",
    commanderName: "Wilhelt, the Rotcleaver",
    designNote: "Commander primer exact-field probe.",
  },
  {
    id: "holdout-v3-primer-03",
    mode: "COMMANDER_PRIMER",
    query: "Teysa Karlov death triggers doubled strategy engines",
    commanderName: "Teysa Karlov",
    designNote: "Commander primer exact-field probe.",
  },
  {
    id: "holdout-v3-primer-04",
    mode: "COMMANDER_PRIMER",
    query: "Prosper Tome-Bound exile matters treasure strategy",
    commanderName: "Prosper, Tome-Bound",
    designNote: "Commander primer exact-field probe.",
  },
  {
    id: "holdout-v3-package-01",
    mode: "PACKAGE",
    query: "Korvold sacrifice package enablers payoffs roles",
    commanderName: "Korvold, Fae-Cursed King",
    designNote: "Package mode commander-aware probe.",
  },
  {
    id: "holdout-v3-package-02",
    mode: "PACKAGE",
    query: "Wilhelt zombie aristocrats package sacrifice outlet roles",
    commanderName: "Wilhelt, the Rotcleaver",
    designNote: "Package mode zombie aristocrats probe.",
  },
  {
    id: "holdout-v3-package-03",
    mode: "PACKAGE",
    query: "Treasure token engine package mana acceleration roles",
    designNote: "Treasure package probe.",
  },
  {
    id: "holdout-v3-package-04",
    mode: "PACKAGE",
    query: "Blink ETB package enablers payoff roles Commander",
    designNote: "Blink package probe.",
  },
];

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3_QUERY_COUNT =
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V3.length;
