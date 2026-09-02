/**
 * Professor v4 team cost telemetry — expensive vs cheap model and search accounting.
 */
export const PROFESSOR_V4_COST_TELEMETRY_V1_VERSION = "professor-v4-cost-telemetry-v1";

export type ProfessorV4CostTelemetryV1 = {
  version: typeof PROFESSOR_V4_COST_TELEMETRY_V1_VERSION;
  creativePass1Calls: number;
  researchModelCalls: number;
  semanticSearchCalls: number;
  oracleLookups: number;
  ragSearches: number;
  creativePass2Calls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  expensiveModelTokens: number;
  cheapModelTokens: number;
};

export function createEmptyProfessorV4CostTelemetryV1(): ProfessorV4CostTelemetryV1 {
  return {
    version: PROFESSOR_V4_COST_TELEMETRY_V1_VERSION,
    creativePass1Calls: 0,
    researchModelCalls: 0,
    semanticSearchCalls: 0,
    oracleLookups: 0,
    ragSearches: 0,
    creativePass2Calls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    expensiveModelTokens: 0,
    cheapModelTokens: 0,
  };
}

export function mergeProfessorV4CostTelemetryV1(
  base: ProfessorV4CostTelemetryV1,
  delta: Partial<Omit<ProfessorV4CostTelemetryV1, "version">>,
): ProfessorV4CostTelemetryV1 {
  return {
    version: PROFESSOR_V4_COST_TELEMETRY_V1_VERSION,
    creativePass1Calls: base.creativePass1Calls + (delta.creativePass1Calls ?? 0),
    researchModelCalls: base.researchModelCalls + (delta.researchModelCalls ?? 0),
    semanticSearchCalls: base.semanticSearchCalls + (delta.semanticSearchCalls ?? 0),
    oracleLookups: base.oracleLookups + (delta.oracleLookups ?? 0),
    ragSearches: base.ragSearches + (delta.ragSearches ?? 0),
    creativePass2Calls: base.creativePass2Calls + (delta.creativePass2Calls ?? 0),
    totalInputTokens: base.totalInputTokens + (delta.totalInputTokens ?? 0),
    totalOutputTokens: base.totalOutputTokens + (delta.totalOutputTokens ?? 0),
    expensiveModelTokens: base.expensiveModelTokens + (delta.expensiveModelTokens ?? 0),
    cheapModelTokens: base.cheapModelTokens + (delta.cheapModelTokens ?? 0),
  };
}
