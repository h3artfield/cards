/**
 * Machine-readable Professor v3 plan output schema — single contract source for
 * structured output, prompt rendering, schema validation, and repair fragments.
 */
import { FUNCTIONAL_ROLES_V3 } from "../../src/lib/deck-synthesis/professor-functional-roles-v3";
import {
  ASSERTION_ACTIONS_V3,
  ASSERTION_PREDICATES_V3,
} from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";

export const PROFESSOR_V3_PLAN_OUTPUT_SCHEMA_V1_VERSION = "phase6a1-professor-v3-plan-output-schema-v1";

export const PROFESSOR_V3_DEPENDENCY_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export const PROFESSOR_V3_EVIDENCE_REF_KINDS = [
  "MECHANISM_FACT",
  "ORACLE_CLAUSE",
  "SEMANTIC_RELATIONSHIP",
  "PRECOMPUTED_AFFORDANCE",
  "RAG_EVIDENCE",
  "RULES_EVIDENCE",
  "RESEARCH_EVIDENCE",
] as const;

export type ProfessorV3SchemaValidationIssueV1 = { path: string; message: string };

const dependencyLevelSchema = {
  type: "string",
  enum: [...PROFESSOR_V3_DEPENDENCY_LEVELS],
  description: "Dependency classification — HIGH|MEDIUM|LOW only (never boolean).",
} as const;

const nonEmptyStringArraySchema = {
  type: "array",
  items: { type: "string", minLength: 1 },
  minItems: 1,
} as const;

const evidenceRefSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        kind: { const: "MECHANISM_FACT" },
        factIds: nonEmptyStringArraySchema,
        statement: { type: "string" },
      },
      required: ["kind", "factIds"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "ORACLE_CLAUSE" },
        sourceOracleId: { type: "string", minLength: 1 },
        oracleSpan: { type: "string" },
        statement: { type: "string" },
      },
      required: ["kind", "sourceOracleId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "SEMANTIC_RELATIONSHIP" },
        relationshipId: { type: "string", minLength: 1 },
        statement: { type: "string" },
      },
      required: ["kind", "relationshipId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "PRECOMPUTED_AFFORDANCE" },
        opportunityIds: nonEmptyStringArraySchema,
        statement: { type: "string" },
      },
      required: ["kind", "opportunityIds"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "RAG_EVIDENCE" },
        evidenceIds: nonEmptyStringArraySchema,
        statement: { type: "string" },
      },
      required: ["kind", "evidenceIds"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "RULES_EVIDENCE" },
        ruleId: { type: "string", minLength: 1 },
        statement: { type: "string" },
      },
      required: ["kind", "ruleId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { const: "RESEARCH_EVIDENCE" },
        evidenceIds: nonEmptyStringArraySchema,
        statement: { type: "string" },
      },
      required: ["kind", "evidenceIds"],
      additionalProperties: false,
    },
  ],
} as const;

const evidenceRefsSchema = {
  type: "array",
  items: evidenceRefSchema,
  minItems: 1,
} as const;

const strategicAssertionSchema = {
  type: "object",
  properties: {
    assertionId: { type: "string", minLength: 1 },
    packageId: { type: "string", minLength: 1 },
    predicate: { type: "string", enum: [...ASSERTION_PREDICATES_V3] },
    action: { type: "string", enum: [...ASSERTION_ACTIONS_V3] },
    object: { type: "string", minLength: 1 },
    resourceOrState: { type: "string", minLength: 1 },
    sourceZone: { type: "string", minLength: 1 },
    destinationZone: { type: "string", minLength: 1 },
    timing: { type: "string", minLength: 1 },
    controllerScope: { type: "string", minLength: 1 },
    quantityOrScaling: { type: "string", minLength: 1 },
    provider: { type: "string", minLength: 1 },
    evidenceRefs: evidenceRefsSchema,
  },
  required: ["assertionId", "packageId", "predicate", "evidenceRefs"],
  additionalProperties: false,
} as const;

const causalEdgeSchema = {
  type: "object",
  properties: {
    edgeId: { type: "string", minLength: 1 },
    producerAssertionId: { type: "string", minLength: 1 },
    consumerAssertionId: { type: "string", minLength: 1 },
    resourceOrState: { type: "string", minLength: 1 },
    evidenceRefs: evidenceRefsSchema,
  },
  required: ["edgeId", "producerAssertionId", "consumerAssertionId", "resourceOrState", "evidenceRefs"],
  additionalProperties: false,
} as const;

const packageSchema = {
  type: "object",
  properties: {
    packageId: { type: "string", minLength: 1 },
    purpose: { type: "string", minLength: 1 },
    functionalRoles: {
      type: "array",
      items: { type: "string", enum: [...FUNCTIONAL_ROLES_V3] },
      minItems: 1,
    },
    inputs: { type: "array", items: { type: "string" } },
    resourcesRequired: { type: "array", items: { type: "string" } },
    outputs: { type: "array", items: { type: "string" } },
    resourcesProduced: { type: "array", items: { type: "string" } },
    commanderDependency: dependencyLevelSchema,
    worksWithoutCommander: dependencyLevelSchema,
    evidenceRefs: evidenceRefsSchema,
    dependsOnPackageIds: { type: "array", items: { type: "string", minLength: 1 } },
  },
  required: [
    "packageId",
    "purpose",
    "functionalRoles",
    "commanderDependency",
    "worksWithoutCommander",
    "evidenceRefs",
  ],
  additionalProperties: false,
} as const;

const relationshipSchema = {
  type: "object",
  properties: {
    relationshipId: { type: "string", minLength: 1 },
    producer: { type: "string", minLength: 1 },
    consumer: { type: "string", minLength: 1 },
    relationshipType: { type: "string", minLength: 1 },
    causalReasoning: { type: "string", minLength: 1 },
    evidenceRefs: evidenceRefsSchema,
  },
  required: ["relationshipId", "producer", "consumer", "relationshipType", "causalReasoning", "evidenceRefs"],
  additionalProperties: false,
} as const;

const strategyHypothesisSchema = {
  type: "object",
  properties: {
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
    strengths: { type: "array", items: { type: "string" } },
    vulnerabilities: { type: "array", items: { type: "string" } },
  },
  required: [
    "hypothesisId",
    "title",
    "strategicClaim",
    "causalReasoning",
    "evidenceRefs",
    "strategicAssertions",
    "causalEdges",
    "commanderDependency",
    "lens",
    "packages",
    "relationships",
  ],
  additionalProperties: false,
} as const;

export const PROFESSOR_V3_PLAN_OUTPUT_JSON_SCHEMA_V1 = {
  type: "object",
  properties: {
    strategyHypotheses: {
      type: "array",
      items: strategyHypothesisSchema,
      minItems: 1,
    },
  },
  required: ["strategyHypotheses"],
  additionalProperties: false,
} as const;

export const PROFESSOR_V3_TOOL_REQUESTS_JSON_SCHEMA_V1 = {
  type: "object",
  properties: {
    toolRequests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: { const: "searchMtgKnowledge" },
          query: { type: "string", minLength: 1 },
          mode: {
            type: "string",
            enum: ["COMMANDER_PRIMER", "PACKAGE", "RULES", "CARD_ORACLE", "TERMINOLOGY", "STRATEGY", "INTERACTION"],
          },
          limit: { type: "integer", minimum: 1, maximum: 12 },
        },
        required: ["tool", "query", "mode"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["toolRequests"],
  additionalProperties: false,
} as const;

export const PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V1 = {
  oneOf: [PROFESSOR_V3_TOOL_REQUESTS_JSON_SCHEMA_V1, PROFESSOR_V3_PLAN_OUTPUT_JSON_SCHEMA_V1],
} as const;

export function buildProfessorV3ResponsesApiTextFormatV1(args?: { planOnly?: boolean }) {
  const schema = args?.planOnly ? PROFESSOR_V3_PLAN_OUTPUT_JSON_SCHEMA_V1 : PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V1;
  return {
    type: "json_schema" as const,
    name: args?.planOnly ? "professor_v3_plan_output_v1" : "professor_v3_model_response_v1",
    strict: true,
    schema,
  };
}

export const PROFESSOR_V3_EVIDENCE_REF_LEDGER_KIND_MAPPING_V1 = [
  { ledgerKind: "ORACLE", evidenceRefKind: "ORACLE_CLAUSE", idField: "sourceOracleId", example: '{ "kind": "ORACLE_CLAUSE", "sourceOracleId": "<oracle-id>", "oracleSpan": "optional exact span" }' },
  { ledgerKind: "MECHANISM", evidenceRefKind: "MECHANISM_FACT", idField: "factIds[]", example: '{ "kind": "MECHANISM_FACT", "factIds": ["<mechanism-fact-id>"] }' },
  { ledgerKind: "AFFORDANCE", evidenceRefKind: "PRECOMPUTED_AFFORDANCE", idField: "opportunityIds[]", example: '{ "kind": "PRECOMPUTED_AFFORDANCE", "opportunityIds": ["<opportunity-id>"] }' },
  { ledgerKind: "RAG", evidenceRefKind: "RAG_EVIDENCE", idField: "evidenceIds[]", example: '{ "kind": "RAG_EVIDENCE", "evidenceIds": ["<rag-chunk-id>"] }' },
  { ledgerKind: "RULES", evidenceRefKind: "RULES_EVIDENCE", idField: "ruleId", example: '{ "kind": "RULES_EVIDENCE", "ruleId": "<rules-id>" }' },
  { ledgerKind: "RESEARCH", evidenceRefKind: "RESEARCH_EVIDENCE", idField: "evidenceIds[]", example: '{ "kind": "RESEARCH_EVIDENCE", "evidenceIds": ["<research-id>"] }' },
  { ledgerKind: "SEMANTIC_RELATIONSHIP", evidenceRefKind: "SEMANTIC_RELATIONSHIP", idField: "relationshipId", example: '{ "kind": "SEMANTIC_RELATIONSHIP", "relationshipId": "<relationship-id>" }' },
] as const;

export function formatProfessorV3EvidenceRefContractForPromptV1(): string {
  return [
    "evidenceRefs[] MUST be objects with discriminant kind — NEVER bare string IDs.",
    "NEVER use { evidenceId, evidenceType } — use kind + typed fields below.",
    "",
    "EvidenceRef union (cite using these exact object shapes):",
    ...PROFESSOR_V3_EVIDENCE_REF_LEDGER_KIND_MAPPING_V1.map((row) => `- ${row.evidenceRefKind}: ${row.example}`),
    "",
    "Ledger index kind → EvidenceRef kind mapping:",
    ...PROFESSOR_V3_EVIDENCE_REF_LEDGER_KIND_MAPPING_V1.map((row) => `- ${row.ledgerKind} → ${row.evidenceRefKind} (${row.idField})`),
  ].join("\n");
}

export function formatProfessorV3DependencyContractForPromptV1(): string {
  return [
    "commanderDependency and worksWithoutCommander MUST be enum strings HIGH | MEDIUM | LOW — never boolean.",
    "worksWithoutCommander=HIGH means the package engine is largely independent of the commander.",
    "commanderDependency=HIGH means the package payoff chain requires commander mechanism facts.",
  ].join("\n");
}

export function formatProfessorV3PlanOutputSchemaForPromptV1(): string {
  return [
    "Machine-readable Professor v3 plan output schema (structured output contract):",
    JSON.stringify(PROFESSOR_V3_PLAN_OUTPUT_JSON_SCHEMA_V1, null, 2),
    "",
    formatProfessorV3EvidenceRefContractForPromptV1(),
    "",
    formatProfessorV3DependencyContractForPromptV1(),
    "",
    `Required lens coverage: ${PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3.join(", ")}`,
    `Assertion predicates: ${ASSERTION_PREDICATES_V3.join(", ")}`,
    `Assertion actions: ${ASSERTION_ACTIONS_V3.join(", ")}`,
    `Functional roles: ${FUNCTIONAL_ROLES_V3.join(", ")}`,
  ].join("\n");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isNonEmptyString(item));
}

function validateEvidenceRef(raw: unknown, path: string, issues: ProfessorV3SchemaValidationIssueV1[]): boolean {
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
  if (kind === "MECHANISM_FACT") {
    if (!isNonEmptyStringArray(obj.factIds)) {
      issues.push({ path: `${path}.factIds`, message: "factIds must be non-empty string[]" });
      return false;
    }
    return true;
  }
  if (kind === "ORACLE_CLAUSE") {
    if (!isNonEmptyString(obj.sourceOracleId)) {
      issues.push({ path: `${path}.sourceOracleId`, message: "sourceOracleId required" });
      return false;
    }
    return true;
  }
  if (kind === "SEMANTIC_RELATIONSHIP") {
    if (!isNonEmptyString(obj.relationshipId)) {
      issues.push({ path: `${path}.relationshipId`, message: "relationshipId required" });
      return false;
    }
    return true;
  }
  if (kind === "PRECOMPUTED_AFFORDANCE") {
    if (!isNonEmptyStringArray(obj.opportunityIds)) {
      issues.push({ path: `${path}.opportunityIds`, message: "opportunityIds must be non-empty string[]" });
      return false;
    }
    return true;
  }
  if (kind === "RAG_EVIDENCE") {
    if (!isNonEmptyStringArray(obj.evidenceIds)) {
      issues.push({ path: `${path}.evidenceIds`, message: "evidenceIds must be non-empty string[]" });
      return false;
    }
    return true;
  }
  if (kind === "RULES_EVIDENCE") {
    if (!isNonEmptyString(obj.ruleId)) {
      issues.push({ path: `${path}.ruleId`, message: "ruleId required" });
      return false;
    }
    return true;
  }
  if (kind === "RESEARCH_EVIDENCE") {
    if (!isNonEmptyStringArray(obj.evidenceIds)) {
      issues.push({ path: `${path}.evidenceIds`, message: "evidenceIds must be non-empty string[]" });
      return false;
    }
    return true;
  }
  issues.push({ path: `${path}.kind`, message: "Unsupported or malformed evidenceRef kind" });
  return false;
}

function validateDependencyLevel(raw: unknown, path: string, issues: ProfessorV3SchemaValidationIssueV1[]): boolean {
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

export function validateProfessorV3PlanOutputSchemaV1(raw: unknown): {
  pass: boolean;
  issues: ProfessorV3SchemaValidationIssueV1[];
} {
  const issues: ProfessorV3SchemaValidationIssueV1[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { pass: false, issues: [{ path: "$", message: "Top-level object required" }] };
  }
  const hyps = (raw as { strategyHypotheses?: unknown }).strategyHypotheses;
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
    if (!validateDependencyLevel(h.commanderDependency, `${hypPath}.commanderDependency`, issues)) continue;
    const refs = h.evidenceRefs;
    if (!Array.isArray(refs) || refs.length === 0) {
      issues.push({ path: `${hypPath}.evidenceRefs`, message: "evidenceRefs must be non-empty array" });
      continue;
    }
    for (let ri = 0; ri < refs.length; ri++) validateEvidenceRef(refs[ri], `${hypPath}.evidenceRefs[${ri}]`, issues);
    const pkgs = h.packages;
    if (!Array.isArray(pkgs) || pkgs.length === 0) {
      issues.push({ path: `${hypPath}.packages`, message: "At least one package required" });
      continue;
    }
    for (let pi = 0; pi < pkgs.length; pi++) {
      const pkg = pkgs[pi];
      const pkgPath = `${hypPath}.packages[${pi}]`;
      if (!pkg || typeof pkg !== "object") {
        issues.push({ path: pkgPath, message: "package must be object" });
        continue;
      }
      const p = pkg as Record<string, unknown>;
      validateDependencyLevel(p.commanderDependency, `${pkgPath}.commanderDependency`, issues);
      validateDependencyLevel(p.worksWithoutCommander, `${pkgPath}.worksWithoutCommander`, issues);
      const pkgRefs = p.evidenceRefs;
      if (!Array.isArray(pkgRefs) || pkgRefs.length === 0) {
        issues.push({ path: `${pkgPath}.evidenceRefs`, message: "evidenceRefs must be non-empty array" });
      } else {
        for (let ri = 0; ri < pkgRefs.length; ri++) validateEvidenceRef(pkgRefs[ri], `${pkgPath}.evidenceRefs[${ri}]`, issues);
      }
    }
  }
  return { pass: issues.length === 0, issues };
}

export function getProfessorV3SchemaFragmentForPathV1(path: string): string | null {
  if (path.includes("evidenceRefs")) {
    return formatProfessorV3EvidenceRefContractForPromptV1();
  }
  if (path.includes("worksWithoutCommander") || path.includes("commanderDependency")) {
    return formatProfessorV3DependencyContractForPromptV1();
  }
  if (path.includes("functionalRoles")) {
    return `functionalRoles must be non-empty array of: ${FUNCTIONAL_ROLES_V3.join(", ")}`;
  }
  if (path.includes("predicate")) {
    return `predicate must be one of: ${ASSERTION_PREDICATES_V3.join(", ")}`;
  }
  if (path.includes("lens")) {
    return `lens must be one of: ${PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3.join(", ")}`;
  }
  return null;
}

export function formatProfessorV3SchemaRepairFragmentForPathV1(path: string): string | null {
  const fragment = getProfessorV3SchemaFragmentForPathV1(path);
  return fragment ? `Expected schema fragment for ${path}:\n${fragment}` : null;
}

export function buildProfessorV3NormalizationRepairPromptV1(args: {
  issues: Array<{ path: string; message: string }>;
}): string {
  const fragments = [...new Set(args.issues.map((i) => getProfessorV3SchemaFragmentForPathV1(i.path)).filter(Boolean))];
  return [
    "Repair your prior JSON output to satisfy the machine-readable Professor v3 plan schema.",
    ...args.issues.map((i) => `- ${i.path}: ${i.message}`),
    ...fragments,
    "Re-read the output contract section in the current payload above.",
  ].join("\n");
}
