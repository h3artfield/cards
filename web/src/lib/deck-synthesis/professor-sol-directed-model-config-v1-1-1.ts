/**
 * Sol-directed build model + reasoning overrides.
 *
 * Default frontier model: gpt-5.6-luna (all stages unless overridden per-stage).
 *
 *   PROFESSOR_SOL_DIRECTED_MODEL=gpt-5.6-luna
 *   PROFESSOR_SOL_DIRECTED_REASONING_EFFORT=high
 *
 * When the pipeline is set to high/xhigh, strategic stages (Architect, Head Professor)
 * use medium reasoning and slot-filling stages (Constructor, Critic) use medium + live-fast
 * sync calls — quality where it matters, speed where the task is constrained selection.
 */
import type { ReasoningEffort } from "./professor-head-professor-caller-v4-8-v1";

export const PROFESSOR_SOL_DIRECTED_FRONTIER_MODEL_V111 = "gpt-5.6-luna";

export type SolDirectedModelStageV111 =
  | "ARCHITECT"
  | "CONSTRUCTOR"
  | "CRITIC"
  | "HEAD_PROFESSOR";

const STAGE_MODEL_ENV: Record<SolDirectedModelStageV111, string> = {
  ARCHITECT: "PROFESSOR_SOL_DIRECTED_ARCHITECT_MODEL",
  CONSTRUCTOR: "PROFESSOR_SOL_DIRECTED_CONSTRUCTOR_MODEL",
  CRITIC: "PROFESSOR_SOL_DIRECTED_CRITIC_MODEL",
  HEAD_PROFESSOR: "PROFESSOR_SOL_DIRECTED_HEAD_PROFESSOR_MODEL",
};

const STAGE_DEFAULT_REASONING: Record<SolDirectedModelStageV111, ReasoningEffort> = {
  ARCHITECT: "medium",
  CONSTRUCTOR: "low",
  CRITIC: "medium",
  HEAD_PROFESSOR: "medium",
};

const VALID_REASONING = new Set<ReasoningEffort>(["none", "minimal", "low", "medium", "high", "xhigh"]);

export function resolveSolDirectedModelIdentifier(stage: SolDirectedModelStageV111): string {
  const stageOverride = process.env[STAGE_MODEL_ENV[stage]]?.trim();
  if (stageOverride) return stageOverride;

  const pipelineOverride = process.env.PROFESSOR_SOL_DIRECTED_MODEL?.trim();
  if (pipelineOverride) return pipelineOverride;

  const brewOverride = process.env.PROFESSOR_BREW_HEAD_PROFESSOR_MODEL?.trim();
  if (brewOverride) return brewOverride;

  return PROFESSOR_SOL_DIRECTED_FRONTIER_MODEL_V111;
}

export function resolveSolDirectedReasoningEffort(
  stage: SolDirectedModelStageV111,
  liveFast?: boolean,
): ReasoningEffort | undefined {
  if (liveFast) return "low";

  const stageKey = `PROFESSOR_SOL_DIRECTED_${stage}_REASONING_EFFORT`;
  const stageOverride = process.env[stageKey]?.trim().toLowerCase();
  if (stageOverride && VALID_REASONING.has(stageOverride as ReasoningEffort)) {
    return stageOverride as ReasoningEffort;
  }

  const pipelineOverride = process.env.PROFESSOR_SOL_DIRECTED_REASONING_EFFORT?.trim().toLowerCase();
  if (pipelineOverride && VALID_REASONING.has(pipelineOverride as ReasoningEffort)) {
    if (pipelineOverride === "high" || pipelineOverride === "xhigh") {
      return STAGE_DEFAULT_REASONING[stage];
    }
    return pipelineOverride as ReasoningEffort;
  }

  return STAGE_DEFAULT_REASONING[stage];
}

export function solDirectedStageLiveFast(stage: SolDirectedModelStageV111): boolean {
  if (stage === "CONSTRUCTOR" || stage === "CRITIC") return true;
  const globalReasoning = process.env.PROFESSOR_SOL_DIRECTED_REASONING_EFFORT?.trim().toLowerCase();
  if (globalReasoning === "high" || globalReasoning === "xhigh") {
    return false;
  }
  const env = process.env.PROFESSOR_SOL_DIRECTED_LIVE_FAST?.trim();
  return env === "1" || env === "true";
}

export function solDirectedModelCallOptions(stage: SolDirectedModelStageV111): {
  modelIdentifierOverride: string;
  reasoningEffortOverride?: ReasoningEffort;
  liveFast: boolean;
} {
  const liveFast = solDirectedStageLiveFast(stage);
  let reasoningEffortOverride = resolveSolDirectedReasoningEffort(stage, liveFast);
  if (stage === "CONSTRUCTOR" && liveFast) {
    reasoningEffortOverride = "medium";
  }
  if (stage === "CRITIC" && liveFast) {
    reasoningEffortOverride = "medium";
  }
  return {
    modelIdentifierOverride: resolveSolDirectedModelIdentifier(stage),
    reasoningEffortOverride,
    liveFast,
  };
}
