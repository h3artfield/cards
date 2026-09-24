/**
 * Bounded Professor v3 structured output schema v3 — maxItems output contract for reasoning models.
 */
import { FUNCTIONAL_ROLES_V3 } from "../../src/lib/deck-synthesis/professor-functional-roles-v3";
import {
  ASSERTION_ACTIONS_V3,
  ASSERTION_PREDICATES_V3,
} from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  PROFESSOR_V3_DEPENDENCY_LEVELS,
  PROFESSOR_V3_RESPONSE_KINDS,
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2,
  countConstOnlyPropertySchemas,
  formatProfessorV3DependencyContractForPromptV2,
  formatProfessorV3EvidenceRefContractForPromptV2,
  type ProfessorV3SchemaValidationIssueV2,
  type ProfessorV3StrictSchemaAuditIssueV2,
  unwrapProfessorV3ModelResponseEnvelopeV2,
  validateProfessorV3ModelResponseEnvelopeV2,
  validateProfessorV3PlanOutputSchemaV2,
} from "./phase6a1-professor-v3-plan-output-schema-v2";

export const PROFESSOR_V3_PLAN_OUTPUT_SCHEMA_V3_VERSION = "phase6a1-professor-v3-plan-output-schema-v3";

export const PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3 = {
  strategyHypotheses: 4,
  toolRequests: 4,
  strategicAssertionsPerHypothesis: 5,
  causalEdgesPerHypothesis: 6,
  packagesPerHypothesis: 3,
  relationshipsPerHypothesis: 4,
  evidenceRefsPerObject: 4,
  strengthsPerHypothesis: 3,
  vulnerabilitiesPerHypothesis: 3,
  functionalRolesPerPackage: 4,
  stringListMax: 4,
  dependsOnPackageIdsMax: 3,
} as const;

type JsonSchemaNode = Record<string, unknown>;

function nullableString(description?: string): JsonSchemaNode {
  return description ? { type: ["string", "null"], description } : { type: ["string", "null"] };
}

function nullableInteger(min?: number, max?: number): JsonSchemaNode {
  const schema: JsonSchemaNode = { type: ["integer", "null"] };
  if (min !== undefined) schema.minimum = min;
  if (max !== undefined) schema.maximum = max;
  return schema;
}

function boundedStringArray(maxItems: number): JsonSchemaNode {
  return { type: "array", items: { type: "string" }, maxItems };
}

function nonEmptyBoundedStringArray(maxItems: number): JsonSchemaNode {
  return { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems };
}

function strictObject(properties: Record<string, JsonSchemaNode>, description?: string): JsonSchemaNode {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function singletonEnum(value: string): JsonSchemaNode {
  return { type: "string", enum: [value] };
}

const dependencyLevelSchema: JsonSchemaNode = {
  type: "string",
  enum: [...PROFESSOR_V3_DEPENDENCY_LEVELS],
};

const evidenceRefSchema: JsonSchemaNode = {
  anyOf: [
    strictObject({
      kind: singletonEnum("MECHANISM_FACT"),
      factIds: nonEmptyBoundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.evidenceRefsPerObject),
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("ORACLE_CLAUSE"),
      sourceOracleId: { type: "string", minLength: 1 },
      oracleSpan: nullableString(),
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("SEMANTIC_RELATIONSHIP"),
      relationshipId: { type: "string", minLength: 1 },
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("PRECOMPUTED_AFFORDANCE"),
      opportunityIds: nonEmptyBoundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.evidenceRefsPerObject),
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("RAG_EVIDENCE"),
      evidenceIds: nonEmptyBoundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.evidenceRefsPerObject),
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("RULES_EVIDENCE"),
      ruleId: { type: "string", minLength: 1 },
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("RESEARCH_EVIDENCE"),
      evidenceIds: nonEmptyBoundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.evidenceRefsPerObject),
      statement: nullableString(),
    }),
  ],
};

const evidenceRefsSchema: JsonSchemaNode = {
  type: "array",
  items: evidenceRefSchema,
  minItems: 1,
  maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.evidenceRefsPerObject,
};

const nullableAssertionActionSchema: JsonSchemaNode = {
  type: ["string", "null"],
  enum: [...ASSERTION_ACTIONS_V3, null],
};

const strategicAssertionSchema = strictObject({
  assertionId: { type: "string", minLength: 1 },
  packageId: { type: "string", minLength: 1 },
  predicate: { type: "string", enum: [...ASSERTION_PREDICATES_V3] },
  action: nullableAssertionActionSchema,
  object: nullableString(),
  resourceOrState: nullableString(),
  sourceZone: nullableString(),
  destinationZone: nullableString(),
  timing: nullableString(),
  controllerScope: nullableString(),
  quantityOrScaling: nullableString(),
  provider: nullableString(),
  evidenceRefs: evidenceRefsSchema,
});

const causalEdgeSchema = strictObject({
  edgeId: { type: "string", minLength: 1 },
  producerAssertionId: { type: "string", minLength: 1 },
  consumerAssertionId: { type: "string", minLength: 1 },
  resourceOrState: { type: "string", minLength: 1 },
  evidenceRefs: evidenceRefsSchema,
});

const packageSchema = strictObject({
  packageId: { type: "string", minLength: 1 },
  purpose: { type: "string", minLength: 1 },
  functionalRoles: {
    type: "array",
    items: { type: "string", enum: [...FUNCTIONAL_ROLES_V3] },
    minItems: 1,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.functionalRolesPerPackage,
  },
  inputs: boundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.stringListMax),
  resourcesRequired: boundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.stringListMax),
  outputs: boundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.stringListMax),
  resourcesProduced: boundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.stringListMax),
  commanderDependency: dependencyLevelSchema,
  worksWithoutCommander: dependencyLevelSchema,
  evidenceRefs: evidenceRefsSchema,
  dependsOnPackageIds: {
    type: "array",
    items: { type: "string" },
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.dependsOnPackageIdsMax,
  },
});

const relationshipSchema = strictObject({
  relationshipId: { type: "string", minLength: 1 },
  producer: { type: "string", minLength: 1 },
  consumer: { type: "string", minLength: 1 },
  relationshipType: { type: "string", minLength: 1 },
  causalReasoning: { type: "string", minLength: 1 },
  evidenceRefs: evidenceRefsSchema,
});

const strategyHypothesisSchema = strictObject({
  hypothesisId: { type: "string", minLength: 1 },
  title: { type: "string", minLength: 1, maxLength: 200 },
  strategicClaim: { type: "string", minLength: 1, maxLength: 400 },
  causalReasoning: { type: "string", minLength: 1, maxLength: 400 },
  evidenceRefs: evidenceRefsSchema,
  strategicAssertions: {
    type: "array",
    items: strategicAssertionSchema,
    minItems: 1,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategicAssertionsPerHypothesis,
  },
  causalEdges: {
    type: "array",
    items: causalEdgeSchema,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.causalEdgesPerHypothesis,
  },
  commanderDependency: dependencyLevelSchema,
  lens: { type: "string", enum: [...PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3] },
  packages: {
    type: "array",
    items: packageSchema,
    minItems: 1,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.packagesPerHypothesis,
  },
  relationships: {
    type: "array",
    items: relationshipSchema,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.relationshipsPerHypothesis,
  },
  strengths: boundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strengthsPerHypothesis),
  vulnerabilities: boundedStringArray(PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.vulnerabilitiesPerHypothesis),
});

const toolRequestItemSchema = strictObject({
  tool: singletonEnum("searchMtgKnowledge"),
  query: { type: "string", minLength: 1, maxLength: 240 },
  mode: {
    type: "string",
    enum: ["COMMANDER_PRIMER", "PACKAGE", "RULES", "CARD_ORACLE", "TERMINOLOGY", "STRATEGY", "INTERACTION"],
  },
  limit: nullableInteger(1, 12),
});

export const PROFESSOR_V3_PLAN_OUTPUT_JSON_SCHEMA_V3 = strictObject({
  strategyHypotheses: {
    type: "array",
    items: strategyHypothesisSchema,
    minItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategyHypotheses,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategyHypotheses,
  },
});

export const PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3 = strictObject({
  responseKind: { type: "string", enum: [...PROFESSOR_V3_RESPONSE_KINDS] },
  toolRequests: {
    type: "array",
    items: toolRequestItemSchema,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.toolRequests,
  },
  strategyHypotheses: {
    type: "array",
    items: strategyHypothesisSchema,
    maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategyHypotheses,
  },
});

export function buildProfessorV3ResponsesApiTextFormatV3(args?: { planOnly?: boolean }) {
  const schema = args?.planOnly
    ? strictObject({
        responseKind: singletonEnum("PLAN"),
        toolRequests: { type: "array", items: toolRequestItemSchema, maxItems: 0 },
        strategyHypotheses: {
          type: "array",
          items: strategyHypothesisSchema,
          minItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategyHypotheses,
          maxItems: PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3.strategyHypotheses,
        },
      })
    : PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3;
  return {
    type: "json_schema" as const,
    name: args?.planOnly ? "professor_v3_plan_envelope_v3" : "professor_v3_model_response_envelope_v3",
    strict: true,
    schema,
  };
}

export function formatProfessorV3BoundedOutputContractForPromptV3(): string {
  const limits = PROFESSOR_V3_BOUNDED_OUTPUT_LIMITS_V3;
  return [
    "Bounded output contract — stay within these maxima so all four lenses fit in one PLAN response:",
    `- Exactly ${limits.strategyHypotheses} strategyHypotheses (one per lens: ${PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3.join(", ")})`,
    `- Per hypothesis: ≤${limits.strategicAssertionsPerHypothesis} strategicAssertions, ≤${limits.causalEdgesPerHypothesis} causalEdges, ≤${limits.packagesPerHypothesis} packages, ≤${limits.relationshipsPerHypothesis} relationships`,
    `- Per evidenceRefs array: ≤${limits.evidenceRefsPerObject} refs — prefer 1-2 strongest refs`,
    `- strengths/vulnerabilities: ≤${limits.strengthsPerHypothesis} each; keep title/strategicClaim/causalReasoning concise`,
    `- toolRequests: ≤${limits.toolRequests} when responseKind=TOOL_REQUESTS`,
    "Reasoning tokens count against max_output_tokens — prioritize completing all four lenses over exhaustive detail.",
  ].join("\n");
}

export function formatProfessorV3ModelResponseEnvelopeForPromptV3(): string {
  return [
    "Structured output envelope (required for every model response):",
    '{ "responseKind": "TOOL_REQUESTS"|"PLAN", "toolRequests": [...], "strategyHypotheses": [...] }',
    "responseKind=TOOL_REQUESTS → toolRequests non-empty, strategyHypotheses=[]",
    "responseKind=PLAN → exactly four strategyHypotheses (one per lens), toolRequests=[]",
    "",
    formatProfessorV3BoundedOutputContractForPromptV3(),
    "",
    JSON.stringify(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3, null, 2),
    "",
    formatProfessorV3EvidenceRefContractForPromptV2(),
    "",
    formatProfessorV3DependencyContractForPromptV2(),
  ].join("\n");
}

export {
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2 as auditProfessorV3StructuredOutputSchemaStrictCompatibilityV3,
  countConstOnlyPropertySchemas,
  unwrapProfessorV3ModelResponseEnvelopeV2 as unwrapProfessorV3ModelResponseEnvelopeV3,
  validateProfessorV3ModelResponseEnvelopeV2 as validateProfessorV3ModelResponseEnvelopeV3,
  validateProfessorV3PlanOutputSchemaV2 as validateProfessorV3PlanOutputSchemaV3,
  type ProfessorV3SchemaValidationIssueV2 as ProfessorV3SchemaValidationIssueV3,
  type ProfessorV3StrictSchemaAuditIssueV2 as ProfessorV3StrictSchemaAuditIssueV3,
};

export function countBoundedArrayMaxItems(schema: JsonSchemaNode): number {
  let count = 0;
  const visit = (node: JsonSchemaNode) => {
    if (node.type === "array" && typeof node.maxItems === "number") count += 1;
    if (node.properties && typeof node.properties === "object") {
      for (const child of Object.values(node.properties as Record<string, JsonSchemaNode>)) visit(child);
    }
    if (node.items) visit(node.items as JsonSchemaNode);
    if (Array.isArray(node.anyOf)) for (const child of node.anyOf as JsonSchemaNode[]) visit(child);
  };
  visit(schema);
  return count;
}
