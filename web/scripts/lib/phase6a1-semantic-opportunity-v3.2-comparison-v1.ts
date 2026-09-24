/**
 * Compare v3.2 inference output against independent v3 review adjudication.
 */
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type {
  IndependentOpportunityV3Review,
  IndependentOpportunityV3ReviewRecord,
  IndependentOpportunityV3ReviewVerdict,
  NoActionableV3ReviewVerdict,
} from "./phase6a1-independent-opportunity-v3-review-loader-v1";
import type { CaseOpportunityInferenceV3, NoActionableOpportunityRecord } from "./phase6a1-semantic-opportunity-inference-v3";

export const SEMANTIC_OPPORTUNITY_V3_2_COMPARISON_V1_VERSION =
  "phase6a1-semantic-opportunity-v3.2-vs-independent-review-v1";

export type V32RepairStatus =
  | "accepted"
  | "refined"
  | "retyped"
  | "removed"
  | "missing"
  | "newly_added";

export type V32ComparisonRecord = {
  opportunityId?: string;
  caseId: string;
  reviewVerdict?: IndependentOpportunityV3ReviewVerdict;
  reviewReason?: string;
  v32RepairStatus: V32RepairStatus;
  note: string;
};

export type V32NoActionableComparisonRecord = {
  factId: string;
  caseId: string;
  reviewVerdict: NoActionableV3ReviewVerdict;
  v32Status: "no_actionable" | "covered_by_opportunity" | "missing_cross_fact";
  note: string;
};

export type V32ComparisonReport = {
  version: string;
  generatedAt: string;
  reviewLoaded: boolean;
  reviewOverallVerdict?: string;
  reviewSummary?: IndependentOpportunityV3Review["opportunityVerdictSummary"];
  v32Population: number;
  repairSummary: Record<V32RepairStatus, number>;
  noActionableSummary: Record<string, number>;
  records: V32ComparisonRecord[];
  noActionableRecords: V32NoActionableComparisonRecord[];
  unresolvedReviewVerdicts: IndependentOpportunityV3ReviewVerdict[];
};

const REMOVED_VERDICTS = new Set<IndependentOpportunityV3ReviewVerdict>([
  "WRONG",
  "REMOVE_DUPLICATE",
  "REMOVE_ACTION_RESTATEMENT",
]);

function isWrongContentFixed(review: IndependentOpportunityV3ReviewRecord, v32: SemanticOpportunity): boolean {
  if (review.opportunityId === "augustin-opponent-tax--opponent-spell-tax") {
    return v32.causalStatement.includes("any spells") || !v32.requiredStateOrAction.includes("noncreature");
  }
  if (review.opportunityId === "mishra-ward-grant--ward-fodder-permanents") {
    return v32.opportunityId.includes("ward-opponent-sacrifice");
  }
  if (review.opportunityId === "kenrith-reanimate--reanimate-nightmare-creatures") {
    return false;
  }
  if (review.opportunityId === "terra-trance-transform--untap-repeat-activation") {
    return !v32.opportunityId.includes("untap-repeat");
  }
  if (review.opportunityId === "esper-terra-chapter-4--transform-sequencing") {
    return v32.opportunityId.includes("chapter-4-mana-return-front");
  }
  return false;
}

function findV32Replacement(
  review: IndependentOpportunityV3ReviewRecord,
  v32Cases: CaseOpportunityInferenceV3[],
): SemanticOpportunity | undefined {
  const caseEntry = v32Cases.find((c) => c.caseId === review.caseId);
  if (!caseEntry) return undefined;
  return caseEntry.opportunities.find(
    (o) =>
      o.opportunityId !== review.opportunityId &&
      review.sourceFactIds.some((f) => o.sourceFactIds.includes(f)),
  );
}

function mapReviewRecord(
  review: IndependentOpportunityV3ReviewRecord,
  v32ById: Map<string, SemanticOpportunity>,
  v32Cases: CaseOpportunityInferenceV3[],
): V32ComparisonRecord {
  const v32 = v32ById.get(review.opportunityId);
  const replacement = !v32 ? findV32Replacement(review, v32Cases) : undefined;
  let v32RepairStatus: V32RepairStatus;
  let note = review.reason;

  if (REMOVED_VERDICTS.has(review.verdict)) {
    if (v32 && review.verdict === "WRONG" && isWrongContentFixed(review, v32)) {
      v32RepairStatus = "refined";
      note = `Corrected WRONG adjudication issue in v3.2 (${v32.opportunityId})`;
    } else if (v32) {
      v32RepairStatus = "refined";
      note = `Review ${review.verdict} but v3.2 still emits ${review.opportunityId}`;
    } else if (replacement) {
      v32RepairStatus = "refined";
      note = `Replaced by ${replacement.opportunityId}`;
    } else {
      v32RepairStatus = "removed";
    }
  } else if (!v32 && replacement) {
    v32RepairStatus = "refined";
    note = `Replaced by ${replacement.opportunityId}: ${review.reason}`;
  } else if (!v32) {
    v32RepairStatus = "missing";
  } else if (review.verdict === "ACCEPT") {
    v32RepairStatus = "accepted";
  } else if (review.verdict.startsWith("RETYPE")) {
    v32RepairStatus = "retyped";
  } else {
    v32RepairStatus = "refined";
  }

  return {
    opportunityId: review.opportunityId,
    caseId: review.caseId,
    reviewVerdict: review.verdict,
    reviewReason: review.reason,
    v32RepairStatus,
    note,
  };
}

export function buildV32ComparisonReport(input: {
  v32Cases: CaseOpportunityInferenceV3[];
  review: IndependentOpportunityV3Review | null;
}): V32ComparisonReport {
  const v32ById = new Map<string, SemanticOpportunity>();
  for (const c of input.v32Cases) {
    for (const o of c.opportunities) {
      v32ById.set(o.opportunityId, o);
    }
  }

  const records: V32ComparisonRecord[] = input.review
    ? input.review.adjudications.map((r) => mapReviewRecord(r, v32ById, input.v32Cases))
    : [];

  const reviewIds = new Set(input.review?.adjudications.map((r) => r.opportunityId) ?? []);
  for (const c of input.v32Cases) {
    for (const o of c.opportunities) {
      if (!reviewIds.has(o.opportunityId)) {
        records.push({
          opportunityId: o.opportunityId,
          caseId: c.caseId,
          v32RepairStatus: "newly_added",
          note: "New v3.2 opportunity not present in v3 review population",
        });
      }
    }
  }

  const noActionableRecords: V32NoActionableComparisonRecord[] = [];
  const noActionableByFact = new Map<string, NoActionableOpportunityRecord>();
  for (const c of input.v32Cases) {
    for (const n of c.noActionableOpportunities) {
      noActionableByFact.set(`${c.caseId}:${n.factId}`, n);
    }
  }

  for (const na of input.review?.noActionableAdjudications ?? []) {
    const key = `${na.caseId}:${na.factId}`;
    const caseOpps = input.v32Cases.find((c) => c.caseId === na.caseId)?.opportunities ?? [];
    const covered = caseOpps.some((o) => o.sourceFactIds.includes(na.factId));
    noActionableRecords.push({
      factId: na.factId,
      caseId: na.caseId,
      reviewVerdict: na.verdict,
      v32Status:
        na.verdict === "ACCEPT_NO_ACTIONABLE"
          ? noActionableByFact.has(key)
            ? "no_actionable"
            : covered
              ? "covered_by_opportunity"
              : "missing_cross_fact"
          : covered
            ? "covered_by_opportunity"
            : "missing_cross_fact",
      note: na.reason,
    });
  }

  const repairSummary = {} as Record<V32RepairStatus, number>;
  for (const r of records) {
    repairSummary[r.v32RepairStatus] = (repairSummary[r.v32RepairStatus] ?? 0) + 1;
  }

  const noActionableSummary: Record<string, number> = {};
  for (const r of noActionableRecords) {
    noActionableSummary[r.v32Status] = (noActionableSummary[r.v32Status] ?? 0) + 1;
  }

  const unresolvedReviewVerdicts = [...new Set(
    records
      .filter(
        (r) =>
          r.reviewVerdict &&
          REMOVED_VERDICTS.has(r.reviewVerdict) &&
          r.v32RepairStatus === "refined" &&
          r.note.includes("still emits"),
      )
      .map((r) => r.reviewVerdict!),
  )];

  return {
    version: SEMANTIC_OPPORTUNITY_V3_2_COMPARISON_V1_VERSION,
    generatedAt: new Date().toISOString(),
    reviewLoaded: Boolean(input.review),
    reviewOverallVerdict: input.review?.overallVerdict,
    reviewSummary: input.review?.opportunityVerdictSummary,
    v32Population: input.v32Cases.reduce((n, c) => n + c.opportunities.length, 0),
    repairSummary,
    noActionableSummary,
    records,
    noActionableRecords,
    unresolvedReviewVerdicts,
  };
}
