/**
 * Compute and write the frozen Professor PLAN v2 experiment stack manifest.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFESSOR_PLANNING_CONTRACTS_V2_VERSION } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { PROFESSOR_PLANNING_EVIDENCE_V1_VERSION } from "../../src/lib/deck-synthesis/professor-planning-evidence-v1";
import { STRATEGY_PACKAGE_VALIDATOR_V2_VERSION } from "../../src/lib/deck-synthesis/strategy-package-validator-v2";
import { PROFESSOR_PLAN_AGENT_V2_VERSION } from "./phase6a1-professor-plan-agent-v2";
import { PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION } from "./phase6a1-professor-plan-context-builder-v2";
import { PROFESSOR_PLAN_NORMALIZER_V2_VERSION } from "./phase6a1-professor-plan-normalizer-v2";
import {
  PROFESSOR_PLAN_RESPONSES_TOOLS_V2,
  PROFESSOR_PLAN_PROMPT_V2_VERSION,
  PROFESSOR_PLAN_SYSTEM_PROMPT_V2,
  PROFESSOR_PLAN_USER_PROMPT_TEMPLATE_V2,
} from "./phase6a1-professor-plan-prompt-v2";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { THREE_LENS_PORTFOLIO_SELECTOR_V2_VERSION } from "./phase6a1-three-lens-portfolio-selector-v2";

export const PROFESSOR_PLAN_STACK_FREEZE_V2_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v2-stack-freeze-v1.json",
);

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sha256File(path: string): string {
  return sha256Text(readFileSync(path, "utf8"));
}

export function buildProfessorPlanStackFreezeV2(args: {
  smokeCaseId: string;
  smokeCaseStatus: string;
  smokeSystemPromptHash: string;
  smokeUserPromptHash: string;
  frozenAt?: string;
}) {
  const modelPin = loadProfessorModelPinV2();
  const toolSchemaSha256 = sha256Text(JSON.stringify(PROFESSOR_PLAN_RESPONSES_TOOLS_V2));
  const systemPromptSha256 = sha256Text(PROFESSOR_PLAN_SYSTEM_PROMPT_V2);
  const userPromptTemplateSha256 = sha256Text(PROFESSOR_PLAN_USER_PROMPT_TEMPLATE_V2);

  const freeze = {
    version: "phase6a1-professor-plan-experiment-v2-stack-freeze-v1",
    frozenAt: args.frozenAt ?? new Date().toISOString(),
    purpose: "Formal 28-case Professor PLAN experiment v2 — stack frozen after frontier-model harness smoke",
    smokeVerification: {
      caseId: args.smokeCaseId,
      caseStatus: args.smokeCaseStatus,
      systemPromptHash: args.smokeSystemPromptHash,
      userPromptHash: args.smokeUserPromptHash,
    },
    modelPin: {
      path: "phase6a1-professor-plan-model-pin-v2.json",
      sha256: modelPin.sha256,
      modelIdentifier: modelPin.modelIdentifier,
      productName: modelPin.productName,
      reasoningConfiguration: modelPin.reasoningConfiguration,
      inferenceParameters: modelPin.inferenceParameters,
      experimentBounds: modelPin.experimentBounds,
    },
    frozenComponents: {
      systemPrompt: {
        version: PROFESSOR_PLAN_PROMPT_V2_VERSION,
        sha256: systemPromptSha256,
      },
      userPromptTemplate: {
        version: PROFESSOR_PLAN_PROMPT_V2_VERSION,
        sha256: userPromptTemplateSha256,
      },
      contracts: {
        version: PROFESSOR_PLANNING_CONTRACTS_V2_VERSION,
        file: "web/src/lib/deck-synthesis/professor-planning-contracts-v2.ts",
        sha256: sha256File(resolve("src/lib/deck-synthesis/professor-planning-contracts-v2.ts")),
      },
      planningEvidence: {
        version: PROFESSOR_PLANNING_EVIDENCE_V1_VERSION,
        file: "web/src/lib/deck-synthesis/professor-planning-evidence-v1.ts",
        sha256: sha256File(resolve("src/lib/deck-synthesis/professor-planning-evidence-v1.ts")),
      },
      normalizer: {
        version: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
        file: "web/scripts/lib/phase6a1-professor-plan-normalizer-v2.ts",
        sha256: sha256File(resolve("scripts/lib/phase6a1-professor-plan-normalizer-v2.ts")),
      },
      validator: {
        version: STRATEGY_PACKAGE_VALIDATOR_V2_VERSION,
        file: "web/src/lib/deck-synthesis/strategy-package-validator-v2.ts",
        sha256: sha256File(resolve("src/lib/deck-synthesis/strategy-package-validator-v2.ts")),
      },
      toolSchemas: {
        version: PROFESSOR_PLAN_PROMPT_V2_VERSION,
        sha256: toolSchemaSha256,
      },
      portfolioSelector: {
        version: THREE_LENS_PORTFOLIO_SELECTOR_V2_VERSION,
        file: "web/scripts/lib/phase6a1-three-lens-portfolio-selector-v2.ts",
        sha256: sha256File(resolve("scripts/lib/phase6a1-three-lens-portfolio-selector-v2.ts")),
      },
      agent: {
        version: PROFESSOR_PLAN_AGENT_V2_VERSION,
        file: "web/scripts/lib/phase6a1-professor-plan-agent-v2.ts",
        sha256: sha256File(resolve("scripts/lib/phase6a1-professor-plan-agent-v2.ts")),
      },
      contextBuilder: {
        version: PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION,
        file: "web/scripts/lib/phase6a1-professor-plan-context-builder-v2.ts",
        sha256: sha256File(resolve("scripts/lib/phase6a1-professor-plan-context-builder-v2.ts")),
      },
    },
    tuningPolicy: "Do not tune frozen stack components from Commander-specific strategy quality observed during formal 28-case run.",
  };

  const manifestSha256 = sha256Text(JSON.stringify(freeze));
  return { ...freeze, manifestSha256 };
}

export function writeProfessorPlanStackFreezeV2(args: Parameters<typeof buildProfessorPlanStackFreezeV2>[0]): string {
  const freeze = buildProfessorPlanStackFreezeV2(args);
  writeFileSync(PROFESSOR_PLAN_STACK_FREEZE_V2_PATH, JSON.stringify(freeze, null, 2));
  return PROFESSOR_PLAN_STACK_FREEZE_V2_PATH;
}
