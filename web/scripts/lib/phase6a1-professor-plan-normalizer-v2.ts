/**
 * Fail-closed Professor planning contract normalizer v2.
 * Never silently default required fields to empty values.
 */
import type { PlanningEvidence } from "../../src/lib/deck-synthesis/professor-planning-evidence-v1";
import type {
  DependencyLevel,
  SemanticPackage,
  SemanticRequirementSlot,
  StrategyHypothesis,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ProfessorPlanningContext } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const PROFESSOR_PLAN_NORMALIZER_V2_VERSION = "phase6a1-professor-plan-normalizer-v2";

export type NormalizationIssue = {
  path: string;
  message: string;
};

export type NormalizationResult =
  | {
      status: "SUCCESS";
      normalized: StrategyHypothesis[];
      issues: [];
    }
  | {
      status: "NORMALIZATION_FAILURE";
      normalized: null;
      issues: NormalizationIssue[];
    };

export type NormalizationAuditRecord = {
  parserVersion: string;
  normalizerVersion: typeof PROFESSOR_PLAN_NORMALIZER_V2_VERSION;
  rawModelResponse: string;
  parsedModelResponse: unknown;
  normalizedPlanningContract: StrategyHypothesis[] | null;
  issues: NormalizationIssue[];
  status: NormalizationResult["status"];
};

function nonEmptyString(value: unknown, path: string, issues: NormalizationIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: "Required nonblank string missing" });
    return null;
  }
  return value.trim();
}

function nonEmptyStringArray(value: unknown, path: string, issues: NormalizationIssue[]): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "Required non-empty string array missing" });
    return null;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}[${i}]`, message: "Array element must be nonblank string" });
      return null;
    }
    out.push(item.trim());
  }
  return out;
}

function dependencyLevel(value: unknown, path: string, issues: NormalizationIssue[]): DependencyLevel | null {
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  issues.push({ path, message: "commanderDependency/worksWithoutCommander must be HIGH|MEDIUM|LOW" });
  return null;
}

function normalizeEvidence(raw: unknown, path: string, issues: NormalizationIssue[]): PlanningEvidence[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push({ path, message: "evidence must be a non-empty array of typed evidence objects" });
    return null;
  }
  const out: PlanningEvidence[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const p = `${path}[${i}]`;
    if (!item || typeof item !== "object") {
      issues.push({ path: p, message: "evidence entry must be object" });
      return null;
    }
    const kind = (item as { kind?: string }).kind;
    if (kind === "CANONICAL_FACT") {
      const factIds = nonEmptyStringArray((item as { factIds?: unknown }).factIds, `${p}.factIds`, issues);
      if (!factIds) return null;
      out.push({ kind: "CANONICAL_FACT", factIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "SEMANTIC_OPPORTUNITY") {
      const opportunityIds = nonEmptyStringArray(
        (item as { opportunityIds?: unknown }).opportunityIds,
        `${p}.opportunityIds`,
        issues,
      );
      if (!opportunityIds) return null;
      out.push({ kind: "SEMANTIC_OPPORTUNITY", opportunityIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "RAG_EVIDENCE") {
      const evidenceIds = nonEmptyStringArray((item as { evidenceIds?: unknown }).evidenceIds, `${p}.evidenceIds`, issues);
      if (!evidenceIds) return null;
      out.push({ kind: "RAG_EVIDENCE", evidenceIds, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "RULES_EVIDENCE") {
      const ruleId = nonEmptyString((item as { ruleId?: unknown }).ruleId, `${p}.ruleId`, issues);
      if (!ruleId) return null;
      out.push({ kind: "RULES_EVIDENCE", ruleId, statement: (item as { statement?: string }).statement?.trim() });
      continue;
    }
    if (kind === "MODEL_INFERENCE") {
      const rationale = nonEmptyString((item as { rationale?: unknown }).rationale, `${p}.rationale`, issues);
      if (!rationale) return null;
      out.push({
        kind: "MODEL_INFERENCE",
        rationale,
        supportingFactIds: Array.isArray((item as { supportingFactIds?: unknown }).supportingFactIds)
          ? ((item as { supportingFactIds: string[] }).supportingFactIds.filter((x) => typeof x === "string" && x.trim()))
          : undefined,
        supportingOpportunityIds: Array.isArray((item as { supportingOpportunityIds?: unknown }).supportingOpportunityIds)
          ? ((item as { supportingOpportunityIds: string[] }).supportingOpportunityIds.filter(
              (x) => typeof x === "string" && x.trim(),
            ))
          : undefined,
      });
      continue;
    }
    issues.push({ path: p, message: "evidence.kind must be CANONICAL_FACT|SEMANTIC_OPPORTUNITY|RAG_EVIDENCE|RULES_EVIDENCE|MODEL_INFERENCE" });
    return null;
  }
  return out;
}

function normalizeRequirementSlots(
  raw: unknown,
  path: string,
  issues: NormalizationIssue[],
): SemanticRequirementSlot[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push({ path, message: "semanticRequirements must be non-empty" });
    return null;
  }
  const out: SemanticRequirementSlot[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const p = `${path}[${i}]`;
    if (!item || typeof item !== "object") {
      issues.push({ path: p, message: "semantic requirement must be object" });
      return null;
    }
    const slotId = nonEmptyString((item as { slotId?: unknown }).slotId, `${p}.slotId`, issues);
    const requirement = nonEmptyString((item as { requirement?: unknown }).requirement, `${p}.requirement`, issues);
    if (!slotId || !requirement) return null;
    out.push({
      slotId,
      requirement,
      alternatives: Array.isArray((item as { alternatives?: unknown }).alternatives)
        ? (item as { alternatives: string[] }).alternatives.filter((x) => typeof x === "string" && x.trim())
        : undefined,
      satisfiesOpportunityIds: Array.isArray((item as { satisfiesOpportunityIds?: unknown }).satisfiesOpportunityIds)
        ? (item as { satisfiesOpportunityIds: string[] }).satisfiesOpportunityIds.filter((x) => typeof x === "string" && x.trim())
        : undefined,
    });
  }
  return out;
}

function normalizePackage(raw: unknown, index: number, caseId: string, issues: NormalizationIssue[]): SemanticPackage | null {
  const path = `packages[${index}]`;
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "package must be object" });
    return null;
  }
  const o = raw as Record<string, unknown>;
  const packageId = nonEmptyString(o.packageId, `${path}.packageId`, issues) ?? `${caseId}-pkg-${index + 1}`;
  const title = nonEmptyString(o.title, `${path}.title`, issues);
  const purpose = nonEmptyString(o.purpose, `${path}.purpose`, issues);
  const causalChain = nonEmptyStringArray(o.causalChain, `${path}.causalChain`, issues);
  const semanticRequirements = normalizeRequirementSlots(o.semanticRequirements, `${path}.semanticRequirements`, issues);
  const requiredResources = Array.isArray(o.requiredResources)
    ? (o.requiredResources as unknown[]).map(String).filter((x) => x.trim())
    : [];
  const producedResources = Array.isArray(o.producedResources)
    ? (o.producedResources as unknown[]).map(String).filter((x) => x.trim())
    : [];
  const payoffs = nonEmptyStringArray(o.payoffs, `${path}.payoffs`, issues);
  const commanderContribution = nonEmptyString(o.commanderContribution, `${path}.commanderContribution`, issues);
  const commanderIndependentFunction = nonEmptyString(
    o.commanderIndependentFunction,
    `${path}.commanderIndependentFunction`,
    issues,
  );
  const commanderDependency = dependencyLevel(o.commanderDependency, `${path}.commanderDependency`, issues);
  const worksWithoutCommander = dependencyLevel(o.worksWithoutCommander, `${path}.worksWithoutCommander`, issues);
  const dependsOnPackageIds = Array.isArray(o.dependsOnPackageIds)
    ? (o.dependsOnPackageIds as unknown[]).map(String).filter((x) => x.trim())
    : [];
  const overlapsWithPackageIds = Array.isArray(o.overlapsWithPackageIds)
    ? (o.overlapsWithPackageIds as unknown[]).map(String).filter((x) => x.trim())
    : [];
  const vulnerabilities = Array.isArray(o.vulnerabilities)
    ? (o.vulnerabilities as unknown[]).map(String).filter((x) => x.trim())
    : [];
  const evidence = normalizeEvidence(o.evidence, `${path}.evidence`, issues);

  if (
    !title ||
    !purpose ||
    !causalChain ||
    !semanticRequirements ||
    !payoffs ||
    !commanderContribution ||
    !commanderIndependentFunction ||
    !commanderDependency ||
    !worksWithoutCommander ||
    !evidence
  ) {
    return null;
  }

  return {
    packageId,
    title,
    purpose,
    causalChain,
    semanticRequirements,
    requiredResources,
    producedResources,
    payoffs,
    commanderContribution,
    commanderIndependentFunction,
    commanderDependency,
    worksWithoutCommander,
    dependsOnPackageIds,
    overlapsWithPackageIds,
    vulnerabilities,
    evidence,
  };
}

function normalizeHypothesis(
  raw: unknown,
  index: number,
  caseId: string,
  ctx: ProfessorPlanningContext,
  issues: NormalizationIssue[],
): StrategyHypothesis | null {
  const path = `hypotheses[${index}]`;
  if (!raw || typeof raw !== "object") {
    issues.push({ path, message: "hypothesis must be object" });
    return null;
  }
  const o = raw as Record<string, unknown>;
  const hypothesisId =
    nonEmptyString(o.hypothesisId, `${path}.hypothesisId`, issues) ?? `${caseId}-hyp-${index + 1}`;
  const title = nonEmptyString(o.title, `${path}.title`, issues);
  const thesis = nonEmptyString(o.thesis, `${path}.thesis`, issues);
  const commanderMechanismFactIds = nonEmptyStringArray(
    o.commanderMechanismFactIds,
    `${path}.commanderMechanismFactIds`,
    issues,
  );
  const semanticOpportunityIds = nonEmptyStringArray(
    o.semanticOpportunityIds,
    `${path}.semanticOpportunityIds`,
    issues,
  );
  if (!Array.isArray(o.packages) || o.packages.length === 0) {
    issues.push({ path: `${path}.packages`, message: "hypothesis must contain at least one package" });
    return null;
  }

  const packages: SemanticPackage[] = [];
  for (let i = 0; i < o.packages.length; i++) {
    const pkg = normalizePackage(o.packages[i], i, caseId, issues);
    if (!pkg) return null;
    packages.push(pkg);
  }

  const evidence = normalizeEvidence(o.evidence, `${path}.evidence`, issues);
  if (!title || !thesis || !commanderMechanismFactIds || !semanticOpportunityIds || !evidence) return null;

  const knownFacts = new Set(ctx.commanderMechanismFacts.map((f) => f.mechanismId));
  for (const fid of commanderMechanismFactIds) {
    if (!knownFacts.has(fid)) {
      issues.push({ path: `${path}.commanderMechanismFactIds`, message: `Unknown factId ${fid}` });
    }
  }
  const knownOpps = new Set(ctx.semanticOpportunities.map((op) => op.opportunityId));
  for (const oid of semanticOpportunityIds) {
    if (!knownOpps.has(oid)) {
      issues.push({ path: `${path}.semanticOpportunityIds`, message: `Unknown opportunityId ${oid}` });
    }
  }

  return {
    hypothesisId,
    title,
    thesis,
    commanderMechanismFactIds,
    semanticOpportunityIds,
    packages,
    strengths: Array.isArray(o.strengths) ? (o.strengths as unknown[]).map(String).filter((x) => x.trim()) : [],
    vulnerabilities: Array.isArray(o.vulnerabilities)
      ? (o.vulnerabilities as unknown[]).map(String).filter((x) => x.trim())
      : [],
    evidence,
  };
}

export function normalizeProfessorPlanningResponse(args: {
  rawModelResponse: string;
  parsedModelResponse: unknown;
  ctx: ProfessorPlanningContext;
}): NormalizationAuditRecord {
  const issues: NormalizationIssue[] = [];
  const parsed = args.parsedModelResponse;
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { hypotheses?: unknown }).hypotheses)) {
    issues.push({ path: "hypotheses", message: "Top-level hypotheses array required" });
    return {
      parserVersion: "json-parse-v1",
      normalizerVersion: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
      rawModelResponse: args.rawModelResponse,
      parsedModelResponse: args.parsedModelResponse,
      normalizedPlanningContract: null,
      issues,
      status: "NORMALIZATION_FAILURE",
    };
  }

  const rawHyps = (parsed as { hypotheses: unknown[] }).hypotheses;
  if (rawHyps.length === 0) {
    issues.push({ path: "hypotheses", message: "At least one hypothesis required" });
  }

  const normalized: StrategyHypothesis[] = [];
  for (let i = 0; i < rawHyps.length; i++) {
    const h = normalizeHypothesis(rawHyps[i], i, args.ctx.caseId, args.ctx, issues);
    if (!h) continue;
    normalized.push(h);
  }

  if (issues.length > 0 || normalized.length === 0) {
    return {
      parserVersion: "json-parse-v1",
      normalizerVersion: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
      rawModelResponse: args.rawModelResponse,
      parsedModelResponse: args.parsedModelResponse,
      normalizedPlanningContract: null,
      issues,
      status: "NORMALIZATION_FAILURE",
    };
  }

  return {
    parserVersion: "json-parse-v1",
    normalizerVersion: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
    rawModelResponse: args.rawModelResponse,
    parsedModelResponse: args.parsedModelResponse,
    normalizedPlanningContract: normalized,
    issues: [],
    status: "SUCCESS",
  };
}
