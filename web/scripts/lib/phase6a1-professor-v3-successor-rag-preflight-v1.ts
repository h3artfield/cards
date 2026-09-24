/**
 * Fail-before-model RAG environment preflight for Professor v3 successor smoke.
 */
import { isMtgRagEnabled } from "../../src/lib/mtg-rag/constants";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { buildProfessorV3RagEnvironmentIdentityV1 } from "./phase6a1-professor-v3-rag-environment-identity-v1";

export const PROFESSOR_V3_SUCCESSOR_RAG_PREFLIGHT_V1_VERSION = "phase6a1-professor-v3-successor-rag-preflight-v1";

export type ProfessorV3SuccessorRagPreflightResultV1 = {
  pass: boolean;
  mtgRagEnabled: boolean;
  initialRagEvidenceCount: number;
  initialRetrievalEventCount: number;
  sourceEnvironmentIdentity: string;
  firebaseProjectId: string;
  issues: string[];
};

export function verifyProfessorV3SuccessorRagPreflightV1(ctx: ProfessorPlanningContextV3): ProfessorV3SuccessorRagPreflightResultV1 {
  const issues: string[] = [];
  const mtgRagEnabled = isMtgRagEnabled();
  const firebaseProjectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  const initialRagEvidenceCount = ctx.initialRagEvidence.length;
  const initialRetrievalEventCount = ctx.initialRetrievalAttempts?.length ?? 0;
  const sourceEnvironmentIdentity = buildProfessorV3RagEnvironmentIdentityV1();

  if (!mtgRagEnabled) issues.push("MTG_RAG_ENABLED must be true before any Professor model request");
  if (!firebaseProjectId) issues.push("Expected non-secret Firebase/project identity is unset");
  if (initialRagEvidenceCount < 1) {
    issues.push(`Initial RAG evidence count must be >= 1 before model call (got ${initialRagEvidenceCount})`);
  }
  if (!sourceEnvironmentIdentity.includes("mtgRagEnabled=true")) {
    issues.push(`RAG environment identity does not report enabled retrieval: ${sourceEnvironmentIdentity}`);
  }

  return {
    pass: issues.length === 0,
    mtgRagEnabled,
    initialRagEvidenceCount,
    initialRetrievalEventCount,
    sourceEnvironmentIdentity,
    firebaseProjectId: firebaseProjectId || "(unset)",
    issues,
  };
}

export function assertProfessorV3SuccessorRagPreflightBeforeModelV1(ctx: ProfessorPlanningContextV3): ProfessorV3SuccessorRagPreflightResultV1 {
  const result = verifyProfessorV3SuccessorRagPreflightV1(ctx);
  if (!result.pass) {
    throw new Error(
      `FAIL_BEFORE_MODEL: Professor v3 successor RAG preflight failed — ${result.issues.join("; ")}`,
    );
  }
  return result;
}
