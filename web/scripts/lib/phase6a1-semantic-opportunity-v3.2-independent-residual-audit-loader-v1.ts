/**
 * Loader for independent v3.2 residual audit (gpt56sol v1).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-semantic-opportunity-v3.2-independent-residual-audit-gpt56sol-v1.json",
);

export const SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_SHA256 =
  "8ef578a8e951bafcac0c92ec468bd023d55ef0cd3b5c9a6e33708ae3e0592f7f";

export type ResidualAuditSeverity = "BLOCKER" | "MAJOR" | "MINOR";

export type ResidualAuditIssue = {
  severity: ResidualAuditSeverity;
  kind: string;
  opportunityIds?: string[];
  finding: string;
  requiredFix: string;
};

export type ResidualAuditMissing = {
  caseId: string;
  finding: string;
  requiredFix: string;
};

export type SemanticOpportunityV32ResidualAudit = {
  version: string;
  reviewer: string;
  overallVerdict: string;
  summary: Record<string, string | boolean>;
  issues: ResidualAuditIssue[];
  missingCausalOpportunities: ResidualAuditMissing[];
  freezeCriteria: string[];
};

export function loadSemanticOpportunityV32ResidualAudit(
  path: string = SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_PATH,
): SemanticOpportunityV32ResidualAudit {
  if (!existsSync(path)) {
    throw new Error(
      `v3.2 residual audit not found at ${path}. Expected SHA256 ${SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_SHA256}`,
    );
  }
  const rawText = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(rawText).digest("hex").toLowerCase();
  if (sha !== SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_SHA256) {
    throw new Error(`v3.2 residual audit SHA256 mismatch: got ${sha}, expected ${SEMANTIC_OPPORTUNITY_V32_RESIDUAL_AUDIT_V1_SHA256}`);
  }
  return JSON.parse(rawText) as SemanticOpportunityV32ResidualAudit;
}

export function tryLoadSemanticOpportunityV32ResidualAudit(): SemanticOpportunityV32ResidualAudit | null {
  try {
    return loadSemanticOpportunityV32ResidualAudit();
  } catch {
    return null;
  }
}
