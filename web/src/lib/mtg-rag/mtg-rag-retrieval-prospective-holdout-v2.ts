/**
 * Prospective non-gold MTG RAG retrieval holdout v2.
 * Sealed replacement for spent holdout v1. Disjoint from v1 and DEV 45.
 */
import type { MtgKnowledgeRetrievalMode } from "../deck-intelligence/mtg-knowledge-service";

export type MtgRagRetrievalHoldoutQuery = {
  id: string;
  mode: MtgKnowledgeRetrievalMode;
  query: string;
  commanderName?: string;
  designNote: string;
};

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2_VERSION =
  "mtg-rag-retrieval-prospective-holdout-v2";

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2: MtgRagRetrievalHoldoutQuery[] = [
  {
    id: "holdout-v2-rules-01",
    mode: "RULES",
    query: "119.4 copy effects copy permanent spell ability",
    designNote: "Copy effect anchor — not in spent holdout v1.",
  },
  {
    id: "holdout-v2-rules-02",
    mode: "RULES",
    query: "120.1c draw step active player draws a card",
    designNote: "Draw step rule anchor.",
  },
  {
    id: "holdout-v2-rules-03",
    mode: "RULES",
    query: "307.2 destroy exile damage marked on creature",
    designNote: "Damage/destruction marking rule.",
  },
  {
    id: "holdout-v2-rules-04",
    mode: "RULES",
    query: "403.5 graveyard order of cards may not be changed",
    designNote: "Graveyard order rule.",
  },
  {
    id: "holdout-v2-rules-05",
    mode: "RULES",
    query: "500.1 combat phase beginning declare attackers blockers damage end",
    designNote: "Combat phase structure.",
  },
  {
    id: "holdout-v2-rules-06",
    mode: "RULES",
    query: "702.7 first strike combat damage step",
    designNote: "First strike keyword rule.",
  },
  {
    id: "holdout-v2-rules-07",
    mode: "RULES",
    query: "702.19 regeneration replaces destruction",
    designNote: "Regeneration keyword rule.",
  },
  {
    id: "holdout-v2-rules-08",
    mode: "RULES",
    query: "704.5d token ceases to exist when in combat",
    designNote: "Token SB action.",
  },
  {
    id: "holdout-v2-rules-09",
    mode: "RULES",
    query: "800.4 limited range of influence multiplayer",
    designNote: "Multiplayer range option.",
  },
  {
    id: "holdout-v2-rules-10",
    mode: "RULES",
    query: "903.12 commander tax additional cost each cast from command zone",
    designNote: "Commander tax rule.",
  },
  {
    id: "holdout-v2-rules-11",
    mode: "RULES",
    query: "111.10 tokens in a zone are not cards",
    designNote: "Token zone rule.",
  },
  {
    id: "holdout-v2-rules-12",
    mode: "RULES",
    query: "121.2 counters on permanents players objects",
    designNote: "Counter definition rule.",
  },
  {
    id: "holdout-v2-strategy-01",
    mode: "STRATEGY",
    query: "turbo narset wheel mass draw strategy Commander",
    designNote: "Turbo/wheel archetype.",
  },
  {
    id: "holdout-v2-strategy-02",
    mode: "STRATEGY",
    query: "group hug politics howling mine strategy Commander",
    designNote: "Group hug archetype.",
  },
  {
    id: "holdout-v2-strategy-03",
    mode: "STRATEGY",
    query: "blink flicker ETB value strategy Commander",
    designNote: "Blink value archetype.",
  },
  {
    id: "holdout-v2-strategy-04",
    mode: "STRATEGY",
    query: "landfall ramp strategy Commander",
    designNote: "Landfall archetype.",
  },
  {
    id: "holdout-v2-strategy-05",
    mode: "STRATEGY",
    query: "superfriends planeswalker strategy Commander",
    designNote: "Superfriends archetype.",
  },
  {
    id: "holdout-v2-strategy-06",
    mode: "STRATEGY",
    query: "infect alternative win condition strategy Commander",
    designNote: "Infect archetype.",
  },
  {
    id: "holdout-v2-interaction-01",
    mode: "INTERACTION",
    query: "610.1 layer sublayers within layer dependency",
    designNote: "Layer sublayer interaction.",
  },
  {
    id: "holdout-v2-interaction-02",
    mode: "INTERACTION",
    query: "723.1 handling illegal actions rewind game state",
    designNote: "Illegal action handling.",
  },
  {
    id: "holdout-v2-interaction-03",
    mode: "INTERACTION",
    query: "704.5m poison counters ten poison counters player loses",
    designNote: "Poison SB interaction.",
  },
  {
    id: "holdout-v2-interaction-04",
    mode: "INTERACTION",
    query: "616.1 blocking creature assign combat damage order",
    designNote: "Blocking damage assignment.",
  },
  {
    id: "holdout-v2-primer-01",
    mode: "COMMANDER_PRIMER",
    query: "Korvold Fae-Cursed King sacrifice growth strategy overview",
    commanderName: "Korvold, Fae-Cursed King",
    designNote: "Commander in primer corpus.",
  },
  {
    id: "holdout-v2-primer-02",
    mode: "COMMANDER_PRIMER",
    query: "Wilhelt the Rotcleaver zombie aristocrats strategy plan",
    commanderName: "Wilhelt, the Rotcleaver",
    designNote: "Commander in primer corpus.",
  },
  {
    id: "holdout-v2-primer-03",
    mode: "COMMANDER_PRIMER",
    query: "Teysa Karlov death triggers doubled strategy engines",
    commanderName: "Teysa Karlov",
    designNote: "Commander in primer corpus.",
  },
  {
    id: "holdout-v2-primer-04",
    mode: "COMMANDER_PRIMER",
    query: "Prosper Tome-Bound exile matters treasure strategy",
    commanderName: "Prosper, Tome-Bound",
    designNote: "Commander in primer corpus.",
  },
  {
    id: "holdout-v2-package-01",
    mode: "PACKAGE",
    query: "Korvold sacrifice package enablers payoffs roles",
    commanderName: "Korvold, Fae-Cursed King",
    designNote: "Sacrifice package with commander primer.",
  },
  {
    id: "holdout-v2-package-02",
    mode: "PACKAGE",
    query: "Wilhelt zombie aristocrats package sacrifice outlet roles",
    commanderName: "Wilhelt, the Rotcleaver",
    designNote: "Zombie aristocrats package.",
  },
  {
    id: "holdout-v2-package-03",
    mode: "PACKAGE",
    query: "Treasure token engine package mana acceleration roles",
    designNote: "Treasure engine package.",
  },
  {
    id: "holdout-v2-package-04",
    mode: "PACKAGE",
    query: "Blink ETB package enablers payoff roles Commander",
    designNote: "Blink package roles.",
  },
];

export const MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2_QUERY_COUNT =
  MTG_RAG_RETRIEVAL_PROSPECTIVE_HOLDOUT_V2.length;
