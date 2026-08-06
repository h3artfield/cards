import type { SpecialistResponse } from "../clerk-types";
import type { ClerkVerifierInput, ClerkVerifierOutput } from "./types";
import { getFormatRulePack } from "./rule-packs";
import { checkIntentFulfillment } from "./checks/intent-fulfillment";
import { checkInventoryGrounding } from "./checks/inventory-grounding";
import { checkRulesAndLegality } from "./checks/rules-legality";
import {
  checkConstraintCompliance,
  checkStrategicQuality,
} from "./checks/constraints";
import { checkKnowledgeGrounding } from "./checks/knowledge-grounding";
import { checkRequestConsistency } from "./checks/request-consistency";

function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function buildRevisionInstructions(input: {
  hardFailures: string[];
  intentFailed: boolean;
  route: ClerkVerifierInput["route"];
}): string[] {
  const instructions: string[] = [];

  if (input.intentFailed && input.route.intent === "build_deck") {
    if (input.route.format === "commander") {
      instructions.push(
        "Create one commander plus exactly 99 maindeck cards.",
        "Use only cards verified in store inventory.",
        "Validate color identity, singleton rules, and card count.",
        "Calculate the complete store price.",
        "Clearly identify any slots inventory cannot fill.",
      );
    } else if (input.route.game === "pokemon") {
      instructions.push(
        "Build a complete 60-card Pokémon deck from in-stock inventory.",
        "Mark every missing slot explicitly.",
      );
    }
  }

  for (const failure of input.hardFailures) {
    if (failure.includes("cannot legally be used as a commander")) {
      instructions.push(
        "Remove any card that is not a sole commander (canBeSoleCommander must be true).",
      );
    }
    if (failure.includes("Invented inventory")) {
      instructions.push(
        "Every in-stock claim must reference a real inventoryItemId from the store database.",
      );
    }
    if (failure.includes("Commander mismatch")) {
      instructions.push(
        "Use the exact commander the customer requested — do not substitute a different commander.",
      );
    }
    if (failure.includes("color identity")) {
      instructions.push(
        "Filter results to match the customer's requested color identity exactly.",
      );
    }
    if (failure.includes("price limit") || failure.includes("budget")) {
      instructions.push(
        "Exclude cards above the customer's stated price or budget limit.",
      );
    }
  }

  return [...new Set(instructions)];
}

function needsInternetCheck(input: {
  userQuestion: string;
  specialist: SpecialistResponse | null;
}): { required: boolean; reason?: string } {
  const q = input.userQuestion.toLowerCase();
  const metagame =
    /\b(metagame|winning|tournament|meta|top deck|best deck right now)\b/i.test(
      q,
    );
  if (metagame && input.specialist?.deckList == null) {
    return {
      required: true,
      reason: "The question asks about current metagame or tournament results.",
    };
  }
  return { required: false };
}

export async function verifyClerkAnswer(
  input: ClerkVerifierInput,
): Promise<ClerkVerifierOutput> {
  const { ctx, route, tools, specialist, revisionAttempt } = input;
  const rulePack = getFormatRulePack(route.game, route.format);

  const intentCheck = checkIntentFulfillment({
    route,
    specialist,
    rulePack,
  });

  const inventoryResult = checkInventoryGrounding({
    specialist,
    inventoryByName: tools.inventoryByName,
    inventoryMatchPool: tools.inventoryMatchPool,
    inventoryOnly: route.constraints.inventory_only,
  });

  const rulesResult = await checkRulesAndLegality({
    route,
    specialist,
    rulePack,
    userQuestion: ctx.user_question,
    catalogHits: tools.catalog,
  });

  const constraintCheck = checkConstraintCompliance({
    route,
    specialist,
    userQuestion: ctx.user_question,
  });

  const strategicCheck = checkStrategicQuality({
    route,
    specialist,
    userQuestion: ctx.user_question,
  });

  const knowledgeResult = checkKnowledgeGrounding({
    mtgRoute: tools.knowledge?.mtgRoute,
    tools,
    specialist,
    userQuestion: ctx.user_question,
  });

  const requestConsistency = await checkRequestConsistency({
    route,
    specialist,
    ctx,
    lockedCommanderOracleId: specialist?.commanderOracleId,
  });

  const hardFailures = [
    ...(!intentCheck.passed && intentCheck.reason
      ? [intentCheck.reason]
      : []),
    ...(!requestConsistency.passed && requestConsistency.reason
      ? [requestConsistency.reason]
      : []),
    ...inventoryResult.hardFailures,
    ...rulesResult.hardFailures,
    ...(!constraintCheck.passed && constraintCheck.reason
      ? [constraintCheck.reason]
      : []),
    ...knowledgeResult.hardFailures,
  ];

  const warnings = [
    ...(intentCheck.warnings ?? []),
    ...(inventoryResult.check.warnings ?? []),
    ...(rulesResult.check.warnings ?? []),
    ...(constraintCheck.warnings ?? []),
    ...(strategicCheck.warnings ?? []),
    ...(knowledgeResult.warnings ?? []),
    ...(requestConsistency.warnings ?? []),
  ];

  const unsupportedClaims = [
    ...inventoryResult.claims,
    ...rulesResult.claims,
  ]
    .filter((c) => !c.verified)
    .map((c) => c.claim);

  const verifiedClaims = [
    ...inventoryResult.claims,
    ...rulesResult.claims,
  ].filter((c) => c.verified);

  const internet = needsInternetCheck({
    userQuestion: ctx.user_question,
    specialist,
  });

  const overallScore = averageScore([
    intentCheck.score,
    inventoryResult.check.score,
    rulesResult.check.score,
    constraintCheck.score,
    strategicCheck.score,
    knowledgeResult.score,
    requestConsistency.score,
  ]);

  const revisionInstructions = buildRevisionInstructions({
    hardFailures,
    intentFailed: !intentCheck.passed,
    route,
  });

  let status: ClerkVerifierOutput["status"] = "pass";
  const knowledgeOnlyFailures = knowledgeResult.hardFailures;
  const nonKnowledgeFailures = hardFailures.filter(
    (f) => !knowledgeOnlyFailures.includes(f),
  );

  if (nonKnowledgeFailures.length > 0) {
    status = revisionAttempt >= 2 ? "block" : "revise";
  } else if (knowledgeOnlyFailures.length > 0 && input.specialist?.direct_answer) {
    status = "soft_block";
  } else if (hardFailures.length > 0) {
    status = revisionAttempt >= 2 ? "block" : "revise";
  }

  return {
    status,
    overall_score: overallScore,
    checks: {
      answered_user_question: intentCheck,
      inventory_grounding: inventoryResult.check,
      rules_and_legality: rulesResult.check,
      constraint_compliance: constraintCheck,
      strategic_quality: strategicCheck,
    },
    hard_failures: hardFailures,
    warnings,
    unsupported_claims: unsupportedClaims,
    revision_instructions: revisionInstructions,
    verified_claims: verifiedClaims,
    internet_check_required: internet.required,
    internet_check_reason: internet.reason,
    internet_sources_used: [],
    blocking_issues: hardFailures,
  };
}
