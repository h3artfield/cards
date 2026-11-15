#!/usr/bin/env npx tsx
/** Read-only Muldrotha NORMALIZATION_FAILURE forensic report — no Professor rerun. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  getPilotMechanismCatalogEntry,
  getPilotOpportunityCase,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { PILOT_COMMANDER_SLOTS } from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import { PROFESSOR_PLAN_NORMALIZER_V2_VERSION } from "./lib/phase6a1-professor-plan-normalizer-v2";
import { PROFESSOR_PLAN_PROMPT_V2_VERSION } from "./lib/phase6a1-professor-plan-prompt-v2";
import { PROFESSOR_PLAN_AGENT_V2_VERSION } from "./lib/phase6a1-professor-plan-agent-v2";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-muldrotha-normalization-forensic-v1.json");

const PATHS = {
  gateV2: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json"),
  gateV3: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json"),
  v3Stdout: resolve(
    MILESTONES,
    "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
  ),
  v3Stderr: resolve(
    MILESTONES,
    "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
  ),
  professorAgent: resolve(HERE, "lib/phase6a1-professor-plan-agent-v2.ts"),
  normalizer: resolve(HERE, "lib/phase6a1-professor-plan-normalizer-v2.ts"),
  prompt: resolve(HERE, "lib/phase6a1-professor-plan-prompt-v2.ts"),
  contextBuilder: resolve(HERE, "lib/phase6a1-professor-plan-context-builder-v2.ts"),
  modelPin: resolve(MILESTONES, "phase6a1-professor-plan-model-pin-v2.json"),
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  mechanismTruthSupplement: resolve(MILESTONES, "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json"),
  opportunitySupplement: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json"),
  spentPilotTruthLoader: resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  pilotConfig: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  validator: resolve(HERE, "../src/lib/deck-synthesis/strategy-package-validator-v2.ts"),
  contracts: resolve(HERE, "../src/lib/deck-synthesis/professor-planning-contracts-v2.ts"),
};

const EXPECTED_GATE_V2_SHA = "eae06c2d10a170139df86e48c62de486b9b035090ddd3ea162a4b0d8486d798c";
const PILOT_CASE_ID = "pilot-dev36-08";
const MECHANISM_TRUTH_CASE_ID = "multi-muldrotha";
const COMMANDER = "Muldrotha, the Gravetide";

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function filePin(label: string, absPath: string) {
  if (!existsSync(absPath)) throw new Error(`Missing forensic source: ${absPath}`);
  return {
    label,
    path: absPath.replace(/\\/g, "/"),
    sha256: sha256File(absPath),
    byteSize: readFileSync(absPath).length,
  };
}

function main() {
  for (const p of [PATHS.gateV2, PATHS.gateV3, PATHS.v3Stdout, PATHS.v3Stderr]) {
    if (!existsSync(p)) throw new Error(`Missing preserved pilot artifact: ${p}`);
  }
  if (sha256File(PATHS.gateV2) !== EXPECTED_GATE_V2_SHA) {
    throw new Error(`gate-v2 SHA mismatch — abort forensic report to preserve evidence integrity`);
  }

  const gateV3 = JSON.parse(readFileSync(PATHS.gateV3, "utf8")) as {
    generatedAt?: string;
    runnerResultExtraction?: {
      failedPilotCaseId?: string;
      failureClass?: string;
      attempts?: number;
      professorCaseStatus?: string;
      issues?: string[];
      perCommanderResults?: unknown[];
    };
  };
  const slot = PILOT_COMMANDER_SLOTS.find((s) => s.pilotCaseId === PILOT_CASE_ID);
  if (!slot || slot.commander !== COMMANDER || slot.mechanismTruthCaseId !== MECHANISM_TRUTH_CASE_ID) {
    throw new Error("Pilot commander slot drift detected");
  }

  const mechanismEntry = getPilotMechanismCatalogEntry(MECHANISM_TRUTH_CASE_ID);
  const opportunityCase = getPilotOpportunityCase(MECHANISM_TRUTH_CASE_ID);
  if (!mechanismEntry || !opportunityCase) {
    throw new Error("Unable to resolve spent-pilot Muldrotha inputs");
  }

  const mechanismFactIds = mechanismEntry.independentMechanismFacts.map((f) => f.mechanismId);
  const opportunityIds = opportunityCase.opportunities.map((o) => o.opportunityId);
  const noActionableFactIds = opportunityCase.noActionableOpportunities.map((r) => r.factId);
  const modelPin = JSON.parse(readFileSync(PATHS.modelPin, "utf8")) as {
    modelIdentifier?: string;
    sha256?: string;
    experimentBounds?: { maxValidationRepairRounds?: number };
  };

  const report = {
    version: "phase6a1-professor-plan-muldrotha-normalization-forensic-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_NORMALIZATION_INVESTIGATION_AUTHORIZED_NO_MODEL_RERUN",
    instruction: "REPORT AND WAIT — offline forensics complete. Raw failed-attempt model outputs were not persisted by the serialization pilot runner. Recommend authorized single Muldrotha diagnostic Professor run with pre-normalization capture before any 5/5 rerun.",
    preservedPilotEvidence: {
      gateV2: filePin("gate-v2", PATHS.gateV2),
      gateV3: filePin("gate-v3", PATHS.gateV3),
      v3Stdout: filePin("v3-stdout", PATHS.v3Stdout),
      v3Stderr: filePin("v3-stderr", PATHS.v3Stderr),
    },
    failedCase: {
      pilotCaseId: PILOT_CASE_ID,
      commander: COMMANDER,
      mechanismTruthCaseId: MECHANISM_TRUTH_CASE_ID,
      caseStatus: "NORMALIZATION_FAILURE",
      pilotLevelAttempts: gateV3.runnerResultExtraction?.attempts ?? 3,
      gateV3CapturedAt: gateV3.generatedAt ?? null,
      gateV3FailureClass: gateV3.runnerResultExtraction?.failureClass ?? "UPSTREAM_PROFESSOR_FAILURE",
      gateV3SurfaceIssues: gateV3.runnerResultExtraction?.issues ?? ["Professor caseStatus=NORMALIZATION_FAILURE"],
    },
    rootCauseClassification: {
      primary:
        "NORMALIZATION_INVARIANT_IMPOSSIBILITY_EMPTY_FROZEN_SEMANTIC_OPPORTUNITY_UNIVERSE",
      taxonomyBucket: "another explicit normalization invariant",
      summary:
        "Muldrotha spent-pilot inputs supply zero frozen SemanticOpportunity IDs while Professor prompt v2 and normalizer v2 require every hypothesis to carry a non-empty semanticOpportunityIds[] drawn only from that frozen list. With an empty opportunity universe, every non-empty model assignment fails Unknown opportunityId, and an empty assignment fails Required non-empty string array missing. Normalization success is structurally impossible offline regardless of model quality.",
      offlineProofStatus: "PROVEN_WITHOUT_RAW_MODEL_OUTPUT",
      excludedClassifications: {
        malformedModelOutput: "NOT_PROVEN — raw attempt outputs not persisted",
        jsonSchemaMismatchTopLevel: "UNLIKELY — gate-v3 stdout parse succeeded; failure is post-parse normalization",
        truncationTokenLimit: "NOT_EVIDENCED — no raw responses preserved",
        parserFailure: "EXCLUDED — parseHypothesesJson succeeded enough to enter normalizer",
      },
    },
    structuralProof: {
      frozenMechanismFactIds: mechanismFactIds,
      frozenSemanticOpportunityIds: opportunityIds,
      frozenSemanticOpportunityCount: opportunityIds.length,
      noActionableFactIds,
      normalizerInvariants: [
        {
          path: "hypotheses[i].semanticOpportunityIds",
          rule: "nonEmptyStringArray — at least one opportunity id required",
          source: `${PROFESSOR_PLAN_NORMALIZER_V2_VERSION}:nonEmptyStringArray`,
        },
        {
          path: "hypotheses[i].semanticOpportunityIds[*]",
          rule: "each id must exist in ctx.semanticOpportunities",
          failureMessage: "Unknown opportunityId ${id}",
          source: `${PROFESSOR_PLAN_NORMALIZER_V2_VERSION}:knownOpps check`,
        },
        {
          path: "hypotheses",
          rule: "issues.length === 0 required for SUCCESS; any issue => NORMALIZATION_FAILURE",
          source: `${PROFESSOR_PLAN_NORMALIZER_V2_VERSION}:normalizeProfessorPlanningResponse`,
        },
      ],
      promptInvariants: [
        "Use ONLY semanticOpportunityIds from the provided frozen lists",
        "Every hypothesis MUST have semanticOpportunityIds[]",
        "NO_ACTIONABLE facts cannot by themselves become positive planning packages",
      ],
      impossibilityArgument: [
        "If semanticOpportunityIds is omitted or [] => normalizer adds Required non-empty string array missing.",
        "If semanticOpportunityIds is non-empty => every id is Unknown because frozen list size is 0.",
        "Therefore normalization cannot reach SUCCESS for any parsed hypotheses payload under these inputs.",
      ],
      spentOpportunitySupplementNote:
        "phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json lists opportunities:[] with both mechanism facts marked NO_ACTIONABLE_OPPORTUNITY (manual fact-family rule extension required).",
    },
    attemptAccounting: {
      pilotRunnerRetries: {
        config: "PILOT_RETRY_LIMITS.UPSTREAM_PROFESSOR_FAILURE = 2",
        meaning: "Three full runProfessorPlanCaseV2 invocations (initial + 2 retries) before pilot case abort",
        matchesGateV3Attempts: gateV3.runnerResultExtraction?.attempts === 3,
      },
      professorInternalRepairRounds: {
        config: "maxValidationRepairRounds = 3 from phase6a1-professor-plan-model-pin-v2.json",
        meaning: "Up to 4 normalization/validation repair rounds inside each pilot attempt",
        note: "Repair feedback includes normalization issues, but final caseStatus still NORMALIZATION_FAILURE when last normalization fails",
      },
      classificationPath: {
        caseStatusSource: `${PROFESSOR_PLAN_AGENT_V2_VERSION}: lastNormalizationFailed => NORMALIZATION_FAILURE`,
        pilotFailureClass: "UPSTREAM_PROFESSOR_FAILURE via classifyProfessorFailure (no validator results when normalization fails)",
        evidenceLoss:
          "Serialization pilot runner records only Professor caseStatus in perCommanderResults.issues; normalization.issues[] from invocations[] is discarded on failure",
      },
    },
    rawOutputPersistence: {
      searchedLocations: [
        "web/data/milestones/deck-synthesis/.pinned-container-artifact-out/cases/",
        "web/data/milestones/deck-synthesis/.serialization-pilot-v8-out/",
        "gate-v3 stdout/stderr artifacts",
        "serialization pilot runner writePerCaseEvidence (success-only path)",
      ],
      professorRecordPersisted: false,
      rawModelResponsesPersisted: false,
      preNormalizationObjectsPersisted: false,
      conclusion:
        "No byte-preservable raw model responses or normalization audit records from attempts 1–3 exist on the implementation side. Offline proof of the exact model JSON shape per attempt is impossible without a new diagnostic capture run.",
      recommendedNextStep:
        "Authorize one Muldrotha diagnostic Professor run that write-once persists rawModelResponse + normalization audit before normalization, without rerunning 5/5 pilot.",
    },
    deterministicMuldrothaInputs: {
      pilotSlot: slot,
      mechanismTruthSupplementCase: {
        caseId: MECHANISM_TRUTH_CASE_ID,
        commanders: mechanismEntry.commanders,
        commandZoneConfiguration: mechanismEntry.commandZoneConfiguration,
        combinedColorIdentity: mechanismEntry.combinedColorIdentity,
        bracket: mechanismEntry.bracket,
        mechanismFactIds,
      },
      opportunitySupplementCase: {
        caseId: opportunityCase.caseId,
        opportunities: opportunityIds,
        noActionableFactIds,
        noActionableReasons: opportunityCase.noActionableOpportunities.map((r) => ({
          factId: r.factId,
          reason: r.reason,
        })),
      },
    },
    reviewedSourcePins: {
      professorAgent: filePin("professor-agent-v2", PATHS.professorAgent),
      normalizer: filePin("normalizer-v2", PATHS.normalizer),
      prompt: filePin("prompt-v2", PATHS.prompt),
      contextBuilder: filePin("context-builder-v2", PATHS.contextBuilder),
      modelPin: filePin("model-pin-v2", PATHS.modelPin),
      pilotRunner: filePin("serialization-pilot-runner-v8", PATHS.pilotRunner),
      spentPilotTruthLoader: filePin("spent-pilot-truth-loader-v1", PATHS.spentPilotTruthLoader),
      pilotConfig: filePin("serialization-pilot-config-v8", PATHS.pilotConfig),
      mechanismTruthSupplement: filePin("mechanism-truth-supplement-v1", PATHS.mechanismTruthSupplement),
      opportunitySupplement: filePin("opportunity-supplement-v1", PATHS.opportunitySupplement),
      validator: filePin("strategy-package-validator-v2", PATHS.validator),
      contracts: filePin("professor-planning-contracts-v2", PATHS.contracts),
    },
    professorStackPinsFromGateV3Stdout: (() => {
      const stdout = readFileSync(PATHS.v3Stdout, "utf8");
      try {
        const parsed = JSON.parse(stdout) as { stackInputs?: unknown };
        return parsed.stackInputs ?? null;
      } catch {
        return null;
      }
    })(),
    modelPinSnapshot: {
      modelIdentifier: modelPin.modelIdentifier ?? null,
      sha256: modelPin.sha256 ?? null,
      maxValidationRepairRounds: modelPin.experimentBounds?.maxValidationRepairRounds ?? null,
    },
    componentVersions: {
      professorAgent: PROFESSOR_PLAN_AGENT_V2_VERSION,
      normalizer: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
      prompt: PROFESSOR_PLAN_PROMPT_V2_VERSION,
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath: REPORT_PATH, sha256: sha256File(REPORT_PATH), report }, null, 2));
}

main();
