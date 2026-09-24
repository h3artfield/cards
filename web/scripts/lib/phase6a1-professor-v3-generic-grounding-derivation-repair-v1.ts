/**
 * Generic grounding derivation repair helpers — frozen Yuriko acceptance + cross-commander inference.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { EvidenceRef } from "../../src/lib/deck-synthesis/professor-planning-evidence-v3";
import type { ProfessorEvidenceLedgerEntryV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1 } from "./phase6a1-professor-v3-smoke-output-targets-v6";

export const PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_REPAIR_V1_VERSION =
  "phase6a1-professor-v3-generic-grounding-derivation-repair-v1";

export const PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_REPAIR_DECISION_V1 =
  "PROFESSOR_V3_GENERIC_GROUNDING_DERIVATION_GRAPH_REPAIR_V1_AUTHORIZED_NO_MODEL";

/** Assertion IDs present in frozen attempt-003 parsed output (excluding anti-cheat must-fail). */
export const YURIKO_ATTEMPT_003_FROZEN_ASSERTION_IDS_V1 = [
  "auto-a1",
  "auto-a2",
  "auto-a3",
  "dep-a1",
  "dep-a2",
  "dep-a3",
  "ind-a1",
  "ind-a2",
  "harm-a1",
  "harm-a2",
  "harm-a3",
  "harm-a4",
  "harm-a5",
] as const;

/** Legacy repair-instruction root set retained for adjudication parity reporting. */
export const YURIKO_ATTEMPT_003_ROOT_ASSERTION_FAILURES_V1 = [
  "auto-a1",
  "auto-a2",
  "auto-a3",
  "auto-a4",
  "dep-a1",
  "dep-a2",
  "dep-a4",
  "dep-a5",
  "ind-a1",
  "ind-a2",
  "ind-a3",
  "ind-a4",
  "harm-a1",
  "harm-a2",
  "harm-a3",
  "harm-a4",
  "harm-a5",
] as const;

export const YURIKO_ATTEMPT_003_ANTI_CHEAT_MUST_FAIL_V1 = ["ind-a2", "harm-a4"] as const;

export function parseRagBlocksFromUserContent(userContent: string): Map<string, { exactText: string; tool: string; query: string; retrievalMode: string }> {
  const out = new Map<string, { exactText: string; tool: string; query: string; retrievalMode: string }>();
  const lines = userContent.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]?.match(/^\[RAG ([a-f0-9]+)\] tool=([^ ]+) query="([^"]*)" retrievalMode=([^\s]+)/);
    if (!header) continue;
    const [, evidenceId, tool, query, retrievalMode] = header;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]?.startsWith("[RAG ") || lines[j]?.startsWith("---")) break;
      if (lines[j]?.trim()) body.push(lines[j] ?? "");
    }
    out.set(evidenceId!, {
      exactText: body.join("\n").trim() || `fixture rag ${evidenceId}`,
      tool: tool!,
      query: query!,
      retrievalMode: retrievalMode!,
    });
  }
  return out;
}

function collectEvidenceRefs(hypotheses: StrategyHypothesisV3[]): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  for (const h of hypotheses) {
    refs.push(...h.evidenceRefs);
    for (const pkg of h.packages) refs.push(...pkg.evidenceRefs);
    for (const rel of h.relationships) refs.push(...rel.evidenceRefs);
    for (const a of h.strategicAssertions) refs.push(...a.evidenceRefs);
    for (const e of h.causalEdges) refs.push(...e.evidenceRefs);
  }
  return refs;
}

export function seedFrozenYurikoEvidenceLedgerFromAttempt003(args: {
  ctx: ProfessorPlanningContextV3;
  hypotheses: StrategyHypothesisV3[];
  userContentPath?: string;
}): ProfessorPlanningContextV3 {
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1();
  const userContent = readFileSync(args.userContentPath ?? join(targets.modelAttemptsDir, "attempt-003-user-content.txt"), "utf8");
  const ragBlocks = parseRagBlocksFromUserContent(userContent);
  const statementById = new Map<string, string>();

  for (const ref of collectEvidenceRefs(args.hypotheses)) {
    if (ref.kind !== "RAG_EVIDENCE") continue;
    for (const id of ref.evidenceIds) {
      if (ref.statement && !statementById.has(id)) statementById.set(id, ref.statement);
    }
  }

  const supplement: ProfessorEvidenceLedgerEntryV3[] = [];
  for (const [evidenceId, block] of ragBlocks) {
    const exactText = statementById.get(evidenceId) ?? block.exactText;
    supplement.push({
      evidenceId,
      kind: "RAG",
      tool: block.tool,
      query: block.query,
      retrievalMode: block.retrievalMode,
      source: "commander_primer",
      citationLabel: evidenceId,
      exactText,
      contentSha256: createHash("sha256").update(exactText, "utf8").digest("hex"),
    });
  }

  args.ctx.evidenceLedgerSupplement = [...(args.ctx.evidenceLedgerSupplement ?? []), ...supplement];
  return args.ctx;
}

export function assertionIdsWithValidationErrors(messages: string[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    const assertionMatch = message.match(/assertion '([a-z0-9-]+)'/i);
    if (assertionMatch?.[1]) ids.add(assertionMatch[1]);
  }
  return ids;
}
