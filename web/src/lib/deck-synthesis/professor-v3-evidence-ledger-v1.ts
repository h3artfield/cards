/**
 * Immutable Professor v3 evidence ledger — append-only run state with provenance preservation.
 */
import { createHash } from "node:crypto";
import type { MtgKnowledgeEvidence } from "../deck-intelligence/mtg-knowledge-service";
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import type { PreservedResearchEvidenceV3 } from "./professor-planning-evidence-resolver-v3";

export const PROFESSOR_V3_EVIDENCE_LEDGER_V1_VERSION = "professor-v3-evidence-ledger-v1";

export type ProfessorEvidenceLedgerEntryKindV3 = "RAG" | "RULES" | "RESEARCH" | "ORACLE" | "MECHANISM" | "AFFORDANCE";

export type ProfessorEvidenceLedgerEntryV3 = {
  evidenceId: string;
  kind: ProfessorEvidenceLedgerEntryKindV3;
  tool?: string;
  query?: string;
  retrievalMode?: string;
  source: string;
  sourceVersion?: string;
  citationLabel?: string;
  exactText: string;
  contentSha256: string;
};

export type ProfessorEvidenceLedgerV3 = {
  version: typeof PROFESSOR_V3_EVIDENCE_LEDGER_V1_VERSION;
  caseId: string;
  entries: ProfessorEvidenceLedgerEntryV3[];
};

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function ledgerEntryFromRag(
  hit: MtgKnowledgeEvidence,
  args: { tool: string; query: string; retrievalMode?: string },
): ProfessorEvidenceLedgerEntryV3 {
  const kind: ProfessorEvidenceLedgerEntryKindV3 = hit.corpus === "comprehensive_rules" ? "RULES" : "RAG";
  return {
    evidenceId: hit.chunkId,
    kind,
    tool: args.tool,
    query: args.query,
    retrievalMode: args.retrievalMode ?? hit.corpus,
    source: hit.corpus,
    citationLabel: hit.citationLabel,
    exactText: hit.retrievalText,
    contentSha256: sha256Text(hit.retrievalText),
  };
}

function ledgerEntryFromResearch(r: PreservedResearchEvidenceV3): ProfessorEvidenceLedgerEntryV3 {
  return {
    evidenceId: r.evidenceId,
    kind: "RESEARCH",
    tool: "initialResearch",
    query: r.sourceTitle,
    source: r.sourceTitle,
    exactText: r.summary,
    contentSha256: sha256Text(r.summary),
  };
}

function ledgerEntryFromOracle(o: ProfessorPlanningContextV3["canonicalOracle"][number]): ProfessorEvidenceLedgerEntryV3 {
  return {
    evidenceId: o.sourceOracleId,
    kind: "ORACLE",
    tool: "canonicalOracle",
    source: o.name,
    exactText: o.oracleText,
    contentSha256: sha256Text(o.oracleText),
  };
}

function ledgerEntryFromMechanismFact(f: ProfessorPlanningContextV3["commanderMechanismFacts"][number]): ProfessorEvidenceLedgerEntryV3 {
  const text = [f.evidenceSpan, JSON.stringify(f.actions ?? [])].filter(Boolean).join("\n");
  return {
    evidenceId: f.mechanismId,
    kind: "MECHANISM",
    tool: "commanderMechanismFacts",
    source: "commander_mechanism_fact",
    exactText: text,
    contentSha256: sha256Text(text),
  };
}

function ledgerEntryFromAffordance(a: ProfessorPlanningContextV3["knownMechanicalAffordances"][number]): ProfessorEvidenceLedgerEntryV3 {
  const text = [a.causalStatement, a.semanticEdge ?? ""].filter(Boolean).join("\n");
  return {
    evidenceId: a.opportunityId,
    kind: "AFFORDANCE",
    tool: "knownMechanicalAffordances",
    source: "semantic_opportunity",
    exactText: text,
    contentSha256: sha256Text(text),
  };
}

function entryProvenanceScore(entry: ProfessorEvidenceLedgerEntryV3): number {
  let score = 0;
  if (entry.tool) score += 1;
  if (entry.query) score += 2;
  if (entry.retrievalMode) score += 1;
  return score;
}

/** Append-only merge — never discard richer provenance for the same evidenceId. */
export function mergeLedgerEntryAppendOnly(
  entries: ProfessorEvidenceLedgerEntryV3[],
  incoming: ProfessorEvidenceLedgerEntryV3,
): ProfessorEvidenceLedgerEntryV3[] {
  const idx = entries.findIndex((e) => e.evidenceId === incoming.evidenceId);
  if (idx < 0) return [...entries, incoming];
  const existing = entries[idx];
  if (entryProvenanceScore(incoming) > entryProvenanceScore(existing)) {
    const next = [...entries];
    next[idx] = incoming;
    return next;
  }
  return entries;
}

export function createCanonicalLedgerEntries(ctx: ProfessorPlanningContextV3): ProfessorEvidenceLedgerEntryV3[] {
  let entries: ProfessorEvidenceLedgerEntryV3[] = [];
  for (const o of ctx.canonicalOracle) entries = mergeLedgerEntryAppendOnly(entries, ledgerEntryFromOracle(o));
  for (const f of ctx.commanderMechanismFacts) entries = mergeLedgerEntryAppendOnly(entries, ledgerEntryFromMechanismFact(f));
  for (const a of ctx.knownMechanicalAffordances) entries = mergeLedgerEntryAppendOnly(entries, ledgerEntryFromAffordance(a));
  for (const r of ctx.initialResearchEvidence) entries = mergeLedgerEntryAppendOnly(entries, ledgerEntryFromResearch(r));
  for (const extra of ctx.evidenceLedgerSupplement ?? []) entries = mergeLedgerEntryAppendOnly(entries, extra);
  return entries;
}

export function appendLedgerEntriesFromRagHits(args: {
  ledger: ProfessorEvidenceLedgerV3;
  hits: MtgKnowledgeEvidence[];
  tool: string;
  query: string;
  retrievalMode?: string;
}): ProfessorEvidenceLedgerV3 {
  let entries = args.ledger.entries;
  for (const hit of args.hits) {
    entries = mergeLedgerEntryAppendOnly(
      entries,
      ledgerEntryFromRag(hit, { tool: args.tool, query: args.query, retrievalMode: args.retrievalMode }),
    );
  }
  return { ...args.ledger, entries };
}

/** Backfill initialRagEvidence into ledger with bootstrap provenance when not already present. */
export function syncInitialRagEvidenceToLedger(ctx: ProfessorPlanningContextV3): ProfessorEvidenceLedgerEntryV3[] {
  let entries = createCanonicalLedgerEntries(ctx);
  for (const hit of ctx.initialRagEvidence) {
    entries = mergeLedgerEntryAppendOnly(
      entries,
      ledgerEntryFromRag(hit, {
        tool: "initialRetrieval",
        query: "(context bootstrap — see context builder retrieval queries)",
        retrievalMode: hit.corpus,
      }),
    );
  }
  return entries;
}

export function buildProfessorEvidenceLedgerV3(ctx: ProfessorPlanningContextV3): ProfessorEvidenceLedgerV3 {
  return {
    version: PROFESSOR_V3_EVIDENCE_LEDGER_V1_VERSION,
    caseId: ctx.caseId,
    entries: syncInitialRagEvidenceToLedger(ctx),
  };
}

export function ledgerEntryById(ledger: ProfessorEvidenceLedgerV3, evidenceId: string): ProfessorEvidenceLedgerEntryV3 | null {
  return ledger.entries.find((e) => e.evidenceId === evidenceId) ?? null;
}

export function ledgerRulesEntryByRuleId(ledger: ProfessorEvidenceLedgerV3, ruleId: string): ProfessorEvidenceLedgerEntryV3 | null {
  return (
    ledger.entries.find(
      (e) =>
        e.kind === "RULES" &&
        (e.evidenceId === ruleId || e.citationLabel?.replace(/\s+/g, "").toLowerCase() === ruleId.replace(/\s+/g, "").toLowerCase()),
    ) ?? null
  );
}

export function ledgerEntriesWithProvenance(ledger: ProfessorEvidenceLedgerV3): ProfessorEvidenceLedgerEntryV3[] {
  return ledger.entries.filter((e) => Boolean(e.tool && e.query));
}

export function assertLedgerProvenancePreserved(args: {
  ledger: ProfessorEvidenceLedgerV3;
  evidenceId: string;
  expectedTool: string;
  expectedQuery: string;
}): boolean {
  const entry = ledgerEntryById(args.ledger, args.evidenceId);
  if (!entry) return false;
  return entry.tool === args.expectedTool && entry.query === args.expectedQuery;
}
