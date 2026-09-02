/**
 * Professor v4.16.6.1 — authoritative build control (v4166 only; v4165 telemetry ignored for control).
 */
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import { resolveStructuralTargetV416 } from "./professor-mana-plan-v4-16-v1";

export const PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION = "professor-build-control-v4-16-6-1-v1";

/** Kept in sync with professor-structural-build-telemetry-v4-16-6-v1 */
export const PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION =
  "professor-structural-build-telemetry-v4-16-6-v1";

export type BuildPhaseV4166 =
  | "EARLY_ASSEMBLY"
  | "NORMAL_ASSEMBLY"
  | "STALLED_RECOVERY"
  | "STRUCTURAL_CLOSURE"
  | "BUILD_FAILED_CANDIDATE_EXHAUSTION";

export type BuildControlActionV41661 =
  | "CONTINUE_NORMAL_ASSEMBLY"
  | "RUN_STRUCTURAL_RESEARCH"
  | "TERMINATE_EXHAUSTED";

/** Client-safe telemetry snapshot — avoids importing server catalog modules into brew UI. */
type BuildControlTelemetryV4166 = {
  buildPhase?: BuildPhaseV4166;
  completionPlan?: { action?: BuildControlActionV41661 };
  termination?: { shouldTerminate?: boolean; reason?: string } | null;
};

export type ProfessorBuildControlV41661 = {
  version: typeof PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION;
  authoritativeVersion: typeof PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION;
  phase: BuildPhaseV4166;
  action: BuildControlActionV41661;
  shouldContinueNormalAssembly: boolean;
  shouldRunStructuralResearch: boolean;
  shouldRunMana: boolean;
  shouldTerminate: boolean;
  terminalState: "BUILD_FAILED_CANDIDATE_EXHAUSTION" | null;
  reason: string;
  legacyFlagsObserved: string[];
  legacyTerminationIgnored: boolean;
};

export type BuildControlDecisionV41661 = {
  version: typeof PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION;
  iteration: number;
  phase: BuildPhaseV4166;
  requestedAction: BuildControlActionV41661;
  authoritativeGateVersion: typeof PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION;
  shouldContinue: boolean;
  shouldStructuralResearch: boolean;
  shouldTerminate: boolean;
  terminalReason: string | null;
  legacyFlagsObserved: string[];
};

export type LegacyBuildControlAuditRowV41661 = {
  callSite: string;
  legacyRead: string;
  priorEffect: string;
  replacementV4166Source: string;
  status: "REMOVED" | "TELEMETRY_ONLY" | "FIXED";
};

/** Production audit — v4165 must not control orchestration after v4.16.6.1. */
export const LEGACY_BUILD_CONTROL_AUDIT_V41661: LegacyBuildControlAuditRowV41661[] = [
  {
    callSite: "professor-brew-progress-v4-7-v1.ts → professorBrewShouldContinueAutoBuildV47",
    legacyRead: "structuralBuildTelemetryV4165.termination.shouldTerminate",
    priorEffect: "Blocked first ADVANCE_TREE after creative-pass recomputes",
    replacementV4166Source: "ProfessorBuildControlV41661.shouldContinueNormalAssembly",
    status: "REMOVED",
  },
  {
    callSite: "professor-brew-progress-v4-7-v1.ts → professorBrewNeedsStructuralResearchV4166",
    legacyRead: "shouldRunStructuralResearchV4165 (wrapper)",
    priorEffect: "Could inherit v4165 termination disable",
    replacementV4166Source: "ProfessorBuildControlV41661.shouldRunStructuralResearch",
    status: "FIXED",
  },
  {
    callSite: "professor-structural-build-telemetry-v4-16-5-v1.ts → shouldRunStructuralResearchV4165",
    legacyRead: "telemetry.termination.shouldTerminate",
    priorEffect: "Disabled structural research on legacy no-op",
    replacementV4166Source: "shouldRunStructuralResearchV4166 / build control",
    status: "TELEMETRY_ONLY",
  },
  {
    callSite: "professor-council-assembly-v4-7-v1.ts → structuralBuildTelemetryV4165",
    legacyRead: "updateStructuralBuildTelemetryV4165 termination",
    priorEffect: "Migration comparison artifact only",
    replacementV4166Source: "structuralBuildTelemetryV4166 + professorBuildControlV41661",
    status: "TELEMETRY_ONLY",
  },
  {
    callSite: "professor-council-assembly-v4-7-v1.ts → buildPhase",
    legacyRead: "structuralBuildPhaseForTelemetryV4165",
    priorEffect: "Previously could set BUILD_FAILED from v4165",
    replacementV4166Source: "structuralBuildPhaseForTelemetryV4166",
    status: "REMOVED",
  },
];

function observeLegacyFlags(args: {
  telemetryV4165?: { termination?: { shouldTerminate?: boolean } | null } | null;
  telemetryV4164?: { buildCandidateDiscoveryExhausted?: boolean } | null;
}): string[] {
  const flags: string[] = [];
  if (args.telemetryV4165?.termination?.shouldTerminate) {
    flags.push("v4165.termination.shouldTerminate");
  }
  if (args.telemetryV4164?.buildCandidateDiscoveryExhausted) {
    flags.push("v4164.buildCandidateDiscoveryExhausted");
  }
  return flags;
}

function resolveAction(telemetry: BuildControlTelemetryV4166 | null | undefined): BuildControlActionV41661 {
  return telemetry?.completionPlan?.action ?? "CONTINUE_NORMAL_ASSEMBLY";
}

function resolvePhase(telemetry: BuildControlTelemetryV4166 | null | undefined): BuildPhaseV4166 {
  return telemetry?.buildPhase ?? "EARLY_ASSEMBLY";
}

export function resolveProfessorBuildControlV41661(args: {
  libraryCount: number;
  structurallyComplete: boolean;
  structuralTarget: number;
  landCount: number;
  finalReportStatus?: "COMPLETE" | "RUNNING" | null;
  buildPhase?: string | null;
  telemetryV4166?: BuildControlTelemetryV4166 | null;
  telemetryV4165?: { termination?: { shouldTerminate?: boolean } | null } | null;
  telemetryV4164?: { buildCandidateDiscoveryExhausted?: boolean } | null;
}): ProfessorBuildControlV41661 {
  const telemetry = args.telemetryV4166;
  const phase = resolvePhase(telemetry);
  const action = resolveAction(telemetry);
  const legacyFlagsObserved = observeLegacyFlags({
    telemetryV4165: args.telemetryV4165,
    telemetryV4164: args.telemetryV4164,
  });
  const v4166ShouldTerminate = telemetry?.termination?.shouldTerminate === true;
  const legacyTerminationIgnored =
    legacyFlagsObserved.includes("v4165.termination.shouldTerminate") &&
    !v4166ShouldTerminate &&
    (phase === "EARLY_ASSEMBLY" || phase === "NORMAL_ASSEMBLY");

  if (args.finalReportStatus === "COMPLETE" || args.finalReportStatus === "RUNNING") {
    return {
      version: PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION,
      authoritativeVersion: PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION,
      phase,
      action,
      shouldContinueNormalAssembly: false,
      shouldRunStructuralResearch: false,
      shouldRunMana: false,
      shouldTerminate: false,
      terminalState: null,
      reason: "Final report in progress or complete",
      legacyFlagsObserved,
      legacyTerminationIgnored,
    };
  }

  if (v4166ShouldTerminate || phase === "BUILD_FAILED_CANDIDATE_EXHAUSTION") {
    return {
      version: PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION,
      authoritativeVersion: PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION,
      phase: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
      action: "TERMINATE_EXHAUSTED",
      shouldContinueNormalAssembly: false,
      shouldRunStructuralResearch: false,
      shouldRunMana: false,
      shouldTerminate: true,
      terminalState: "BUILD_FAILED_CANDIDATE_EXHAUSTION",
      reason: telemetry?.termination?.reason ?? "v4166 execution-backed exhaustion",
      legacyFlagsObserved,
      legacyTerminationIgnored,
    };
  }

  if (args.libraryCount >= COMMANDER_DECK_LIBRARY_SIZE_V47) {
    return {
      version: PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION,
      authoritativeVersion: PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION,
      phase,
      action,
      shouldContinueNormalAssembly: false,
      shouldRunStructuralResearch: false,
      shouldRunMana: args.structurallyComplete && args.libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47,
      shouldTerminate: false,
      terminalState: null,
      reason: "Library complete",
      legacyFlagsObserved,
      legacyTerminationIgnored,
    };
  }

  let shouldContinueNormalAssembly = false;
  let shouldRunStructuralResearch = false;
  let reason = telemetry?.termination?.reason ?? "Build may continue";

  if (phase === "EARLY_ASSEMBLY" || phase === "NORMAL_ASSEMBLY") {
    shouldContinueNormalAssembly = true;
    shouldRunStructuralResearch = false;
    reason = legacyTerminationIgnored
      ? "EARLY/NORMAL assembly — LEGACY_TERMINATION_IGNORED"
      : "EARLY/NORMAL assembly — continue tree";
  } else if (phase === "STALLED_RECOVERY") {
    shouldRunStructuralResearch = action === "RUN_STRUCTURAL_RESEARCH";
    shouldContinueNormalAssembly =
      action !== "RUN_STRUCTURAL_RESEARCH" && action !== "TERMINATE_EXHAUSTED";
    reason = shouldRunStructuralResearch
      ? "STALLED_RECOVERY — structural research authorized"
      : "STALLED_RECOVERY — continue assembly";
  } else if (phase === "STRUCTURAL_CLOSURE") {
    shouldContinueNormalAssembly = false;
    shouldRunStructuralResearch = action === "RUN_STRUCTURAL_RESEARCH";
    reason = shouldRunStructuralResearch
      ? "STRUCTURAL_CLOSURE — structural search required (ADVANCE_TREE forbidden)"
      : "STRUCTURAL_CLOSURE — awaiting structural dispatch";
  } else if (args.buildPhase === "NEEDS_ATTENTION") {
    shouldContinueNormalAssembly = true;
    reason = "NEEDS_ATTENTION — continue until library complete";
  } else {
    shouldContinueNormalAssembly = true;
    reason = "Default continue until v4166 terminates";
  }

  const structuralTarget = args.structuralTarget;
  const shouldRunMana =
    args.structurallyComplete &&
    args.libraryCount >= structuralTarget &&
    args.libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47 &&
    !(args.libraryCount >= COMMANDER_DECK_LIBRARY_SIZE_V47 && args.landCount >= 33);

  return {
    version: PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION,
    authoritativeVersion: PROFESSOR_BUILD_CONTROL_AUTHORITATIVE_VERSION,
    phase,
    action,
    shouldContinueNormalAssembly,
    shouldRunStructuralResearch,
    shouldRunMana,
    shouldTerminate: false,
    terminalState: null,
    reason,
    legacyFlagsObserved,
    legacyTerminationIgnored,
  };
}

export function resolveProfessorBuildControlFromSessionV41661(session: BrewSessionV42): ProfessorBuildControlV41661 {
  const cs = session.councilState;
  const libraryCount = cs?.selectedCards.length ?? 0;
  const landCount = cs?.selectedCards.filter((c) => c.category === "land").length ?? 0;
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: cs?.manaPlanV416 ?? null,
    selectedCards: cs?.selectedCards ?? [],
  });
  const structuralTarget = resolveStructuralTargetV416(cs?.manaPlanV416);
  return resolveProfessorBuildControlV41661({
    libraryCount,
    landCount,
    structurallyComplete: slotBudget.structurallyComplete,
    structuralTarget,
    finalReportStatus: session.finalReport?.status ?? null,
    buildPhase: cs?.buildPhase ?? null,
    telemetryV4166: cs?.structuralBuildTelemetryV4166 ?? null,
    telemetryV4165: cs?.structuralBuildTelemetryV4165 ?? null,
    telemetryV4164: cs?.structuralBuildTelemetryV4164 ?? null,
  });
}

export function recordBuildControlDecisionV41661(args: {
  control: ProfessorBuildControlV41661;
  iteration: number;
  priorLog?: BuildControlDecisionV41661[];
  maxEntries?: number;
}): BuildControlDecisionV41661[] {
  const entry: BuildControlDecisionV41661 = {
    version: PROFESSOR_BUILD_CONTROL_V4_16_6_1_V1_VERSION,
    iteration: args.iteration,
    phase: args.control.phase,
    requestedAction: args.control.action,
    authoritativeGateVersion: args.control.authoritativeVersion,
    shouldContinue: args.control.shouldContinueNormalAssembly,
    shouldStructuralResearch: args.control.shouldRunStructuralResearch,
    shouldTerminate: args.control.shouldTerminate,
    terminalReason: args.control.shouldTerminate ? args.control.reason : null,
    legacyFlagsObserved: args.control.legacyFlagsObserved,
  };
  const max = args.maxEntries ?? 32;
  return [...(args.priorLog ?? []), entry].slice(-max);
}

/** Dev assertion: legacy v4165 terminate must not block when v4166 says continue in early assembly. */
export function assertLegacyTerminationIgnoredV41661(control: ProfessorBuildControlV41661): void {
  if (
    control.legacyFlagsObserved.includes("v4165.termination.shouldTerminate") &&
    !control.shouldTerminate &&
    control.shouldContinueNormalAssembly &&
    (control.phase === "EARLY_ASSEMBLY" || control.phase === "NORMAL_ASSEMBLY")
  ) {
    if (!control.legacyTerminationIgnored) {
      throw new Error("LEGACY_TERMINATION_IGNORED expected but legacyTerminationIgnored=false");
    }
  }
}
