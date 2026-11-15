/**
 * Offline adjudication of Yuriko spent smoke grounding failures — classifies validator issues without mutating the validator.
 */
import { readFileSync } from "node:fs";
import { resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1 } from "./phase6a1-professor-v3-smoke-output-targets-v6";

export const PROFESSOR_V3_YURIKO_GROUNDING_ADJUDICATION_V1_VERSION =
  "phase6a1-professor-v3-yuriko-grounding-adjudication-v1";

export const PROFESSOR_V3_YURIKO_GROUNDING_ADJUDICATION_DECISION_V1 =
  "PROFESSOR_V3_POST_YURIKO_GROUNDING_CONTRACT_AND_TERMINAL_SEAL_REPAIR_V1_AUTHORIZED_NO_MODEL";

export type ProfessorV3GroundingFailureBucketV1 =
  | "A_GENUINELY_UNSUPPORTED_MODEL_CLAIM"
  | "B_BAD_EVIDENCE_REF"
  | "C_VALIDATOR_TOO_STRICT"
  | "D_MISSING_GROUNDING_VOCABULARY"
  | "E_VALID_DERIVED_INFERENCE"
  | "F_REDUNDANT_OR_OMIT"
  | "CAUSAL_EDGE_CASCADE";

export type ProfessorV3GroundingFailureClassificationV1 = {
  issueKey: string;
  code: string;
  message: string;
  bucket: ProfessorV3GroundingFailureBucketV1;
  assertionId: string | null;
  resourceOrState: string | null;
  predicate: string | null;
  action: string | null;
  rationale: string;
};

export type ProfessorV3YurikoGroundingAdjudicationResultV1 = {
  version: typeof PROFESSOR_V3_YURIKO_GROUNDING_ADJUDICATION_V1_VERSION;
  generatedAt: string;
  decision: string;
  sourceAttempt: string;
  finalFailedAssertionIssues: number;
  causalEdgeCascadeIssues: number;
  bucketCounts: Record<ProfessorV3GroundingFailureBucketV1, number>;
  classifications: ProfessorV3GroundingFailureClassificationV1[];
  interpretation: {
    improveProfessor: number;
    improveGroundingSystem: number;
    summary: string;
  };
};

const YURIKO_VOCABULARY_GAP_STATES = new Set([
  "REVEALED_CARD_IN_HAND",
  "LIFE_LOSS",
  "CARD_IN_HAND_AND_EACH_OPPONENT_LIFE_LOSS",
  "CARD_IN_HAND_AND_SCALED_TABLE_LIFE_LOSS",
]);

const YURIKO_DERIVED_INFERENCE_STATES = new Set([
  "MULTIPLE_NINJA_COMBAT_DAMAGE_EVENTS",
  "EARLY_COMMANDER_NINJUTSU_WINDOW",
  "UNBLOCKED_ATTACKER",
  "UNBLOCKED_OR_CONNECTING_NINJAS",
  "ENGINEERED_TOP_CARD",
  "ENGINEERED_HIGH_MANA_VALUE_TOP_CARD",
  "TOP_CARD_SELECTION_AND_NEEDED_CARD_ACCESS",
  "HIGH_MANA_VALUE_CARD_ON_TOP_OF_LIBRARY",
  "IMPROVED_ACCESS_TO_NEEDED_CARDS",
  "PROTECTED_SETUP_WINDOW",
  "COMPACT_LIBRARY_COMBO_READY",
  "COMMANDER_INDEPENDENT_FINISH",
  "TEMPO_AND_PROTECTION_CAPACITY",
  "MULTIPLE_NINJA_COMBAT_DAMAGE_EVENTS",
]);

const YURIKO_VOCABULARY_GAP_ACTIONS = new Set([
  "NINJA_YOU_CONTROL",
  "NINJA_DEALS_COMBAT_DAMAGE_TO_A_PLAYER",
  "EACH_NINJA_COMBAT_DAMAGE_EVENT_TO_A_PLAYER",
  "MOVE_CARDS",
]);

const YURIKO_VOCABULARY_GAP_OBJECTS = new Set(["YURIKO", "REVEALED_CARD", "UNBLOCKED_ATTACKER_YOU_CONTROL"]);

function parseStateFromMessage(message: string): string | null {
  const stateMatch = message.match(
    /(?:PRODUCES_STATE|CONSUMES_STATE|REQUIRES_STATE) '([A-Z0-9_]+)'/,
  );
  return stateMatch?.[1] ?? null;
}

function parseRejectedMechanic(message: string): { predicate: string | null; action: string | null; object: string | null } {
  const match = message.match(/support for ([A-Z_]+)(?:\/([A-Z0-9_]+))?(?:\/([A-Z0-9_]+))?/);
  return { predicate: match?.[1] ?? null, action: match?.[2] ?? null, object: match?.[3] ?? null };
}

function inferIssueCodeFromRepairLine(message: string): string {
  if (message.includes("Causal edge connects unvalidated assertions")) return "HARMONY_UNDERDETERMINED";
  if (message.includes("Harmony lacks validated producer/consumer resource/state bridge")) return "HARMONY_UNDERDETERMINED";
  if (message.includes("lacks canonical mechanism/oracle support")) return "REJECTED_INVENTED_MECHANIC";
  if (message.includes("does not structurally establish")) return "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL";
  if (message.includes("does not structurally support")) return "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL";
  return "UNKNOWN_VALIDATION_ISSUE";
}

function classifyRepairLine(message: string): ProfessorV3GroundingFailureClassificationV1 {
  const code = inferIssueCodeFromRepairLine(message);
  return classifyIssue({ code, message });
}

function classifyIssue(issue: { code: string; message: string }): ProfessorV3GroundingFailureClassificationV1 {
  const issueKey = `${issue.code}:${issue.message}`;
  const state = parseStateFromMessage(issue.message);
  const rejected = parseRejectedMechanic(issue.message);

  if (issue.message.includes("Causal edge connects unvalidated assertions")) {
    return {
      issueKey,
      code: issue.code,
      message: issue.message,
      bucket: "CAUSAL_EDGE_CASCADE",
      assertionId: null,
      resourceOrState: state,
      predicate: null,
      action: null,
      rationale: "Downstream cascade from unvalidated assertion graph — not an independent root failure.",
    };
  }

  if (issue.code === "ASSERTION_MISSING_EVIDENCE" || issue.code === "EVIDENCE_REF_NOT_FOUND") {
    return {
      issueKey,
      code: issue.code,
      message: issue.message,
      bucket: "B_BAD_EVIDENCE_REF",
      assertionId: null,
      resourceOrState: state,
      predicate: rejected.predicate,
      action: rejected.action,
      rationale: "Evidence linkage problem — canonical support may exist but refs were missing or invalid.",
    };
  }

  if (issue.code === "REJECTED_INVENTED_MECHANIC") {
    if (
      (rejected.action && YURIKO_VOCABULARY_GAP_ACTIONS.has(rejected.action)) ||
      (rejected.object && YURIKO_VOCABULARY_GAP_OBJECTS.has(rejected.object))
    ) {
      return {
        issueKey,
        code: issue.code,
        message: issue.message,
        bucket: "D_MISSING_GROUNDING_VOCABULARY",
        assertionId: null,
        resourceOrState: state,
        predicate: rejected.predicate,
        action: rejected.action,
        rationale:
          rejected.predicate === "TRIGGERS_ON"
            ? "Yuriko trigger exists in mechanism truth but TRIGGERS_ON/action vocabulary does not expose it."
            : "Canonical Yuriko ninjutsu/interaction is encoded with different action tokens than MOVE_CARDS/YURIKO.",
      };
    }
    return {
      issueKey,
      code: issue.code,
      message: issue.message,
      bucket: "A_GENUINELY_UNSUPPORTED_MODEL_CLAIM",
      assertionId: null,
      resourceOrState: state,
      predicate: rejected.predicate,
      action: rejected.action,
      rationale: "Mechanical predicate/action is not supported by oracle or mechanism facts.",
    };
  }

  if (issue.code === "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL" && issue.message.includes("does not structurally support assertion")) {
    return {
      issueKey,
      code: issue.code,
      message: issue.message,
      bucket: "B_BAD_EVIDENCE_REF",
      assertionId: null,
      resourceOrState: state,
      predicate: null,
      action: null,
      rationale: "Claim may be reasonable but evidence refs did not structurally support the typed assertion.",
    };
  }

  if (issue.code === "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL" && state) {
    if (YURIKO_DERIVED_INFERENCE_STATES.has(state)) {
      return {
        issueKey,
        code: issue.code,
        message: issue.message,
        bucket: "E_VALID_DERIVED_INFERENCE",
        assertionId: null,
        resourceOrState: state,
        predicate: "PRODUCES_STATE",
        action: null,
        rationale: "Strategic aggregate/compositional state is reasonable for Yuriko but requires inference rules, not a literal mechanism fact token.",
      };
    }
    if (YURIKO_VOCABULARY_GAP_STATES.has(state)) {
      return {
        issueKey,
        code: issue.code,
        message: issue.message,
        bucket: "D_MISSING_GROUNDING_VOCABULARY",
        assertionId: null,
        resourceOrState: state,
        predicate: "PRODUCES_STATE",
        action: null,
        rationale: "Oracle/mechanism actions imply this state, but produced-state vocabulary does not emit it.",
      };
    }
    if (state.includes("REDUNDANT") || state.includes("UNNECESSARY")) {
      return {
        issueKey,
        code: issue.code,
        message: issue.message,
        bucket: "F_REDUNDANT_OR_OMIT",
        assertionId: null,
        resourceOrState: state,
        predicate: "PRODUCES_STATE",
        action: null,
        rationale: "Claim adds little beyond existing validated graph.",
      };
    }
  }

  if (issue.code === "HARMONY_UNDERDETERMINED" && issue.message.includes("resource/state bridge")) {
    return {
      issueKey,
      code: issue.code,
      message: issue.message,
      bucket: "C_VALIDATOR_TOO_STRICT",
      assertionId: null,
      resourceOrState: state,
      predicate: null,
      action: null,
      rationale: "Bridge mismatch may be syntactic rather than strategic.",
    };
  }

  return {
    issueKey,
    code: issue.code,
    message: issue.message,
    bucket: "A_GENUINELY_UNSUPPORTED_MODEL_CLAIM",
    assertionId: null,
    resourceOrState: state,
    predicate: rejected.predicate,
    action: rejected.action,
    rationale: "Default conservative bucket — treat as model/claim quality unless reclassified.",
  };
}

function dedupeClassifications(items: ProfessorV3GroundingFailureClassificationV1[]): ProfessorV3GroundingFailureClassificationV1[] {
  const seen = new Set<string>();
  const out: ProfessorV3GroundingFailureClassificationV1[] = [];
  for (const item of items) {
    if (seen.has(item.issueKey)) continue;
    seen.add(item.issueKey);
    out.push(item);
  }
  return out;
}

export async function adjudicateProfessorV3YurikoSpentGroundingFailuresV1(args?: {
  attemptId?: string;
}): Promise<ProfessorV3YurikoGroundingAdjudicationResultV1> {
  const attemptId = args?.attemptId ?? "003";
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1();
  const repairPath = `${targets.modelAttemptsDir}/attempt-${attemptId}-repair-instructions.txt`;
  const repairLines = readFileSync(repairPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

  const classifications = dedupeClassifications(repairLines.map(classifyRepairLine));

  const bucketCounts = {
    A_GENUINELY_UNSUPPORTED_MODEL_CLAIM: 0,
    B_BAD_EVIDENCE_REF: 0,
    C_VALIDATOR_TOO_STRICT: 0,
    D_MISSING_GROUNDING_VOCABULARY: 0,
    E_VALID_DERIVED_INFERENCE: 0,
    F_REDUNDANT_OR_OMIT: 0,
    CAUSAL_EDGE_CASCADE: 0,
  } satisfies Record<ProfessorV3GroundingFailureBucketV1, number>;
  for (const item of classifications) bucketCounts[item.bucket] += 1;

  const improveProfessor = bucketCounts.A_GENUINELY_UNSUPPORTED_MODEL_CLAIM + bucketCounts.B_BAD_EVIDENCE_REF + bucketCounts.F_REDUNDANT_OR_OMIT;
  const improveGroundingSystem =
    bucketCounts.C_VALIDATOR_TOO_STRICT + bucketCounts.D_MISSING_GROUNDING_VOCABULARY + bucketCounts.E_VALID_DERIVED_INFERENCE;

  const assertionIssues = classifications.filter((item) => item.bucket !== "CAUSAL_EDGE_CASCADE");

  return {
    version: PROFESSOR_V3_YURIKO_GROUNDING_ADJUDICATION_V1_VERSION,
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_YURIKO_GROUNDING_ADJUDICATION_DECISION_V1,
    sourceAttempt: `attempt-${attemptId}`,
    finalFailedAssertionIssues: assertionIssues.length,
    causalEdgeCascadeIssues: bucketCounts.CAUSAL_EDGE_CASCADE,
    bucketCounts,
    classifications,
    interpretation: {
      improveProfessor,
      improveGroundingSystem,
      summary:
        improveGroundingSystem > improveProfessor
          ? "Grounding-system work dominates — vocabulary/inference gaps and validator expressiveness, not primarily model repair."
          : improveProfessor >= improveGroundingSystem
            ? "Professor output/evidence work dominates — model claims or refs are the primary failure mode."
            : "Mixed failure modes — address grounding vocabulary/inference and Professor evidence linking in parallel.",
    },
  };
}
