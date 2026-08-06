import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
  CardEvidenceInput,
} from "./types";
import type { CardFlowV2MarketBundle } from "./market/types";
import type { VisionResult } from "../types";
import {
  isCardFlowV2EvidenceEnabled,
  isCardFlowV2IdentityEnabled,
  isCardFlowV2MarketEnabled,
} from "./feature-flag";
import { runCardEvidenceV2 } from "./run-card-evidence-v2";
import { runCardIdentityV2 } from "./run-card-identity-v2";
import { runCardMarketV2 } from "./market/run-card-market-v2";

export type CardFlowV2Bundle = {
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
};

export type CardFlowV2Input = CardEvidenceInput & {
  visionFallback?: Partial<VisionResult>;
};

export async function runCardFlowV2(
  input: CardFlowV2Input,
): Promise<CardFlowV2Bundle> {
  if (!isCardFlowV2EvidenceEnabled()) {
    return {};
  }

  const evidence = await runCardEvidenceV2(input);
  let identity: CardCandidateBundle | undefined;
  let market: CardFlowV2MarketBundle | undefined;

  if (isCardFlowV2IdentityEnabled()) {
    identity = await runCardIdentityV2({ ...input, evidence });
  }

  if (isCardFlowV2MarketEnabled() && identity) {
    market = await runCardMarketV2({ evidence, identity });
  }

  return { evidence, identity, market };
}
