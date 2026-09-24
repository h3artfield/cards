/**
 * Compare v1 opportunities vs v3 inference vs independent audit dispositions.
 */
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type {
  IndependentOpportunityAudit,
  IndependentOpportunityAuditDisposition,
  IndependentOpportunityAuditRecord,
} from "./phase6a1-independent-opportunity-audit-loader-v1";
import type { CaseOpportunityInferenceV3 } from "./phase6a1-semantic-opportunity-inference-v3";

export const SEMANTIC_OPPORTUNITY_V3_COMPARISON_V1_VERSION =
  "phase6a1-semantic-opportunity-v3-vs-independent-audit-v1";

export type V3MigrationDisposition =
  | "retained"
  | "corrected"
  | "replaced"
  | "removed"
  | "moved_to_strategy"
  | "newly_generated";

export type V3ComparisonRecord = {
  v1OpportunityId?: string;
  v3OpportunityId?: string;
  caseId: string;
  independentDisposition?: IndependentOpportunityAuditDisposition;
  independentReason?: string;
  v3MigrationDisposition: V3MigrationDisposition;
  note: string;
};

export type V3ComparisonReport = {
  version: string;
  generatedAt: string;
  auditLoaded: boolean;
  auditSummary?: Partial<Record<IndependentOpportunityAuditDisposition, number>>;
  v1Population: number;
  v3Population: number;
  migrationSummary: Record<V3MigrationDisposition, number>;
  /** v3 opportunities that repair fact coverage gaps (facts with no prior v1 opp or audit WRONG/REPLACE/REMOVE) */
  coverageRepairOpportunities: Array<{
    v3OpportunityId: string;
    caseId: string;
    sourceFactIds: string[];
    note: string;
  }>;
  records: V3ComparisonRecord[];
};

const GENERIC_V1_PATTERNS = [
  /support commander mechanism with relevant deck resources/i,
  /convert draw into board advantage/i,
  /redundant recursion beyond commander/i,
  /exploit created tokens$/i,
  /protect commander or key engine/i,
];

function isGenericV1(opp: SemanticOpportunity): boolean {
  return GENERIC_V1_PATTERNS.some((p) => p.test(opp.causalStatement));
}

function mapAuditToMigration(
  audit: IndependentOpportunityAuditRecord,
  v3ByCase: Map<string, SemanticOpportunity[]>,
): V3ComparisonRecord {
  const v3Case = v3ByCase.get(audit.caseId) ?? [];
  const sameFact = v3Case.filter((o) => audit.sourceFactIds.some((f) => o.sourceFactIds.includes(f)));
  const v3Match = v3Case.find((o) => o.opportunityId === audit.opportunityId);

  let v3MigrationDisposition: V3MigrationDisposition;
  let v3OpportunityId: string | undefined;
  let note = audit.reason;

  switch (audit.disposition) {
    case "ACCEPT":
    case "ACCEPT_LOW":
      v3MigrationDisposition = v3Match ? "retained" : sameFact.length ? "corrected" : "replaced";
      v3OpportunityId = v3Match?.opportunityId ?? sameFact[0]?.opportunityId;
      break;
    case "REFINE":
    case "RETYPE":
      v3MigrationDisposition = sameFact.length ? "corrected" : "replaced";
      v3OpportunityId = sameFact[0]?.opportunityId;
      break;
    case "REPLACE":
      v3MigrationDisposition = "replaced";
      v3OpportunityId = sameFact[0]?.opportunityId;
      break;
    case "WRONG":
    case "REMOVE_GENERIC":
      v3MigrationDisposition = "removed";
      break;
    case "MOVE_TO_STRATEGY":
      v3MigrationDisposition = "moved_to_strategy";
      break;
    default:
      v3MigrationDisposition = "corrected";
  }

  return {
    v1OpportunityId: audit.opportunityId,
    v3OpportunityId,
    caseId: audit.caseId,
    independentDisposition: audit.disposition,
    independentReason: audit.reason,
    v3MigrationDisposition,
    note,
  };
}

function compareWithoutAudit(
  v1Cases: Array<{ caseId: string; opportunities: SemanticOpportunity[] }>,
  v3Cases: CaseOpportunityInferenceV3[],
): V3ComparisonRecord[] {
  const records: V3ComparisonRecord[] = [];
  const v3ByCase = new Map(v3Cases.map((c) => [c.caseId, c.opportunities]));

  for (const v1Case of v1Cases) {
    const v3Opps = v3ByCase.get(v1Case.caseId) ?? [];
    const v3Ids = new Set(v3Opps.map((o) => o.opportunityId));

    for (const v1 of v1Case.opportunities) {
      if (v3Ids.has(v1.opportunityId)) {
        records.push({
          v1OpportunityId: v1.opportunityId,
          v3OpportunityId: v1.opportunityId,
          caseId: v1Case.caseId,
          v3MigrationDisposition: isGenericV1(v1) ? "removed" : "retained",
          note: isGenericV1(v1) ? "Generic v1 pattern — v3 should remove/replace" : "Same id present in v3",
        });
      } else if (isGenericV1(v1)) {
        records.push({
          v1OpportunityId: v1.opportunityId,
          caseId: v1Case.caseId,
          v3MigrationDisposition: "moved_to_strategy",
          note: "Generic strategy pattern removed from mechanical layer",
        });
      } else {
        const replacement = v3Opps.find((o) =>
          o.sourceFactIds.some((f) => v1.sourceFactIds.includes(f)),
        );
        records.push({
          v1OpportunityId: v1.opportunityId,
          v3OpportunityId: replacement?.opportunityId,
          caseId: v1Case.caseId,
          v3MigrationDisposition: replacement ? "replaced" : "removed",
          note: replacement ? "Replaced by typed v3 edge inference" : "No v3 replacement for fact",
        });
      }
    }

    for (const v3 of v3Opps) {
      const inV1 = v1Case.opportunities.some((o) => o.opportunityId === v3.opportunityId);
      if (!inV1 && v3.opportunityId.includes("--cross-")) {
        records.push({
          v3OpportunityId: v3.opportunityId,
          caseId: v1Case.caseId,
          v3MigrationDisposition: "newly_generated",
          note: "Cross-fact composition opportunity",
        });
      } else if (!inV1) {
        records.push({
          v3OpportunityId: v3.opportunityId,
          caseId: v1Case.caseId,
          v3MigrationDisposition: "newly_generated",
          note: "New typed semantic-edge opportunity",
        });
      }
    }
  }

  return records;
}

export function buildV3ComparisonReport(input: {
  v1Cases: Array<{ caseId: string; opportunities: SemanticOpportunity[] }>;
  v3Cases: CaseOpportunityInferenceV3[];
  audit: IndependentOpportunityAudit | null;
}): V3ComparisonReport {
  const v1Population = input.v1Cases.reduce((n, c) => n + c.opportunities.length, 0);
  const v3Population = input.v3Cases.reduce((n, c) => n + c.opportunities.length, 0);
  const v3ByCase = new Map(input.v3Cases.map((c) => [c.caseId, c.opportunities]));

  const records = input.audit
    ? input.audit.records.map((r) => mapAuditToMigration(r, v3ByCase))
    : compareWithoutAudit(input.v1Cases, input.v3Cases);

  // Add newly generated v3 not referenced from audit/v1
  if (input.audit) {
    const referencedV3 = new Set(records.map((r) => r.v3OpportunityId).filter(Boolean));
    for (const c of input.v3Cases) {
      for (const o of c.opportunities) {
        if (!referencedV3.has(o.opportunityId)) {
          records.push({
            v3OpportunityId: o.opportunityId,
            caseId: c.caseId,
            v3MigrationDisposition: "newly_generated",
            note: "New v3 opportunity not mapped from v1 audit record",
          });
        }
      }
    }
  }

  const migrationSummary = {} as Record<V3MigrationDisposition, number>;
  for (const r of records) {
    migrationSummary[r.v3MigrationDisposition] = (migrationSummary[r.v3MigrationDisposition] ?? 0) + 1;
  }

  const repairDispositions = new Set<IndependentOpportunityAuditDisposition>([
    "REPLACE",
    "WRONG",
    "REMOVE_GENERIC",
    "REFINE",
  ]);
  const factsNeedingRepair = new Set(
    input.audit?.records
      .filter((r) => repairDispositions.has(r.disposition))
      .flatMap((r) => r.sourceFactIds) ?? [],
  );
  const v3ById = new Map<string, SemanticOpportunity>();
  for (const c of input.v3Cases) {
    for (const o of c.opportunities) {
      v3ById.set(o.opportunityId, o);
    }
  }
  const coverageRepairOpportunities: V3ComparisonReport["coverageRepairOpportunities"] = records
    .filter((r) => r.v3MigrationDisposition === "newly_generated")
    .map((r) => {
      const o = r.v3OpportunityId ? v3ById.get(r.v3OpportunityId) : undefined;
      const cross = Boolean(r.v3OpportunityId?.includes("--cross-"));
      const repairsFact = o?.sourceFactIds.some((f) => factsNeedingRepair.has(f)) ?? false;
      return {
        v3OpportunityId: r.v3OpportunityId!,
        caseId: r.caseId,
        sourceFactIds: o?.sourceFactIds ?? [],
        note: cross
          ? "Cross-fact composition repairing multi-fact coverage"
          : repairsFact
            ? "Typed opportunity repairing audited fact gap"
            : "Additional typed v3 opportunity beyond v1 audit scope",
      };
    });

  return {
    version: SEMANTIC_OPPORTUNITY_V3_COMPARISON_V1_VERSION,
    generatedAt: new Date().toISOString(),
    auditLoaded: Boolean(input.audit),
    auditSummary: input.audit?.summary,
    v1Population,
    v3Population,
    migrationSummary,
    coverageRepairOpportunities,
    records,
  };
}
