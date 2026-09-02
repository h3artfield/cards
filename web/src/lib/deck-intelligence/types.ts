/**
 * Shared Deck Intelligence Layer — service boundary types.
 * One intelligence stack consumed by Store Clerk, Professor, retriever, optimizer, and UI.
 */
export const DECK_INTELLIGENCE_LAYER_VERSION = "deck-intelligence-v1";

export type DeckIntelligenceConsumer =
  | "store_clerk"
  | "professor_planner"
  | "semantic_retrieval"
  | "deck_optimizer"
  | "deck_build_ui";

export type ProvenanceTier =
  | "CANONICAL_FACT"
  | "CURATED_KNOWLEDGE"
  | "CURRENT_EXTERNAL_RESEARCH"
  | "MODEL_INFERENCE";
