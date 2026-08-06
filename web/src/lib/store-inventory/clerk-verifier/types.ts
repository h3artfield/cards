import type {
  ClerkOrchestratorContext,
  ClerkRouterResult,
  SpecialistResponse,
} from "../clerk-types";
import type { ClerkToolResults } from "../clerk-tools";

export type VerifierStatus = "pass" | "revise" | "block" | "soft_block";

export type ClaimSourceType =
  | "inventory"
  | "card_database"
  | "deck_statistics"
  | "rules"
  | "model";

export interface VerifiedClaim {
  claim: string;
  source_type: ClaimSourceType;
  source_id: string | null;
  verified: boolean;
}

export interface VerifierCheckDetail {
  score: number;
  passed: boolean;
  reason?: string;
  warnings?: string[];
}

export interface ClerkVerifierOutput {
  status: VerifierStatus;
  overall_score: number;
  checks: {
    answered_user_question: VerifierCheckDetail;
    inventory_grounding: VerifierCheckDetail;
    rules_and_legality: VerifierCheckDetail;
    constraint_compliance: VerifierCheckDetail;
    strategic_quality: VerifierCheckDetail;
  };
  hard_failures: string[];
  warnings: string[];
  unsupported_claims: string[];
  revision_instructions: string[];
  verified_claims: VerifiedClaim[];
  internet_check_required: boolean;
  internet_check_reason?: string;
  internet_sources_used: string[];
  blocking_issues: string[];
}

export interface ClerkVerifierInput {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  tools: ClerkToolResults;
  specialist: SpecialistResponse | null;
  revisionAttempt: number;
}

export interface VerifierRevisionContext {
  attempt: number;
  instructions: string[];
  blockingIssues: string[];
}

export interface FormatRulePack {
  formatKey: string;
  requirements: Record<string, boolean | number | string>;
}
