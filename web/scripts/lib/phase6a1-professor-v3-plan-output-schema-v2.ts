/**
 * Strict-compatible Professor v3 structured output schema v2 — envelope root + anyOf EvidenceRef.
 */
import { FUNCTIONAL_ROLES_V3 } from "../../src/lib/deck-synthesis/professor-functional-roles-v3";
import {
  ASSERTION_ACTIONS_V3,
  ASSERTION_PREDICATES_V3,
} from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";

export const PROFESSOR_V3_PLAN_OUTPUT_SCHEMA_V2_VERSION = "phase6a1-professor-v3-plan-output-schema-v2";

export const PROFESSOR_V3_DEPENDENCY_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export const PROFESSOR_V3_RESPONSE_KINDS = ["TOOL_REQUESTS", "PLAN"] as const;

export type ProfessorV3SchemaValidationIssueV2 = { path: string; message: string };
export type ProfessorV3StrictSchemaAuditIssueV2 = { path: string; message: string };

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

function stringArray(): JsonSchemaNode {
  return { type: "array", items: { type: "string" } };
}

function nonEmptyStringArray(): JsonSchemaNode {
  return { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 };
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
      factIds: nonEmptyStringArray(),
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
      opportunityIds: nonEmptyStringArray(),
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("RAG_EVIDENCE"),
      evidenceIds: nonEmptyStringArray(),
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("RULES_EVIDENCE"),
      ruleId: { type: "string", minLength: 1 },
      statement: nullableString(),
    }),
    strictObject({
      kind: singletonEnum("RESEARCH_EVIDENCE"),
      evidenceIds: nonEmptyStringArray(),
      statement: nullableString(),
    }),
  ],
};

const evidenceRefsSchema: JsonSchemaNode = {
  type: "array",
  items: evidenceRefSchema,
  minItems: 1,
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
  functionalRoles: { type: "array", items: { type: "string", enum: [...FUNCTIONAL_ROLES_V3] }, minItems: 1 },
  inputs: stringArray(),
  resourcesRequired: stringArray(),
  outputs: stringArray(),
  resourcesProduced: stringArray(),
  commanderDependency: dependencyLevelSchema,
  worksWithoutCommander: dependencyLevelSchema,
  evidenceRefs: evidenceRefsSchema,
  dependsOnPackageIds: stringArray(),
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
  title: { type: "string", minLength: 1 },
  strategicClaim: { type: "string", minLength: 1 },
  causalReasoning: { type: "string", minLength: 1 },
  evidenceRefs: evidenceRefsSchema,
  strategicAssertions: { type: "array", items: strategicAssertionSchema, minItems: 1 },
  causalEdges: { type: "array", items: causalEdgeSchema },
  commanderDependency: dependencyLevelSchema,
  lens: { type: "string", enum: [...PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3] },
  packages: { type: "array", items: packageSchema, minItems: 1 },
  relationships: { type: "array", items: relationshipSchema },
  strengths: stringArray(),
  vulnerabilities: stringArray(),
});

const toolRequestItemSchema = strictObject({
  tool: singletonEnum("searchMtgKnowledge"),
  query: { type: "string", minLength: 1 },
  mode: {
    type: "string",
    enum: ["COMMANDER_PRIMER", "PACKAGE", "RULES", "CARD_ORACLE", "TERMINOLOGY", "STRATEGY", "INTERACTION"],
  },
  limit: nullableInteger(1, 12),
});

export const PROFESSOR_V3_PLAN_OUTPUT_JSON_SCHEMA_V2 = strictObject({
  strategyHypotheses: { type: "array", items: strategyHypothesisSchema, minItems: 1 },
});

export const PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2 = strictObject({
  responseKind: { type: "string", enum: [...PROFESSOR_V3_RESPONSE_KINDS] },
  toolRequests: { type: "array", items: toolRequestItemSchema },
  strategyHypotheses: { type: "array", items: strategyHypothesisSchema },
});

export function buildProfessorV3ResponsesApiTextFormatV2(args?: { planOnly?: boolean }) {
  const schema = args?.planOnly
    ? strictObject({
        responseKind: singletonEnum("PLAN"),
        toolRequests: { type: "array", items: toolRequestItemSchema, maxItems: 0 },
        strategyHypotheses: { type: "array", items: strategyHypothesisSchema, minItems: 1 },
      })
    : PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2;
  return {
    type: "json_schema" as const,
    name: args?.planOnly ? "professor_v3_plan_envelope_v2" : "professor_v3_model_response_envelope_v2",
    strict: true,
    schema,
  };
}

export const PROFESSOR_V3_EVIDENCE_REF_LEDGER_KIND_MAPPING_V2 = [
  { ledgerKind: "ORACLE", evidenceRefKind: "ORACLE_CLAUSE", idField: "sourceOracleId", example: '{ "kind": "ORACLE_CLAUSE", "sourceOracleId": "<oracle-id>", "oracleSpan": null }' },
  { ledgerKind: "MECHANISM", evidenceRefKind: "MECHANISM_FACT", idField: "factIds[]", example: '{ "kind": "MECHANISM_FACT", "factIds": ["<mechanism-fact-id>"], "statement": null }' },
  { ledgerKind: "AFFORDANCE", evidenceRefKind: "PRECOMPUTED_AFFORDANCE", idField: "opportunityIds[]", example: '{ "kind": "PRECOMPUTED_AFFORDANCE", "opportunityIds": ["<opportunity-id>"], "statement": null }' },
  { ledgerKind: "RAG", evidenceRefKind: "RAG_EVIDENCE", idField: "evidenceIds[]", example: '{ "kind": "RAG_EVIDENCE", "evidenceIds": ["<rag-chunk-id>"], "statement": null }' },
  { ledgerKind: "RULES", evidenceRefKind: "RULES_EVIDENCE", idField: "ruleId", example: '{ "kind": "RULES_EVIDENCE", "ruleId": "<rules-id>", "statement": null }' },
  { ledgerKind: "RESEARCH", evidenceRefKind: "RESEARCH_EVIDENCE", idField: "evidenceIds[]", example: '{ "kind": "RESEARCH_EVIDENCE", "evidenceIds": ["<research-id>"], "statement": null }' },
  { ledgerKind: "SEMANTIC_RELATIONSHIP", evidenceRefKind: "SEMANTIC_RELATIONSHIP", idField: "relationshipId", example: '{ "kind": "SEMANTIC_RELATIONSHIP", "relationshipId": "<relationship-id>", "statement": null }' },
] as const;

export function formatProfessorV3EvidenceRefContractForPromptV2(): string {
  return [
    "evidenceRefs[] MUST be objects with discriminant kind — NEVER bare string IDs.",
    "NEVER use { evidenceId, evidenceType } — use kind + typed fields below.",
    "Optional semantic fields use null when unused.",
    "",
    "EvidenceRef union:",
    ...PROFESSOR_V3_EVIDENCE_REF_LEDGER_KIND_MAPPING_V2.map((row) => `- ${row.evidenceRefKind}: ${row.example}`),
  ].join("\n");
}

export function formatProfessorV3DependencyContractForPromptV2(): string {
  return [
    "commanderDependency and worksWithoutCommander MUST be enum strings HIGH | MEDIUM | LOW — never boolean.",
    "worksWithoutCommander=HIGH means the package engine is largely independent of the commander.",
    "commanderDependency=HIGH means the package payoff chain requires commander mechanism facts.",
  ].join("\n");
}

export function formatProfessorV3ModelResponseEnvelopeForPromptV2(): string {
  return [
    "Structured output envelope (required for every model response):",
    '{ "responseKind": "TOOL_REQUESTS"|"PLAN", "toolRequests": [...], "strategyHypotheses": [...] }',
    "responseKind=TOOL_REQUESTS → toolRequests non-empty, strategyHypotheses=[]",
    "responseKind=PLAN → strategyHypotheses non-empty, toolRequests=[]",
    "",
    JSON.stringify(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2, null, 2),
    "",
    formatProfessorV3EvidenceRefContractForPromptV2(),
    "",
    formatProfessorV3DependencyContractForPromptV2(),
  ].join("\n");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isNonEmptyString(item));
}

function validateEvidenceRef(raw: unknown, path: string, issues: ProfessorV3SchemaValidationIssueV2[]): boolean {
  if (typeof raw === "string") {
    issues.push({ path, message: "evidenceRef must be object with kind — bare string IDs are rejected" });
    return false;
  }
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "evidenceRef must be object" });
    return false;
  }
  const obj = raw as Record<string, unknown>;
  if ("evidenceId" in obj || "evidenceType" in obj) {
    issues.push({ path, message: "Unsupported alias {evidenceId,evidenceType} — use kind + typed fields" });
    return false;
  }
  const kind = obj.kind;
  if (kind === "MECHANISM_FACT") return isNonEmptyStringArray(obj.factIds) || (issues.push({ path: `${path}.factIds`, message: "factIds must be non-empty string[]" }), false);
  if (kind === "ORACLE_CLAUSE") return isNonEmptyString(obj.sourceOracleId) || (issues.push({ path: `${path}.sourceOracleId`, message: "sourceOracleId required" }), false);
  if (kind === "SEMANTIC_RELATIONSHIP") return isNonEmptyString(obj.relationshipId) || (issues.push({ path: `${path}.relationshipId`, message: "relationshipId required" }), false);
  if (kind === "PRECOMPUTED_AFFORDANCE") return isNonEmptyStringArray(obj.opportunityIds) || (issues.push({ path: `${path}.opportunityIds`, message: "opportunityIds must be non-empty string[]" }), false);
  if (kind === "RAG_EVIDENCE") return isNonEmptyStringArray(obj.evidenceIds) || (issues.push({ path: `${path}.evidenceIds`, message: "evidenceIds must be non-empty string[]" }), false);
  if (kind === "RULES_EVIDENCE") return isNonEmptyString(obj.ruleId) || (issues.push({ path: `${path}.ruleId`, message: "ruleId required" }), false);
  if (kind === "RESEARCH_EVIDENCE") return isNonEmptyStringArray(obj.evidenceIds) || (issues.push({ path: `${path}.evidenceIds`, message: "evidenceIds must be non-empty string[]" }), false);
  issues.push({ path: `${path}.kind`, message: "Unsupported or malformed evidenceRef kind" });
  return false;
}

function validateDependencyLevel(raw: unknown, path: string, issues: ProfessorV3SchemaValidationIssueV2[]): boolean {
  if (typeof raw === "boolean") {
    issues.push({ path, message: "commanderDependency/worksWithoutCommander must be HIGH|MEDIUM|LOW — boolean rejected" });
    return false;
  }
  if (!PROFESSOR_V3_DEPENDENCY_LEVELS.includes(raw as (typeof PROFESSOR_V3_DEPENDENCY_LEVELS)[number])) {
    issues.push({ path, message: "commanderDependency/worksWithoutCommander must be HIGH|MEDIUM|LOW" });
    return false;
  }
  return true;
}

export function validateProfessorV3PlanOutputSchemaV2(raw: unknown): { pass: boolean; issues: ProfessorV3SchemaValidationIssueV2[] } {
  const issues: ProfessorV3SchemaValidationIssueV2[] = [];
  const plan = raw && typeof raw === "object" && "strategyHypotheses" in (raw as object) ? raw : { strategyHypotheses: (raw as { strategyHypotheses?: unknown })?.strategyHypotheses };
  const hyps = (plan as { strategyHypotheses?: unknown }).strategyHypotheses;
  if (!Array.isArray(hyps) || hyps.length === 0) {
    return { pass: false, issues: [{ path: "strategyHypotheses", message: "Non-empty strategyHypotheses array required" }] };
  }
  for (let hi = 0; hi < hyps.length; hi++) {
    const hyp = hyps[hi];
    const hypPath = `strategyHypotheses[${hi}]`;
    if (!hyp || typeof hyp !== "object") {
      issues.push({ path: hypPath, message: "hypothesis must be object" });
      continue;
    }
    const h = hyp as Record<string, unknown>;
    validateDependencyLevel(h.commanderDependency, `${hypPath}.commanderDependency`, issues);
    const refs = h.evidenceRefs;
    if (!Array.isArray(refs) || refs.length === 0) issues.push({ path: `${hypPath}.evidenceRefs`, message: "evidenceRefs must be non-empty array" });
    else for (let ri = 0; ri < refs.length; ri++) validateEvidenceRef(refs[ri], `${hypPath}.evidenceRefs[${ri}]`, issues);
    const pkgs = h.packages;
    if (!Array.isArray(pkgs) || pkgs.length === 0) issues.push({ path: `${hypPath}.packages`, message: "At least one package required" });
    else {
      for (let pi = 0; pi < pkgs.length; pi++) {
        const p = pkgs[pi] as Record<string, unknown>;
        const pkgPath = `${hypPath}.packages[${pi}]`;
        validateDependencyLevel(p.commanderDependency, `${pkgPath}.commanderDependency`, issues);
        validateDependencyLevel(p.worksWithoutCommander, `${pkgPath}.worksWithoutCommander`, issues);
        const pkgRefs = p.evidenceRefs;
        if (!Array.isArray(pkgRefs) || pkgRefs.length === 0) issues.push({ path: `${pkgPath}.evidenceRefs`, message: "evidenceRefs must be non-empty array" });
        else for (let ri = 0; ri < pkgRefs.length; ri++) validateEvidenceRef(pkgRefs[ri], `${pkgPath}.evidenceRefs[${ri}]`, issues);
      }
    }
  }
  return { pass: issues.length === 0, issues };
}

export function validateProfessorV3ModelResponseEnvelopeV2(raw: unknown): {
  pass: boolean;
  issues: ProfessorV3SchemaValidationIssueV2[];
  responseKind?: (typeof PROFESSOR_V3_RESPONSE_KINDS)[number];
} {
  const issues: ProfessorV3SchemaValidationIssueV2[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { pass: false, issues: [{ path: "$", message: "Top-level envelope object required" }] };
  }
  const envelope = raw as Record<string, unknown>;
  const responseKind = envelope.responseKind;
  if (!PROFESSOR_V3_RESPONSE_KINDS.includes(responseKind as (typeof PROFESSOR_V3_RESPONSE_KINDS)[number])) {
    issues.push({ path: "responseKind", message: "responseKind must be TOOL_REQUESTS or PLAN" });
    return { pass: false, issues };
  }
  const toolRequests = envelope.toolRequests;
  const strategyHypotheses = envelope.strategyHypotheses;
  if (!Array.isArray(toolRequests)) issues.push({ path: "toolRequests", message: "toolRequests array required" });
  if (!Array.isArray(strategyHypotheses)) issues.push({ path: "strategyHypotheses", message: "strategyHypotheses array required" });
  if (issues.length > 0) return { pass: false, issues };

  if (responseKind === "TOOL_REQUESTS") {
    if ((toolRequests as unknown[]).length === 0) issues.push({ path: "toolRequests", message: "toolRequests must be non-empty when responseKind=TOOL_REQUESTS" });
    if ((strategyHypotheses as unknown[]).length !== 0) issues.push({ path: "strategyHypotheses", message: "strategyHypotheses must be empty when responseKind=TOOL_REQUESTS" });
  } else {
    if ((strategyHypotheses as unknown[]).length === 0) issues.push({ path: "strategyHypotheses", message: "strategyHypotheses must be non-empty when responseKind=PLAN" });
    if ((toolRequests as unknown[]).length !== 0) issues.push({ path: "toolRequests", message: "toolRequests must be empty when responseKind=PLAN" });
    const planValidation = validateProfessorV3PlanOutputSchemaV2({ strategyHypotheses });
    for (const issue of planValidation.issues) issues.push(issue);
  }
  return { pass: issues.length === 0, issues, responseKind: responseKind as (typeof PROFESSOR_V3_RESPONSE_KINDS)[number] };
}

export function unwrapProfessorV3ModelResponseEnvelopeV2(raw: unknown): {
  toolRequests?: unknown[];
  parsed?: unknown;
} {
  if (!raw || typeof raw !== "object") return { parsed: raw };
  const envelope = raw as Record<string, unknown>;
  if (!("responseKind" in envelope)) {
    if (Array.isArray(envelope.toolRequests)) return { toolRequests: envelope.toolRequests as unknown[] };
    return { parsed: raw };
  }
  if (envelope.responseKind === "TOOL_REQUESTS") return { toolRequests: envelope.toolRequests as unknown[] };
  return { parsed: { strategyHypotheses: envelope.strategyHypotheses } };
}

function isConstOnlyPropertySchema(node: JsonSchemaNode): boolean {
  return "const" in node && !("type" in node);
}

function hasExplicitSupportedType(node: JsonSchemaNode): boolean {
  return "type" in node;
}

function isSupportedCompositionSchema(node: JsonSchemaNode): boolean {
  return ("anyOf" in node && Array.isArray(node.anyOf)) || ("allOf" in node && Array.isArray(node.allOf));
}

function auditDirectPropertySchema(
  node: JsonSchemaNode,
  path: string,
  issues: ProfessorV3StrictSchemaAuditIssueV2[],
  metrics: { constOnlyPropertyCount: number },
): void {
  if (isConstOnlyPropertySchema(node)) {
    metrics.constOnlyPropertyCount += 1;
    issues.push({ path, message: "direct property schema uses const without explicit type — use type+enum" });
    return;
  }
  if (isSupportedCompositionSchema(node)) {
    if ("anyOf" in node && Array.isArray(node.anyOf)) {
      for (let i = 0; i < (node.anyOf as JsonSchemaNode[]).length; i++) {
        auditStrictSchemaNode((node.anyOf as JsonSchemaNode[])[i], `${path}.anyOf[${i}]`, issues, metrics);
      }
    }
    if ("allOf" in node && Array.isArray(node.allOf)) {
      for (let i = 0; i < (node.allOf as JsonSchemaNode[]).length; i++) {
        auditStrictSchemaNode((node.allOf as JsonSchemaNode[])[i], `${path}.allOf[${i}]`, issues, metrics);
      }
    }
    return;
  }
  if (!hasExplicitSupportedType(node)) {
    issues.push({ path, message: "direct property schema must declare explicit supported type or composition schema" });
    return;
  }
  auditStrictSchemaNode(node, path, issues, metrics);
}

function auditStrictSchemaNode(
  node: JsonSchemaNode,
  path: string,
  issues: ProfessorV3StrictSchemaAuditIssueV2[],
  metrics: { constOnlyPropertyCount: number },
): void {
  if ("oneOf" in node) {
    issues.push({ path, message: "oneOf is not allowed in strict Structured Outputs schema" });
    return;
  }
  if ("anyOf" in node && Array.isArray(node.anyOf)) {
    for (let i = 0; i < (node.anyOf as JsonSchemaNode[]).length; i++) {
      auditStrictSchemaNode((node.anyOf as JsonSchemaNode[])[i], `${path}.anyOf[${i}]`, issues, metrics);
    }
    return;
  }
  if (node.type === "object" && node.properties && typeof node.properties === "object") {
    if (node.additionalProperties !== false) issues.push({ path, message: "object must set additionalProperties:false" });
    const propertyKeys = Object.keys(node.properties as Record<string, unknown>);
    const required = Array.isArray(node.required) ? (node.required as string[]) : [];
    const missingRequired = propertyKeys.filter((key) => !required.includes(key));
    const extraRequired = required.filter((key) => !propertyKeys.includes(key));
    if (missingRequired.length > 0) issues.push({ path, message: `missing required keys: ${missingRequired.join(",")}` });
    if (extraRequired.length > 0) issues.push({ path, message: `extra required keys: ${extraRequired.join(",")}` });
    for (const [key, child] of Object.entries(node.properties as Record<string, JsonSchemaNode>)) {
      auditDirectPropertySchema(child, `${path}.properties.${key}`, issues, metrics);
    }
    return;
  }
  if (node.type === "array" && node.items) {
    auditDirectPropertySchema(node.items as JsonSchemaNode, `${path}.items`, issues, metrics);
  }
}

export function countConstOnlyPropertySchemas(schema: JsonSchemaNode, path = "$"): number {
  const metrics = { constOnlyPropertyCount: 0 };
  const issues: ProfessorV3StrictSchemaAuditIssueV2[] = [];
  auditStrictSchemaNode(schema, path, issues, metrics);
  return metrics.constOnlyPropertyCount;
}

export function auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2(schema: JsonSchemaNode, path = "$"): {
  pass: boolean;
  issues: ProfessorV3StrictSchemaAuditIssueV2[];
  constOnlyPropertyCount: number;
} {
  const metrics = { constOnlyPropertyCount: 0 };
  const issues: ProfessorV3StrictSchemaAuditIssueV2[] = [];
  if (schema.type !== "object") issues.push({ path, message: "root.type must be object" });
  if ("oneOf" in schema) issues.push({ path, message: "root oneOf is not allowed" });
  auditStrictSchemaNode(schema, path, issues, metrics);
  return {
    pass: issues.length === 0 && metrics.constOnlyPropertyCount === 0,
    issues,
    constOnlyPropertyCount: metrics.constOnlyPropertyCount,
  };
}

export function getProfessorV3SchemaFragmentForPathV2(path: string): string | null {
  if (path.includes("evidenceRefs")) return formatProfessorV3EvidenceRefContractForPromptV2();
  if (path.includes("worksWithoutCommander") || path.includes("commanderDependency")) return formatProfessorV3DependencyContractForPromptV2();
  if (path.includes("responseKind") || path.includes("toolRequests")) return formatProfessorV3ModelResponseEnvelopeForPromptV2();
  if (path.includes("functionalRoles")) return `functionalRoles must be non-empty array of: ${FUNCTIONAL_ROLES_V3.join(", ")}`;
  if (path.includes("predicate")) return `predicate must be one of: ${ASSERTION_PREDICATES_V3.join(", ")}`;
  if (path.includes("lens")) return `lens must be one of: ${PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3.join(", ")}`;
  return null;
}

export function buildProfessorV3NormalizationRepairPromptV2(args: { issues: Array<{ path: string; message: string }> }): string {
  const fragments = [...new Set(args.issues.map((i) => getProfessorV3SchemaFragmentForPathV2(i.path)).filter(Boolean))];
  return [
    "Repair your prior JSON output to satisfy the strict Professor v3 structured output envelope and plan schema.",
    ...args.issues.map((i) => `- ${i.path}: ${i.message}`),
    ...fragments,
    "Re-read the output contract section in the current payload above.",
  ].join("\n");
}
