/**
 * Post-Chatterfang typed grounding contract repair helpers — frozen attempt-003 acceptance fixture.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { EvidenceRef } from "../../src/lib/deck-synthesis/professor-planning-evidence-v3";
import type { ProfessorEvidenceLedgerEntryV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1 } from "./phase6a1-professor-v3-smoke-output-targets-v6";
import { parseRagBlocksFromUserContent, assertionIdsWithValidationErrors } from "./phase6a1-professor-v3-generic-grounding-derivation-repair-v1";

export const PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_V1_VERSION =
  "phase6a1-professor-v3-post-chatterfang-typed-grounding-contract-repair-v1";

export const PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_DECISION_V1 =
  "PROFESSOR_V3_POST_CHATTERFANG_TYPED_GROUNDING_CONTRACT_REPAIR_V1_AUTHORIZED_NO_MODEL";

/** Mechanism-fact claims that should ground after generic nested-action/resource repair. */
export const CHATTERFANG_ATTEMPT_003_MECHANISM_ENTAILED_ASSERTION_IDS_V1 = [
  "auto-a1-create-squirrels",
  "auto-a2-require-squirrels",
  "dep-a1-create-squirrels",
  "dep-a2-require-squirrels",
  "ind-a1-optional-commander-overlay",
  "harmony-a1-create-squirrels",
  "harmony-a2-require-squirrels",
] as const;

/** Genuine model/schema failures that must remain rejected. */
export const CHATTERFANG_ATTEMPT_003_MUST_FAIL_ASSERTION_IDS_V1 = [
  "auto-a3-stat-interaction",
  "dep-a3-scale-target-modification",
  "harmony-a3-modify-target",
] as const;

export { assertionIdsWithValidationErrors };

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

export function seedFrozenChatterfangEvidenceLedgerFromAttempt003(args: {
  ctx: ProfessorPlanningContextV3;
  hypotheses: StrategyHypothesisV3[];
  userContentPath?: string;
}): ProfessorPlanningContextV3 {
  const targets = resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1();
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
