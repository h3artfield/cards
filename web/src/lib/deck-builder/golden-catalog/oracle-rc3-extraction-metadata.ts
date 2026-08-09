/**
 * RC3 diagnostic metadata on extracted actions — migration tracking.
 */
export type ExtractionSource = "v1_legacy" | "rc3_transform" | "rc3_clause_native";

export type ExecutionContext =
  | "immediate"
  | "granted_ability"
  | "activated_cost"
  | "replacement_event"
  | "replacement_effect";

export interface RC3ActionExtensions {
  extractionSource?: ExtractionSource;
  executionContext?: ExecutionContext;
  grantingClauseId?: string;
  grantedAbilityId?: string;
  grantedTo?: string;
  referentObjectId?: string;
  activatedEffectRegion?: boolean;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
  choiceMutuallyExclusive?: boolean;
}

export type RC3OracleActionV1 = import("./oracle-action-parser-v1").OracleActionV1 & RC3ActionExtensions;

export function tagExtractionSource<T extends RC3ActionExtensions>(
  action: T,
  source: ExtractionSource,
): T {
  return { ...action, extractionSource: action.extractionSource ?? source };
}

export function tagGrantedContext<T extends RC3ActionExtensions>(input: {
  action: T;
  grantingClauseId: string;
  grantedAbilityId: string;
  grantedTo?: string;
}): T {
  return {
    ...input.action,
    extractionSource: input.action.extractionSource ?? "rc3_clause_native",
    executionContext: "granted_ability",
    grantingClauseId: input.grantingClauseId,
    grantedAbilityId: input.grantedAbilityId,
    grantedTo: input.grantedTo,
    abilityOrigin: "granted",
    grantedByAbilityId: input.grantingClauseId,
  };
}

export function tagTokenDefinitionContext<T extends RC3ActionExtensions>(input: {
  action: T;
  grantingClauseId: string;
  grantedAbilityId: string;
  grantedTo?: string;
}): T {
  return {
    ...input.action,
    extractionSource: input.action.extractionSource ?? "rc3_clause_native",
    executionContext: "granted_ability",
    grantingClauseId: input.grantingClauseId,
    grantedAbilityId: input.grantedAbilityId,
    grantedTo: input.grantedTo,
    abilityOrigin: "granted",
    grantedByAbilityId: input.grantingClauseId,
  };
}
