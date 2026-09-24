/**
 * Loader for independent v3.2.1 pre-freeze audit (gpt56sol v1).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const SEMANTIC_OPPORTUNITY_V321_PRE_FREEZE_AUDIT_V1_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-semantic-opportunity-v3.2.1-independent-pre-freeze-audit-gpt56sol-v1.json",
);

export const SEMANTIC_OPPORTUNITY_V321_PRE_FREEZE_AUDIT_V1_SHA256 =
  "8f8d902d41007d48f7206fc4e795a0ec08ba89da47325fd771e583b72b209dd0";

export type PreFreezeAuditSeverity = "BLOCKER" | "MAJOR" | "MINOR";

export type PreFreezeBlocker = {
  kind: string;
  severity: PreFreezeAuditSeverity;
  opportunityIds?: string[];
  edgeIds?: string[];
  finding: string;
  requiredFix: string;
};

export type PreFreezeTargetedResidual = {
  kind: string;
  severity: PreFreezeAuditSeverity;
  opportunityId?: string;
  finding: string;
  requiredFix: string;
};

export type SemanticOpportunityV321PreFreezeAudit = {
  version: string;
  overallVerdict: string;
  freezeBlockers: PreFreezeBlocker[];
  targetedResiduals: PreFreezeTargetedResidual[];
  verifiedPasses: string[];
  acceptanceForNextFreeze: string[];
};

export function loadSemanticOpportunityV321PreFreezeAudit(
  path: string = SEMANTIC_OPPORTUNITY_V321_PRE_FREEZE_AUDIT_V1_PATH,
): SemanticOpportunityV321PreFreezeAudit {
  if (!existsSync(path)) {
    throw new Error(
      `v3.2.1 pre-freeze audit not found at ${path}. Expected SHA256 ${SEMANTIC_OPPORTUNITY_V321_PRE_FREEZE_AUDIT_V1_SHA256}`,
    );
  }
  const rawText = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(rawText).digest("hex").toLowerCase();
  if (sha !== SEMANTIC_OPPORTUNITY_V321_PRE_FREEZE_AUDIT_V1_SHA256) {
    throw new Error(
      `v3.2.1 pre-freeze audit SHA256 mismatch: got ${sha}, expected ${SEMANTIC_OPPORTUNITY_V321_PRE_FREEZE_AUDIT_V1_SHA256}`,
    );
  }
  return JSON.parse(rawText) as SemanticOpportunityV321PreFreezeAudit;
}
