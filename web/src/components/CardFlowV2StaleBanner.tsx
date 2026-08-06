"use client";

import { detectStaleV2Metadata } from "@/lib/card-flow-v2/version-metadata";
import type { CardFlowV2VersionMetadata } from "@/lib/card-flow-v2/version-metadata";

export function CardFlowV2StaleBanner({
  versionMetadata,
}: {
  versionMetadata?: CardFlowV2VersionMetadata | null;
}) {
  const stale = detectStaleV2Metadata(versionMetadata);
  if (!stale.stale) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">{stale.message}</p>
      {stale.staleFields.length > 0 && (
        <p className="mt-1 text-xs">
          Stale policy fields: {stale.staleFields.join(", ")}
        </p>
      )}
    </div>
  );
}
