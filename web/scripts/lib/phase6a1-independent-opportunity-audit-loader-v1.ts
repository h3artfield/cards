/**
 * Loader for independent 88-opportunity audit (gpt56sol v1).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const INDEPENDENT_OPPORTUNITY_AUDIT_V1_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-semantic-opportunity-independent-audit-gpt56sol-v1.json",
);

export const INDEPENDENT_OPPORTUNITY_AUDIT_V1_SHA256 =
  "2768456f78e7b7bfdf7b344853b4a4d4c8ac1f88f13f6005a47d0579f0e81166";

export type IndependentOpportunityAuditDisposition =
  | "ACCEPT"
  | "ACCEPT_LOW"
  | "REFINE"
  | "REPLACE"
  | "RETYPE"
  | "WRONG"
  | "REMOVE_GENERIC"
  | "MOVE_TO_STRATEGY";

export type IndependentOpportunityAuditRecord = {
  opportunityId: string;
  caseId: string;
  disposition: IndependentOpportunityAuditDisposition;
  reason: string;
  sourceFactIds: string[];
  currentCausalStatement?: string;
  currentType?: string;
};

export type IndependentOpportunityAudit = {
  version: string;
  acceptanceVerdict?: string;
  population: { cases: number; opportunities: number };
  summary: Partial<Record<IndependentOpportunityAuditDisposition, number>>;
  records: IndependentOpportunityAuditRecord[];
};

type RawAudit = {
  version: string;
  acceptanceVerdict?: string;
  population?: { cases?: number; opportunities?: number };
  verdictSummary?: Partial<Record<IndependentOpportunityAuditDisposition, number>>;
  summary?: Partial<Record<IndependentOpportunityAuditDisposition, number>>;
  adjudications?: Array<{
    caseId: string;
    opportunityId: string;
    verdict: IndependentOpportunityAuditDisposition;
    reason: string;
    sourceFactIds?: string[];
  }>;
  records?: IndependentOpportunityAuditRecord[];
};

function normalizeAudit(raw: RawAudit): IndependentOpportunityAudit {
  const source = raw.adjudications ?? raw.records ?? [];
  const records: IndependentOpportunityAuditRecord[] = source.map((a) => ({
    opportunityId: a.opportunityId,
    caseId: a.caseId,
    disposition: ("disposition" in a ? a.disposition : a.verdict) as IndependentOpportunityAuditDisposition,
    reason: a.reason,
    sourceFactIds: a.sourceFactIds ?? [],
    currentCausalStatement: "currentCausalStatement" in a ? String(a.currentCausalStatement) : undefined,
    currentType: "currentType" in a ? String(a.currentType) : undefined,
  }));

  return {
    version: raw.version,
    acceptanceVerdict: raw.acceptanceVerdict,
    population: {
      cases: raw.population?.cases ?? 28,
      opportunities: raw.population?.opportunities ?? records.length,
    },
    summary: raw.verdictSummary ?? raw.summary ?? {},
    records,
  };
}

export function loadIndependentOpportunityAudit(
  path: string = INDEPENDENT_OPPORTUNITY_AUDIT_V1_PATH,
): IndependentOpportunityAudit {
  if (!existsSync(path)) {
    throw new Error(
      `Independent opportunity audit not found at ${path}. Expected SHA256 ${INDEPENDENT_OPPORTUNITY_AUDIT_V1_SHA256}`,
    );
  }
  const rawText = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(rawText).digest("hex").toLowerCase();
  if (sha !== INDEPENDENT_OPPORTUNITY_AUDIT_V1_SHA256) {
    throw new Error(`Independent audit SHA256 mismatch: got ${sha}, expected ${INDEPENDENT_OPPORTUNITY_AUDIT_V1_SHA256}`);
  }
  return normalizeAudit(JSON.parse(rawText) as RawAudit);
}

export function tryLoadIndependentOpportunityAudit(): IndependentOpportunityAudit | null {
  try {
    return loadIndependentOpportunityAudit();
  } catch {
    return null;
  }
}
