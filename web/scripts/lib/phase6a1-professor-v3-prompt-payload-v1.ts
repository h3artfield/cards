/**
 * Deterministic Professor v3 model-visible prompt payload — all semantic layer fields exposed.
 */
import { formatMtgKnowledgeEvidence } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  buildProfessorEvidenceLedgerV3,
  type ProfessorEvidenceLedgerEntryV3,
  type ProfessorEvidenceLedgerV3,
} from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import {
  ASSERTION_ACTIONS_V3,
  ASSERTION_PREDICATES_V3,
  STRATEGIC_ASSERTION_VOCABULARY_V3_VERSION,
} from "../../src/lib/deck-synthesis/strategic-assertion-vocabulary-v3";
import { PROFESSOR_V3_LENS_DEFINITIONS } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { PROFESSOR_PLAN_PROMPT_V3_VERSION, PROFESSOR_V3_OUTPUT_CONTRACT } from "./phase6a1-professor-plan-prompt-v3";
import {
  formatProfessorV3ModelResponseEnvelopeForPromptV2,
  PROFESSOR_V3_PLAN_OUTPUT_SCHEMA_V2_VERSION,
} from "./phase6a1-professor-v3-plan-output-schema-v2";

export const PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION = "phase6a1-professor-v3-prompt-payload-v1";

export type ProfessorV3PromptPayloadSectionV1 = {
  sectionId: string;
  title: string;
  body: string;
  evidenceIds: string[];
};

export type ProfessorV3PromptPayloadV1 = {
  version: typeof PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION;
  promptContractVersion: typeof PROFESSOR_PLAN_PROMPT_V3_VERSION;
  outputSchemaVersion: typeof PROFESSOR_V3_PLAN_OUTPUT_SCHEMA_V2_VERSION;
  assertionVocabularyVersion: typeof STRATEGIC_ASSERTION_VOCABULARY_V3_VERSION;
  caseId: string;
  sections: ProfessorV3PromptPayloadSectionV1[];
  evidenceLedger: ProfessorEvidenceLedgerV3;
  outputContract: typeof PROFESSOR_V3_OUTPUT_CONTRACT;
  lensDefinitions: typeof PROFESSOR_V3_LENS_DEFINITIONS;
  /** Full model-visible text assembled from sections — this is what Professor receives. */
  modelVisibleText: string;
};

function formatMechanismFacts(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  const lines = ctx.commanderMechanismFacts.map((f) => {
    const actions = Array.isArray(f.actions) ? JSON.stringify(f.actions) : "";
    return [`[MECHANISM_FACT ${f.mechanismId}]`, f.evidenceSpan, actions ? `actions=${actions}` : ""].filter(Boolean).join("\n");
  });
  return {
    sectionId: "commander-mechanism-facts",
    title: "Commander mechanism facts (canonical)",
    body: lines.join("\n\n"),
    evidenceIds: ctx.commanderMechanismFacts.map((f) => f.mechanismId),
  };
}

function formatOracle(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  const lines = ctx.canonicalOracle.map(
    (o) => [`[ORACLE ${o.sourceOracleId}] ${o.name}`, o.oracleText].join("\n"),
  );
  return {
    sectionId: "canonical-oracle",
    title: "Canonical commander Oracle text",
    body: lines.join("\n\n"),
    evidenceIds: ctx.canonicalOracle.map((o) => o.sourceOracleId),
  };
}

function formatCommandZone(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  const cz = ctx.commandZone;
  const body = [
    `configuration=${cz.configuration}`,
    `commanders=${cz.commanders.join(", ")}`,
    `colorIdentity=${cz.combinedColorIdentity.join("")}`,
    `bracket=${cz.bracket}`,
  ].join("\n");
  return { sectionId: "command-zone", title: "Command zone identity", body, evidenceIds: [] };
}

function formatSemanticRelationships(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  if (ctx.semanticRelationships.length === 0) {
    return { sectionId: "semantic-relationships", title: "Semantic relationships", body: "(none supplied)", evidenceIds: [] };
  }
  const lines = ctx.semanticRelationships.map(
    (r) =>
      `[SEMANTIC_RELATIONSHIP ${r.relationshipId}] type=${r.relationshipType}\nproducerFacts=${r.producerFactIds.join(",")}\nconsumerFacts=${r.consumerFactIds.join(",")}\n${r.causalStatement}`,
  );
  return {
    sectionId: "semantic-relationships",
    title: "Semantic relationships (canonical cross-fact edges)",
    body: lines.join("\n\n"),
    evidenceIds: ctx.semanticRelationships.map((r) => r.relationshipId),
  };
}

function formatAffordances(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  if (ctx.knownMechanicalAffordances.length === 0) {
    return {
      sectionId: "known-mechanical-affordances",
      title: "Known mechanical affordances (optional hints)",
      body: "(none supplied — reasoning from mechanism facts + Oracle is valid)",
      evidenceIds: [],
    };
  }
  const lines = ctx.knownMechanicalAffordances.map(
    (a) => `[AFFORDANCE ${a.opportunityId}] ${a.causalStatement}\nedge=${a.semanticEdge ?? "(none)"}`,
  );
  return {
    sectionId: "known-mechanical-affordances",
    title: "Known mechanical affordances (optional hints — not a whitelist)",
    body: lines.join("\n\n"),
    evidenceIds: ctx.knownMechanicalAffordances.map((a) => a.opportunityId),
  };
}

function formatConstraints(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  const lines = [
    ...(ctx.userConstraints ?? []).map((c) => `user: ${c}`),
    ...(ctx.rulesConstraints ?? []).map((c) => `rules: ${c}`),
  ];
  return { sectionId: "constraints", title: "User and rules constraints", body: lines.join("\n"), evidenceIds: [] };
}

function formatResearch(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadSectionV1 {
  if (ctx.initialResearchEvidence.length === 0) {
    return { sectionId: "research-evidence", title: "Research evidence", body: "(none)", evidenceIds: [] };
  }
  const lines = ctx.initialResearchEvidence.map((r) => `[RESEARCH ${r.evidenceId}] ${r.sourceTitle}\n${r.summary}`);
  return {
    sectionId: "research-evidence",
    title: "Research evidence",
    body: lines.join("\n\n"),
    evidenceIds: ctx.initialResearchEvidence.map((r) => r.evidenceId),
  };
}

function formatLedgerRagAndRules(ledger: ProfessorEvidenceLedgerV3): ProfessorV3PromptPayloadSectionV1 {
  const ragAndRules = ledger.entries.filter((e) => e.kind === "RAG" || e.kind === "RULES");
  if (ragAndRules.length === 0) {
    return { sectionId: "retrieved-knowledge", title: "Retrieved RAG / rules evidence", body: "(none)", evidenceIds: [] };
  }
  const lines = ragAndRules.map(formatLedgerEntryForPrompt);
  return {
    sectionId: "retrieved-knowledge",
    title: "Retrieved RAG / rules evidence (run ledger)",
    body: lines.join("\n\n---\n\n"),
    evidenceIds: ragAndRules.map((e) => e.evidenceId),
  };
}

function formatLedgerEntryForPrompt(entry: ProfessorEvidenceLedgerEntryV3): string {
  const header = [
    `[${entry.kind} ${entry.evidenceId}]`,
    entry.tool ? `tool=${entry.tool}` : null,
    entry.query ? `query="${entry.query}"` : null,
    entry.retrievalMode ? `retrievalMode=${entry.retrievalMode}` : null,
    `source=${entry.source}`,
    entry.citationLabel ? `citation=${entry.citationLabel}` : null,
    `contentSha256=${entry.contentSha256}`,
  ]
    .filter(Boolean)
    .join(" ");
  return `${header}\n${entry.exactText}`;
}

function formatEvidenceIdIndex(ledger: ProfessorEvidenceLedgerV3): ProfessorV3PromptPayloadSectionV1 {
  const lines = ledger.entries.map((e) => {
    const mapping =
      e.kind === "ORACLE"
        ? `→ evidenceRef { kind: "ORACLE_CLAUSE", sourceOracleId: "${e.evidenceId}" }`
        : e.kind === "MECHANISM"
          ? `→ evidenceRef { kind: "MECHANISM_FACT", factIds: ["${e.evidenceId}"] }`
          : e.kind === "AFFORDANCE"
            ? `→ evidenceRef { kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: ["${e.evidenceId}"] }`
            : e.kind === "RAG"
              ? `→ evidenceRef { kind: "RAG_EVIDENCE", evidenceIds: ["${e.evidenceId}"] }`
              : e.kind === "RULES"
                ? `→ evidenceRef { kind: "RULES_EVIDENCE", ruleId: "${e.evidenceId}" }`
                : e.kind === "RESEARCH"
                  ? `→ evidenceRef { kind: "RESEARCH_EVIDENCE", evidenceIds: ["${e.evidenceId}"] }`
                  : "";
    return `${e.evidenceId} | ${e.kind} | ${e.source}${e.tool ? ` | tool=${e.tool}` : ""} ${mapping}`.trim();
  });
  return {
    sectionId: "evidence-id-index",
    title: "Stable evidence IDs (map to typed evidenceRef objects — never bare strings)",
    body: lines.join("\n"),
    evidenceIds: ledger.entries.map((e) => e.evidenceId),
  };
}

function formatOutputContract(): ProfessorV3PromptPayloadSectionV1 {
  return {
    sectionId: "output-contract",
    title: "Output contract / machine-readable schema",
    body: formatProfessorV3ModelResponseEnvelopeForPromptV2(),
    evidenceIds: [],
  };
}

/** Legacy RAG-only path — retained for backward compatibility; prefer buildProfessorV3PromptPayload. */
export function formatProfessorV3KnowledgeForPrompt(ctx: ProfessorPlanningContextV3): string {
  const ledger = buildProfessorEvidenceLedgerV3(ctx);
  const ragEntries = ledger.entries.filter((e) => e.kind === "RAG");
  if (ragEntries.length > 0) {
    return formatLedgerRagAndRules(ledger).body;
  }
  return formatMtgKnowledgeEvidence(ctx.initialRagEvidence);
}

export function buildProfessorV3PromptPayload(ctx: ProfessorPlanningContextV3): ProfessorV3PromptPayloadV1 {
  const ledger = buildProfessorEvidenceLedgerV3(ctx);
  const sections: ProfessorV3PromptPayloadSectionV1[] = [
    formatCommandZone(ctx),
    formatOracle(ctx),
    formatMechanismFacts(ctx),
    formatSemanticRelationships(ctx),
    formatAffordances(ctx),
    formatConstraints(ctx),
    formatResearch(ctx),
    formatLedgerRagAndRules(ledger),
    formatEvidenceIdIndex(ledger),
    formatOutputContract(),
  ];

  const modelVisibleText = sections.map((s) => `## ${s.title}\n\n${s.body}`).join("\n\n---\n\n");

  return {
    version: PROFESSOR_V3_PROMPT_PAYLOAD_V1_VERSION,
    promptContractVersion: PROFESSOR_PLAN_PROMPT_V3_VERSION,
    outputSchemaVersion: PROFESSOR_V3_PLAN_OUTPUT_SCHEMA_V2_VERSION,
    assertionVocabularyVersion: STRATEGIC_ASSERTION_VOCABULARY_V3_VERSION,
    caseId: ctx.caseId,
    sections,
    evidenceLedger: ledger,
    outputContract: PROFESSOR_V3_OUTPUT_CONTRACT,
    lensDefinitions: PROFESSOR_V3_LENS_DEFINITIONS,
    modelVisibleText,
  };
}
