/**
 * Fixed spent 5/5 serialization pilot configuration — immutable commander set.
 * Decision: SERIALIZATION_PILOT_IMPLEMENTATION_AUTHORIZED_NO_COMMANDER_SUBSTITUTION
 */
import { resolve } from "node:path";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const SERIALIZATION_PILOT_V8_CONFIG_VERSION = "phase6a1-serialization-pilot-v8-config-v1";

export const PILOT_SPEC_ARTIFACT = "phase6a1-professor-plan-serialization-pilot-spec-v8.json";
export const PILOT_PASS_ARTIFACT = "phase6a1-professor-plan-serialization-pilot-pass-v1.json";
export const HARMONY_EVIDENCE_ARTIFACT = "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v3.json";
export const CATALOG_VERIFIER_ARTIFACT = "phase6a1-professor-plan-catalog-data-state-verification-v2.json";

export const MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT =
  "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json";
export const OPPORTUNITY_SUPPLEMENT_ARTIFACT = "phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json";
export const OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT = "phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json";

export const MECHANISM_TRUTH_SUPPLEMENT_PATH = resolve(MILESTONES, MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT);
export const OPPORTUNITY_SUPPLEMENT_PATH = resolve(MILESTONES, OPPORTUNITY_SUPPLEMENT_ARTIFACT);
export const OPPORTUNITY_SUPPLEMENT_V2_PATH = resolve(MILESTONES, OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT);
export const PILOT_SPEC_PATH = resolve(MILESTONES, PILOT_SPEC_ARTIFACT);
export const HARMONY_EVIDENCE_PATH = resolve(MILESTONES, HARMONY_EVIDENCE_ARTIFACT);
export const CATALOG_VERIFIER_PATH = resolve(MILESTONES, CATALOG_VERIFIER_ARTIFACT);

export const AMENDED_V8_CASES_DIR = resolve(
  MILESTONES,
  "phase6a1-professor-plan-experiment-v3-amended-v8/cases",
);

export type PilotCommanderSlot = {
  pilotCaseId: string;
  commander: string;
  sourcePool: "dev36-population-v2" | "amendment-v8-professor-population";
  mechanismTruthCaseId: string;
  usesMechanismTruthSupplement: boolean;
  usesOpportunitySupplement: boolean;
};

/** Immutable five spent pilot commanders — do not substitute. */
export const PILOT_COMMANDER_SLOTS: readonly PilotCommanderSlot[] = [
  {
    pilotCaseId: "pilot-dev36-08",
    commander: "Muldrotha, the Gravetide",
    sourcePool: "dev36-population-v2",
    mechanismTruthCaseId: "multi-muldrotha",
    usesMechanismTruthSupplement: true,
    usesOpportunitySupplement: true,
  },
  {
    pilotCaseId: "pilot-dev36-02",
    commander: "Zaxara, the Exemplary",
    sourcePool: "dev36-population-v2",
    mechanismTruthCaseId: "blindv5-52-tokens",
    usesMechanismTruthSupplement: true,
    usesOpportunitySupplement: true,
  },
  {
    pilotCaseId: "pilot-amendment-v8-01",
    commander: "Korvold, Fae-Cursed King",
    sourcePool: "amendment-v8-professor-population",
    mechanismTruthCaseId: "multi-korvold",
    usesMechanismTruthSupplement: false,
    usesOpportunitySupplement: false,
  },
  {
    pilotCaseId: "pilot-amendment-v8-02",
    commander: "Prosper, Tome-Bound",
    sourcePool: "amendment-v8-professor-population",
    mechanismTruthCaseId: "hybrid-prosper",
    usesMechanismTruthSupplement: false,
    usesOpportunitySupplement: false,
  },
  {
    pilotCaseId: "pilot-dev36-13",
    commander: "Omnath, Locus of Rage",
    sourcePool: "dev36-population-v2",
    mechanismTruthCaseId: "single-landfall-omnath",
    usesMechanismTruthSupplement: true,
    usesOpportunitySupplement: true,
  },
] as const;

export const SPENT_PILOT_MECHANISM_TRUTH_CASE_IDS = [
  "multi-muldrotha",
  "blindv5-52-tokens",
  "single-landfall-omnath",
] as const;

export const PILOT_RETRY_LIMITS = {
  UPSTREAM_PROFESSOR_FAILURE: 2,
  VALIDATOR_FAILURE: 2,
} as const;
