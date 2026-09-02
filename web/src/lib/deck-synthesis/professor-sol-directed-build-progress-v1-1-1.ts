/**
 * Client-safe Sol-directed build progress mapping.
 */
import type { SolDirectedBuildStatusV111 } from "./professor-sol-directed-build-types-v1-1-1";
import { SOL_DIRECTED_BUILD_STATUS_LABELS } from "./professor-sol-directed-build-types-v1-1-1";

export const PROFESSOR_SOL_DIRECTED_BUILD_PROGRESS_V1_1_1_VERSION =
  "professor-sol-directed-build-progress-v1-1-1";

export type SolDirectedBuildProgressStage = {
  status: SolDirectedBuildStatusV111;
  label: string;
  shortLabel: string;
};

/** Ordered pipeline stages shown in the loading UI (excludes FAILED). */
export const SOL_DIRECTED_BUILD_PROGRESS_STAGES: SolDirectedBuildProgressStage[] = [
  { status: "CREATED", label: "Starting build", shortLabel: "Start" },
  { status: "ARCHITECTING", label: "Design strategy", shortLabel: "Architect" },
  { status: "RETRIEVING_CANDIDATES", label: "Find candidates", shortLabel: "Retrieve" },
  { status: "CONSTRUCTING_DECK", label: "Build deck list", shortLabel: "Construct" },
  { status: "VALIDATING", label: "Check legality", shortLabel: "Validate" },
  { status: "CRITIC_REFINING", label: "Critic refinements", shortLabel: "Critic" },
  { status: "HEAD_PROFESSOR_REVIEW", label: "Final grade", shortLabel: "Grade" },
  { status: "COMPLETE", label: "Deck complete", shortLabel: "Done" },
];

export const SOL_DIRECTED_OPTIMIZE_PROGRESS_STAGES: SolDirectedBuildProgressStage[] = [
  { status: "CREATED", label: "Starting optimization", shortLabel: "Start" },
  { status: "ARCHITECTING", label: "Read your list", shortLabel: "Import" },
  { status: "RETRIEVING_CANDIDATES", label: "Find upgrades", shortLabel: "Retrieve" },
  { status: "VALIDATING", label: "Check legality", shortLabel: "Validate" },
  { status: "CRITIC_REFINING", label: "Tune the list", shortLabel: "Optimize" },
  { status: "HEAD_PROFESSOR_REVIEW", label: "Final grade", shortLabel: "Grade" },
  { status: "COMPLETE", label: "Optimization complete", shortLabel: "Done" },
];

export function solDirectedProgressStages(mode?: "build" | "optimize"): SolDirectedBuildProgressStage[] {
  return mode === "optimize" ? SOL_DIRECTED_OPTIMIZE_PROGRESS_STAGES : SOL_DIRECTED_BUILD_PROGRESS_STAGES;
}

export function solDirectedBuildProgressIndex(
  status: SolDirectedBuildStatusV111,
  mode?: "build" | "optimize",
): number {
  if (status === "FAILED") return -1;
  const stages = solDirectedProgressStages(mode);
  const idx = stages.findIndex((stage) => stage.status === status);
  if (idx >= 0) return idx;
  if (status === "CONSTRUCTING_DECK" && mode === "optimize") {
    return stages.findIndex((stage) => stage.status === "RETRIEVING_CANDIDATES");
  }
  return 0;
}

/** 0–100 completeness for the loading bar. */
export function solDirectedBuildProgressPercent(
  status: SolDirectedBuildStatusV111,
  mode?: "build" | "optimize",
): number {
  if (status === "COMPLETE") return 100;
  if (status === "FAILED") return 0;
  const idx = solDirectedBuildProgressIndex(status, mode);
  const total = solDirectedProgressStages(mode).length - 1;
  // Midpoint credit for the active stage so the bar moves during long LLM calls.
  const raw = ((idx + 0.45) / total) * 100;
  return Math.min(99, Math.max(4, Math.round(raw)));
}

export function solDirectedBuildStatusLabel(status: SolDirectedBuildStatusV111): string {
  return SOL_DIRECTED_BUILD_STATUS_LABELS[status] ?? "Building…";
}

export function solDirectedBuildStageState(args: {
  status: SolDirectedBuildStatusV111;
  stageStatus: SolDirectedBuildStatusV111;
  mode?: "build" | "optimize";
}): "done" | "active" | "pending" {
  if (args.status === "FAILED") {
    const failedIdx = solDirectedBuildProgressIndex(args.status, args.mode);
    const currentIdx = solDirectedBuildProgressIndex(args.stageStatus, args.mode);
    return currentIdx <= failedIdx ? "done" : "pending";
  }
  const currentIdx = solDirectedBuildProgressIndex(args.status, args.mode);
  const stageIdx = solDirectedBuildProgressIndex(args.stageStatus, args.mode);
  if (stageIdx < currentIdx || args.status === "COMPLETE") return "done";
  if (stageIdx === currentIdx) return "active";
  return "pending";
}
