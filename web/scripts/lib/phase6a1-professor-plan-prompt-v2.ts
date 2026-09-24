/**
 * Frozen Professor PLAN prompt + tool schema v2 — hash-stable experiment surface.
 */
export const PROFESSOR_PLAN_PROMPT_V2_VERSION = "phase6a1-professor-plan-prompt-v2";

export const PROFESSOR_PLAN_USER_PROMPT_TEMPLATE_V2 = [
  "caseId={caseId}",
  "commandZone={commandZoneJson}",
  "colorIdentity={colorIdentity}",
  "bracket={bracket}",
  "constraints={constraintsJson}",
  "FROZEN mechanismFactIds",
  "NO_ACTIONABLE factIds",
  "FROZEN mechanism facts compact",
  "FROZEN semantic opportunities",
  "Initial curated RAG evidence",
  "RAG evidenceIds catalog",
  "optional VALIDATOR FEEDBACK repair block",
].join("|");

export const PROFESSOR_PLAN_SYSTEM_PROMPT_V2 = `You are the Semantic Deckbuilding Professor PLAN agent for Phase 6A.1 experiment v2.

You produce StrategyHypothesis objects with SemanticPackages — NOT decklists and NOT card names.

HARD RULES:
- Use ONLY commanderMechanismFactIds and semanticOpportunityIds from the provided frozen lists.
- Canonical CommanderMechanismFacts and SemanticOpportunities are immutable truth; never override them.
- Facts marked NO_ACTIONABLE_OPPORTUNITY may appear as context but CANNOT by themselves become positive planning packages.
- Do NOT reference BuildPath v3, gold strategies, EDHREC, TopDeck, or meta tier lists.
- Produce 2–4 hypotheses totaling 6–12 packages across all hypotheses.
- Every hypothesis MUST have: hypothesisId, title, nonblank thesis, commanderMechanismFactIds[], semanticOpportunityIds[], evidence[] (typed, non-empty), packages[] (non-empty).
- Each package MUST have: packageId, title, purpose, causalChain (2+ steps), semanticRequirements (each with slotId + nonblank requirement), payoffs, commanderContribution, commanderIndependentFunction, commanderDependency, worksWithoutCommander, evidence[] (typed, non-empty).
- commanderDependency and worksWithoutCommander must be HIGH, MEDIUM, or LOW.
- requiredResources and producedResources may be [] only when explicitly semantically empty — prefer naming resource flows when relevant.

EVIDENCE (typed union — required on every hypothesis and package):
- { "kind": "CANONICAL_FACT", "factIds": ["..."], "statement": "..." }
- { "kind": "SEMANTIC_OPPORTUNITY", "opportunityIds": ["..."], "statement": "..." }
- { "kind": "RAG_EVIDENCE", "evidenceIds": ["chunk-id"], "statement": "..." }
- { "kind": "RULES_EVIDENCE", "ruleId": "...", "statement": "..." }
- { "kind": "MODEL_INFERENCE", "rationale": "...", "supportingFactIds": [], "supportingOpportunityIds": [] }

Respond with JSON: { "hypotheses": StrategyHypothesis[] } only when finished planning.`;

export const PROFESSOR_PLAN_OPENAI_TOOLS_V2 = [
  {
    type: "function" as const,
    function: {
      name: "searchMtgKnowledge",
      description: "Search curated MTG knowledge (rules, primers, packages). No EDHREC/TopDeck.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: {
            type: "string",
            enum: ["RULES", "TERMINOLOGY", "STRATEGY", "COMMANDER_PRIMER", "PACKAGE", "INTERACTION"],
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspectCommanderFacts",
      description: "Return frozen CommanderMechanismFacts by mechanismId",
      parameters: {
        type: "object",
        properties: { factIds: { type: "array", items: { type: "string" } } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspectSemanticOpportunities",
      description: "Return frozen SemanticOpportunities by opportunityId",
      parameters: {
        type: "object",
        properties: { opportunityIds: { type: "array", items: { type: "string" } } },
      },
    },
  },
] as const;

export const PROFESSOR_PLAN_RESPONSES_TOOLS_V2 = [
  {
    type: "function" as const,
    name: "searchMtgKnowledge",
    description: "Search curated MTG knowledge (rules, primers, packages). No EDHREC/TopDeck.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        mode: {
          type: "string",
          enum: ["RULES", "TERMINOLOGY", "STRATEGY", "COMMANDER_PRIMER", "PACKAGE", "INTERACTION"],
        },
      },
      required: ["query", "mode"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "inspectCommanderFacts",
    description: "Return frozen CommanderMechanismFacts by mechanismId",
    parameters: {
      type: "object",
      properties: { factIds: { type: "array", items: { type: "string" } } },
      required: ["factIds"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "inspectSemanticOpportunities",
    description: "Return frozen SemanticOpportunities by opportunityId",
    parameters: {
      type: "object",
      properties: { opportunityIds: { type: "array", items: { type: "string" } } },
      required: ["opportunityIds"],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;
