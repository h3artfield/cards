import type { ModelD2Variant } from "./types";

export type ModelD2FeatureBlock = "IPV2_1_SELF" | "IPV2_1_OPP_MARGINAL" | "IPV2_1_RPS_INTERACTION";

export function featureBlockForModelD2Column(name: string): ModelD2FeatureBlock {
  if (name.startsWith("oppMarg_")) return "IPV2_1_OPP_MARGINAL";
  if (name.startsWith("d2_")) return "IPV2_1_RPS_INTERACTION";
  if (name.startsWith("ipv2_1_")) return "IPV2_1_SELF";
  throw new Error(`Unknown Model D2 new-block column: ${name}`);
}

export function lambdaForModelD2Column(
  name: string,
  lambdas: { lambdaSelf: number; lambdaOpponentMarginal: number; lambdaInteraction: number },
): number {
  const block = featureBlockForModelD2Column(name);
  if (block === "IPV2_1_SELF") return lambdas.lambdaSelf;
  if (block === "IPV2_1_OPP_MARGINAL") return lambdas.lambdaOpponentMarginal;
  return lambdas.lambdaInteraction;
}

export function newBlockColumnNamesForVariant(input: {
  variant: ModelD2Variant;
  selfProfileColumns: string[];
  opponentMarginalColumns: string[];
  interactionColumns: string[];
}): string[] {
  if (input.variant === "P0") return input.selfProfileColumns;
  if (input.variant === "P1") return [...input.selfProfileColumns, ...input.opponentMarginalColumns];
  return [...input.selfProfileColumns, ...input.opponentMarginalColumns, ...input.interactionColumns];
}
