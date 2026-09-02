import { featureBlockForColumn } from "../model-c/feature-matrix-io-v1";
import type { ModelDFeatureBlock } from "./types";

export function featureBlockForModelDColumn(name: string): ModelDFeatureBlock | "CARD_ID" {
  if (name.startsWith("oppctx_")) return "OPPONENT_CONTEXT";
  if (name.startsWith("match_")) return "SEMANTIC_MATCHUP";
  const cBlock = featureBlockForColumn(name);
  if (cBlock === "CARD_ID") return "CARD_ID";
  return "FROZEN_C2";
}
