import type { CardFlowV2AuditRecord } from "./audit/types";
import type { CardFlowV2MarketBundle } from "./market/types";
import type { V2OfferPreview } from "./offer/types";
import type {
  CardCandidateBundle,
  CardCategory,
  CardFlowV2EvidenceBundle,
} from "./types";

export type CardFlowV2VersionMetadata = {
  cardFlowV2Version: string;
  directiveVersion: string;
  evidencePolicyVersion: string;
  identityPolicyVersion: string;
  marketPolicyVersion: string;
  offerPreviewPolicyVersion: string;
  auditPolicyVersion: string;
  knowledgeVersions: Record<string, string>;
  catalogAdapterVersions: Record<string, string>;
  generatedAt: string;
};

/** Current build policy versions — bump when behavior changes materially. */
export const CURRENT_V2_POLICY: Omit<CardFlowV2VersionMetadata, "generatedAt"> = {
  cardFlowV2Version: "006M",
  directiveVersion: "006M",
  evidencePolicyVersion: "006B-evidence",
  identityPolicyVersion: "006B-identity",
  marketPolicyVersion: "006K-pricecharting-identity-enforcement",
  offerPreviewPolicyVersion: "006J-pricing-readiness",
  auditPolicyVersion: "006L-pricing-safety",
  knowledgeVersions: {
    mtg: "006B-mtg-knowledge",
    pokemon: "006B-pokemon-knowledge",
    yugioh: "006B-ygo-knowledge",
    sports: "006B-sports-knowledge",
    riftbound: "006G-riftbound-knowledge",
  },
  catalogAdapterVersions: {
    scryfall: "1",
    pokemon_tcg: "1",
    ygoprodeck: "1",
    riftbound_official: "1",
    pricecharting: "006K",
  },
};

const STALE_POLICY_KEYS = [
  "identityPolicyVersion",
  "marketPolicyVersion",
  "offerPreviewPolicyVersion",
  "auditPolicyVersion",
] as const;

function categoryKnowledgeKey(category?: string): string | undefined {
  if (!category) return undefined;
  const c = category.toLowerCase();
  if (c === "magic") return "mtg";
  if (c in CURRENT_V2_POLICY.knowledgeVersions) return c;
  return undefined;
}

export function buildCardFlowV2VersionMetadata(
  category?: CardCategory | string,
): CardFlowV2VersionMetadata {
  const key = categoryKnowledgeKey(category);
  const knowledgeVersions = { ...CURRENT_V2_POLICY.knowledgeVersions };
  if (key && !knowledgeVersions[key]) {
    knowledgeVersions[key] = "1";
  }
  return {
    ...CURRENT_V2_POLICY,
    knowledgeVersions,
    generatedAt: new Date().toISOString(),
  };
}

export type StaleV2MetadataResult = {
  stale: boolean;
  staleFields: string[];
  message?: string;
};

export function detectStaleV2Metadata(
  stored?: CardFlowV2VersionMetadata | null,
): StaleV2MetadataResult {
  if (!stored) {
    return {
      stale: true,
      staleFields: ["missing_metadata"],
      message: "V2 result may be stale. Re-run shadow V2 reprocess.",
    };
  }

  const staleFields: string[] = [];
  for (const key of STALE_POLICY_KEYS) {
    if (stored[key] !== CURRENT_V2_POLICY[key]) {
      staleFields.push(key);
    }
  }

  const catKey = Object.keys(stored.knowledgeVersions ?? {}).find(
    (k) =>
      stored.knowledgeVersions[k] !== CURRENT_V2_POLICY.knowledgeVersions[k],
  );
  if (catKey) {
    staleFields.push(`knowledgeVersions.${catKey}`);
  }

  if (staleFields.length === 0) {
    return { stale: false, staleFields: [] };
  }

  return {
    stale: true,
    staleFields,
    message: "V2 result may be stale. Re-run shadow V2 reprocess.",
  };
}

export type V2BundleSet = {
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  audit?: CardFlowV2AuditRecord;
  offerPreview?: V2OfferPreview;
};

export type StampedV2Bundles = V2BundleSet & {
  cardFlowV2VersionMetadata: CardFlowV2VersionMetadata;
};

/** Attach version metadata to each V2 bundle and return top-level metadata. */
export function stampCardFlowV2Bundles(
  bundles: V2BundleSet,
  category?: CardCategory | string,
): StampedV2Bundles {
  const meta = buildCardFlowV2VersionMetadata(
    category ?? bundles.identity?.category ?? bundles.evidence?.categoryClassification.category,
  );

  return {
    cardFlowV2VersionMetadata: meta,
    evidence: bundles.evidence
      ? { ...bundles.evidence, versionMetadata: meta }
      : undefined,
    identity: bundles.identity
      ? { ...bundles.identity, versionMetadata: meta }
      : undefined,
    market: bundles.market ? { ...bundles.market, versionMetadata: meta } : undefined,
    audit: bundles.audit ? { ...bundles.audit, versionMetadata: meta } : undefined,
    offerPreview: bundles.offerPreview
      ? { ...bundles.offerPreview, versionMetadata: meta }
      : undefined,
  };
}
