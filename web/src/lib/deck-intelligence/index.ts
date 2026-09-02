/**
 * Shared Deck Intelligence Layer — single stack for Clerk, Professor, retriever, optimizer, UI.
 */
export * from "./types";
export * from "./canonical-knowledge-service";
export * from "./semantic-fact-service";
export * from "./semantic-opportunity-service";
export * from "./mtg-knowledge-service";
export * from "./research-service";
export * from "./semantic-retrieval-service";

export const DECK_INTELLIGENCE_SERVICES = [
  "CanonicalKnowledgeService",
  "SemanticFactService",
  "SemanticOpportunityService",
  "MtgKnowledgeService",
  "ResearchService",
  "SemanticRetrievalService",
] as const;

export const DECK_INTELLIGENCE_PIPELINE = [
  "Canonical Card / Rules Knowledge",
  "Semantic Fact + Opportunity Services",
  "MTG Knowledge Service + Research Service (optional)",
  "Professor Strategy Planner (bounded tool loop)",
  "Deterministic Validator + repair loop",
  "Three-Lens Package Portfolio Selector",
  "Package / Intent Layer",
  "Semantic Retrieval Service",
  "Deck Optimizer",
  "2D Deck Builder",
] as const;
