/**
 * Prospective non-gold MTG RAG retrieval holdout v1.
 * Fresh queries — disjoint from spent Professor-v2 45-query DEV diagnostic set.
 * Do not tune retrieval against this set before independent semantic adjudication.
 */
import type { MtgKnowledgeRetrievalMode } from "../deck-intelligence/mtg-knowledge-service";

export type MtgRagRetrievalHoldoutQuery = {
  id: string;
  mode: MtgKnowledgeRetrievalMode;
  query: string;
  commanderName?: string;
  designNote: string;
};

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1_VERSION =
  "mtg-rag-retrieval-prospective-holdout-v1";

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1: MtgRagRetrievalHoldoutQuery[] = [
  {
    id: "holdout-rules-01",
    mode: "RULES",
    query: "613.1 layers continuous effects dependency order timestamps",
    designNote: "Layers rule anchor — not in spent DEV 45.",
  },
  {
    id: "holdout-rules-02",
    mode: "RULES",
    query: "614.1 replacement effects modify events before they happen",
    designNote: "Replacement-effect anchor.",
  },
  {
    id: "holdout-rules-03",
    mode: "RULES",
    query: "704.5k legend rule two legendary permanents same name controller",
    designNote: "Legend SB action — distinct from DEV combat/506 queries.",
  },
  {
    id: "holdout-rules-04",
    mode: "RULES",
    query: "117.1 timing priority player with priority may cast activate",
    designNote: "Priority fundamentals.",
  },
  {
    id: "holdout-rules-05",
    mode: "RULES",
    query: "400.7 object changed zones is new object with no memory",
    designNote: "Zone-change memory rule.",
  },
  {
    id: "holdout-rules-06",
    mode: "RULES",
    query: "701.4 counter target spell or ability on stack",
    designNote: "Counter definition anchor.",
  },
  {
    id: "holdout-rules-07",
    mode: "RULES",
    query: "303.4 planeswalker loyalty counters damage and combat",
    designNote: "Planeswalker rules section.",
  },
  {
    id: "holdout-rules-08",
    mode: "RULES",
    query: "605.1 mana abilities do not use the stack",
    designNote: "Mana ability timing.",
  },
  {
    id: "holdout-rules-09",
    mode: "RULES",
    query: "122.6 maximum hand size seven discard end step",
    designNote: "Hand size / discard rule.",
  },
  {
    id: "holdout-rules-10",
    mode: "RULES",
    query: "903.2 commander begins the game in the command zone",
    designNote: "Command zone start — distinct framing from DEV 903.9 SB action.",
  },
  {
    id: "holdout-rules-11",
    mode: "RULES",
    query: "702.2 banding assign combat damage",
    designNote: "Keyword ability anchor not covered in DEV ward/unearth set.",
  },
  {
    id: "holdout-rules-12",
    mode: "RULES",
    query: "704.5b player loses the game with zero or less life",
    designNote: "Zero-life SB action.",
  },
  {
    id: "holdout-strategy-01",
    mode: "STRATEGY",
    query: "Commander aristocrats strategy death triggers sacrifice outlets package",
    designNote: "Generic aristocrats strategy — not Chainer-specific DEV query.",
  },
  {
    id: "holdout-strategy-02",
    mode: "STRATEGY",
    query: "mono green Commander ramp land acceleration package strategy",
    designNote: "Ramp archetype strategy.",
  },
  {
    id: "holdout-strategy-03",
    mode: "STRATEGY",
    query: "Voltron commander equipment aura protection win condition strategy",
    designNote: "Voltron archetype.",
  },
  {
    id: "holdout-strategy-04",
    mode: "STRATEGY",
    query: "cedh combo protection density interaction ratio strategy",
    designNote: "Competitive combo-protection framing.",
  },
  {
    id: "holdout-strategy-05",
    mode: "STRATEGY",
    query: "stax resource denial hate pieces strategy Commander",
    designNote: "Stax archetype.",
  },
  {
    id: "holdout-strategy-06",
    mode: "STRATEGY",
    query: "tokens go-wide anthems combat strategy Commander",
    designNote: "Token strategy — distinct from DEV Krenko case.",
  },
  {
    id: "holdout-interaction-01",
    mode: "INTERACTION",
    query: "613 layers dependency continuous effects same layer timestamp order",
    designNote: "Interaction-mode layers query.",
  },
  {
    id: "holdout-interaction-02",
    mode: "INTERACTION",
    query: "replacement effect prevention shield damage redirection interaction",
    designNote: "Replacement vs prevention interaction.",
  },
  {
    id: "holdout-interaction-03",
    mode: "INTERACTION",
    query: "legend rule two legendary permanents same name same controller",
    designNote: "Legend interaction — rules + glossary cross-corpus.",
  },
  {
    id: "holdout-interaction-04",
    mode: "INTERACTION",
    query: "split second spell on stack players cannot cast except mana abilities",
    designNote: "Split second interaction anchor.",
  },
  {
    id: "holdout-primer-01",
    mode: "COMMANDER_PRIMER",
    query: "Meren of Clan Nel Toth experience counters reanimation engines overview",
    commanderName: "Meren of Clan Nel Toth",
    designNote: "Commander present in primer corpus.",
  },
  {
    id: "holdout-primer-02",
    mode: "COMMANDER_PRIMER",
    query: "Atraxa Praetors Voice proliferate counter strategy plan",
    commanderName: "Atraxa, Praetors' Voice",
    designNote: "Commander present in primer corpus.",
  },
  {
    id: "holdout-primer-03",
    mode: "COMMANDER_PRIMER",
    query: "Muldrotha the Gravetide graveyard permanent once per turn recursion",
    commanderName: "Muldrotha, the Gravetide",
    designNote: "Commander present in primer corpus.",
  },
  {
    id: "holdout-primer-04",
    mode: "COMMANDER_PRIMER",
    query: "Zaxara the Seminal Sanctifier hydra enchantment triggers strategy",
    commanderName: "Zaxara, the Seminal Sanctifier",
    designNote: "Commander present in primer corpus.",
  },
  {
    id: "holdout-package-01",
    mode: "PACKAGE",
    query: "Meren aristocrats package sacrifice outlets enablers payoffs",
    commanderName: "Meren of Clan Nel Toth",
    designNote: "Package mode should search commander_primer + transcript + glossary.",
  },
  {
    id: "holdout-package-02",
    mode: "PACKAGE",
    query: "Atraxa proliferate planeswalker counter synergies package roles",
    commanderName: "Atraxa, Praetors' Voice",
    designNote: "Package mode proliferate roles.",
  },
  {
    id: "holdout-package-03",
    mode: "PACKAGE",
    query: "Elf tribal ramp token engine package components roles",
    designNote: "Generic tribal package without spent DEV Dionus queries.",
  },
  {
    id: "holdout-package-04",
    mode: "PACKAGE",
    query: "Graveyard recursion self-mill enabler package roles Commander",
    designNote: "Graveyard package roles — distinct from DEV mill/Bruvac queries.",
  },
];

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1_QUERY_COUNT =
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V1.length;
