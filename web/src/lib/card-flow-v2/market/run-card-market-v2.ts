import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "../types";
import type { CardFlowV2MarketBundle } from "./types";
import {
  buildLockedIdentitySearchPlan,
  buildSuspectSearchPlan,
} from "./search-plan-builder";
import { buildCandidateMarketSnapshot } from "./value-calculator";
import { selectMarketSnapshotSuspects } from "./select-market-snapshot-suspects";
import {
  isCardFlowV2IdentityEnabled,
  getCardFlowV2MarketMaxSuspects,
} from "../feature-flag";

export async function runCardMarketV2(input: {
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
}): Promise<CardFlowV2MarketBundle> {
  const { identity } = input;

  if (!identity) {
    return {
      mode: "no_market_run",
      lockedIdentityStatus: "not_locked_no_candidates",
      snapshots: [],
      recommendedStaffAction:
        "No V2 identity bundle — run evidence + identity phases first.",
      warnings: ["Missing cardFlowV2Identity."],
      createdAt: new Date().toISOString(),
    };
  }

  const locked = identity.lockedIdentity;
  const lockStatus = locked.lockStatus;

  if (locked.locked) {
    const plan = buildLockedIdentitySearchPlan(locked);
    const snapshot = await buildCandidateMarketSnapshot(plan);
    return {
      mode: "locked_identity_market",
      lockedIdentityStatus: lockStatus,
      snapshots: [snapshot],
      recommendedStaffAction: buildLockedStaffAction(snapshot),
      warnings: snapshot.warnings,
      createdAt: new Date().toISOString(),
    };
  }

  const maxSuspects = getCardFlowV2MarketMaxSuspects();
  const picks = selectMarketSnapshotSuspects(identity, maxSuspects);

  if (!picks.length) {
    return {
      mode: "no_market_run",
      lockedIdentityStatus: lockStatus,
      snapshots: [],
      recommendedStaffAction:
        "No identity candidates — cannot build market search plans.",
      warnings: ["No suspects available for candidate market comparison."],
      createdAt: new Date().toISOString(),
    };
  }

  const snapshots = await Promise.all(
    picks.map(async ({ suspect, reason }) => {
      const snap = await buildCandidateMarketSnapshot(
        buildSuspectSearchPlan(suspect),
      );
      return { ...snap, marketSnapshotReason: reason };
    }),
  );

  return {
    mode: "candidate_market_comparison",
    lockedIdentityStatus: lockStatus,
    identitySource: "candidate",
    snapshots,
    recommendedStaffAction: buildCandidateStaffAction(snapshots, locked.staffMessage),
    warnings: [
      "Identity not locked — separate candidate market snapshots returned.",
      ...snapshots.flatMap((s) => s.warnings),
    ],
    createdAt: new Date().toISOString(),
  };
}

function buildLockedStaffAction(
  snapshot: Awaited<ReturnType<typeof buildCandidateMarketSnapshot>>,
): string {
  const lines = [
    "V2 Market: Locked Identity Market",
    `Card: ${snapshot.marketProductName}`,
    `Confidence: ${snapshot.confidence}`,
    `Accepted sold comps: ${snapshot.acceptedComps.filter((a) => a.comp.source === "ebay_sold").length}`,
    `Rejected comps: ${snapshot.rejectedComps.length}`,
  ];
  if (snapshot.valueMedian != null) {
    lines.push(
      `Shadow value: $${snapshot.valueLow?.toFixed(0) ?? "?"}–$${snapshot.valueHigh?.toFixed(0) ?? "?"}`,
    );
  }
  return lines.join("\n");
}

function buildCandidateStaffAction(
  snapshots: Awaited<ReturnType<typeof buildCandidateMarketSnapshot>>[],
  identityMessage: string,
): string {
  const lines = [
    "V2 Market: Candidate Comparison",
    identityMessage.split("\n")[0] ?? "Identity not locked.",
    "",
    "Candidate values:",
  ];

  snapshots.forEach((s, i) => {
    const range =
      s.valueMedian != null
        ? `$${s.valueLow?.toFixed(0) ?? "?"}–$${s.valueHigh?.toFixed(0) ?? "?"}`
        : (s.marketOutcome?.summaryLabel ??
          "No accepted sold comps — see source health");
    lines.push(`${i + 1}. ${s.marketProductName}: ${range}`);
  });

  lines.push("", "Staff action:", "Confirm exact variant/parallel before offer.");
  return lines.join("\n");
}

export function canRunCardMarketV2(): boolean {
  return isCardFlowV2IdentityEnabled();
}
