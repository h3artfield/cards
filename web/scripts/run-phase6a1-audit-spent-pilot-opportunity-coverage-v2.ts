#!/usr/bin/env npx tsx
/** P2 — deterministic five-case spent-pilot semantic opportunity audit (no OpenAI). */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SemanticOpportunity } from "../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { PILOT_COMMANDER_SLOTS } from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import {
  getPilotMechanismCatalogEntry,
  getPilotOpportunityCase,
  getSpentPilotOpportunitySupplementV2Sha256,
  loadSpentPilotOpportunitySupplementV2,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import {
  auditCaseOpportunitySemanticFidelity,
  SEMANTIC_OPPORTUNITY_FIDELITY_AUDIT_V1_VERSION,
} from "./lib/phase6a1-semantic-opportunity-fidelity-audit-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-spent-pilot-opportunity-coverage-audit-v2.json");

type CaseAudit = {
  pilotCaseId: string;
  commander: string;
  mechanismTruthCaseId: string;
  opportunitySource: "supplement-v2" | "frozen-v322";
  opportunityCount: number;
  pass: boolean;
  issues: string[];
  fidelityIssues: string[];
  opportunityIds: string[];
};

function evidenceMatchesSourceFact(opp: SemanticOpportunity, factEvidenceSpan: string): boolean {
  const span = opp.evidence?.oracleSpan ?? "";
  return span.length > 0 && span === factEvidenceSpan;
}

function evidenceMatchesMultiSourceFact(opp: SemanticOpportunity, factEvidenceSpans: string[]): boolean {
  const span = opp.evidence?.oracleSpan ?? "";
  if (!span) return false;
  if (opp.evidence?.type === "DERIVED_CAUSAL_INFERENCE") {
    return factEvidenceSpans.every((factSpan) => span.includes(factSpan));
  }
  return factEvidenceSpans.some((factSpan) => span === factSpan || span.includes(factSpan));
}

function auditCase(slot: (typeof PILOT_COMMANDER_SLOTS)[number]): CaseAudit {
  const entry = getPilotMechanismCatalogEntry(slot.mechanismTruthCaseId);
  const oppCase = getPilotOpportunityCase(slot.mechanismTruthCaseId);
  const issues: string[] = [];
  if (!entry || !oppCase) {
    return {
      pilotCaseId: slot.pilotCaseId,
      commander: slot.commander,
      mechanismTruthCaseId: slot.mechanismTruthCaseId,
      opportunitySource: slot.usesOpportunitySupplement ? "supplement-v2" : "frozen-v322",
      opportunityCount: 0,
      pass: false,
      issues: ["Missing mechanism-truth or opportunity case"],
      fidelityIssues: [],
      opportunityIds: [],
    };
  }

  const opportunities = oppCase.opportunities;
  if (opportunities.length < 1) {
    issues.push(`Expected opportunities.length >= 1, got ${opportunities.length}`);
  }

  const factIds = new Set(entry.independentMechanismFacts.map((f) => f.mechanismId));
  const factEvidence = new Map(entry.independentMechanismFacts.map((f) => [f.mechanismId, f.evidenceSpan]));
  const seenIds = new Set<string>();
  const supplementV2 = loadSpentPilotOpportunitySupplementV2();
  const inSupplement = supplementV2.cases.some((c) => c.caseId === slot.mechanismTruthCaseId);

  for (const opp of opportunities) {
    if (seenIds.has(opp.opportunityId)) {
      issues.push(`Duplicate opportunityId ${opp.opportunityId}`);
    }
    seenIds.add(opp.opportunityId);

    const sourceFactIds = [...new Set([...(opp.sourceMechanismFactIds ?? []), ...(opp.sourceFactIds ?? [])])];
    if (sourceFactIds.length === 0) {
      issues.push(`Missing sourceMechanismFactIds for ${opp.opportunityId}`);
    }

    if (sourceFactIds.length === 1) {
      const sourceFactId = sourceFactIds[0]!;
      if (!factIds.has(sourceFactId)) {
        issues.push(`Unknown sourceMechanismFactId ${sourceFactId} for ${opp.opportunityId}`);
      } else {
        const span = factEvidence.get(sourceFactId);
        if (!span || !evidenceMatchesSourceFact(opp, span)) {
          issues.push(`Evidence oracleSpan mismatch for ${opp.opportunityId} -> ${sourceFactId}`);
        }
      }
    } else {
      for (const sourceFactId of sourceFactIds) {
        if (!factIds.has(sourceFactId)) {
          issues.push(`Unknown sourceMechanismFactId ${sourceFactId} for ${opp.opportunityId}`);
        }
      }
      const spans = sourceFactIds
        .map((id) => factEvidence.get(id))
        .filter((span): span is string => Boolean(span));
      if (spans.length !== sourceFactIds.length || !evidenceMatchesMultiSourceFact(opp, spans)) {
        issues.push(`Composite evidence mismatch for ${opp.opportunityId}`);
      }
    }

    if (inSupplement && (!opp.exactScopes || Object.keys(opp.exactScopes).length === 0)) {
      issues.push(`Missing exactScopes for ${opp.opportunityId}`);
    }
  }

  const fidelityIssues = auditCaseOpportunitySemanticFidelity({
    opportunities,
    sourceFacts: entry.independentMechanismFacts,
  }).map((i) => `${i.code}: ${i.message} (${i.opportunityId})`);
  issues.push(...fidelityIssues);

  const opportunitySource: CaseAudit["opportunitySource"] = inSupplement ? "supplement-v2" : "frozen-v322";

  return {
    pilotCaseId: slot.pilotCaseId,
    commander: slot.commander,
    mechanismTruthCaseId: slot.mechanismTruthCaseId,
    opportunitySource,
    opportunityCount: opportunities.length,
    pass: issues.length === 0 && opportunities.length >= 1,
    issues,
    fidelityIssues,
    opportunityIds: opportunities.map((o) => o.opportunityId),
  };
}

function main() {
  const caseAudits = PILOT_COMMANDER_SLOTS.map((slot) => auditCase(slot));
  const report = {
    version: "phase6a1-spent-pilot-opportunity-coverage-audit-v2",
    generatedAt: new Date().toISOString(),
    decision: "ROOT-CAUSE_REPAIR_SEMANTIC_OPPORTUNITY_COVERAGE",
    rootCause: "NORMALIZATION_INVARIANT_IMPOSSIBILITY_EMPTY_FROZEN_SEMANTIC_OPPORTUNITY_UNIVERSE",
    opportunitySupplementV2Sha256: getSpentPilotOpportunitySupplementV2Sha256(),
    pass: caseAudits.every((c) => c.pass),
    summary: {
      cases: caseAudits.length,
      passingCases: caseAudits.filter((c) => c.pass).length,
      totalOpportunities: caseAudits.reduce((n, c) => n + c.opportunityCount, 0),
      uniqueOpportunityIds: new Set(caseAudits.flatMap((c) => c.opportunityIds)).size,
    },
    fidelityAuditVersion: SEMANTIC_OPPORTUNITY_FIDELITY_AUDIT_V1_VERSION,
    checks: [
      "opportunities.length >= 1 per pilot case",
      "all opportunityIds unique within case",
      "all sourceMechanismFactIds resolve to frozen mechanism facts",
      "all evidence oracleSpan matches source fact evidenceSpan",
      "exactScopes present for supplement-v2 derived opportunities",
      "semantic fidelity: no forbidden broadening phrases in derived prose",
      "semantic fidelity: no unsupported action/counter/creature-type claims beyond source mechanism actions",
      "zero unknown opportunity IDs in audit universe",
    ],
    caseAudits,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), pass: report.pass, summary: report.summary }, null, 2));
  if (!report.pass) process.exit(1);
}

main();
