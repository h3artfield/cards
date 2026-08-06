import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
  VariantUncertaintyStatus,
} from "./types";

export type VariantUncertaintyContext = {
  identity?: CardCandidateBundle;
  evidence?: CardFlowV2EvidenceBundle;
};

/** Whether unresolved variant uncertainty should block offer preview. */
export function variantUncertaintyBlocksPreview(
  status: VariantUncertaintyStatus,
): boolean {
  return status === "unresolved" || status === "still_requires_review";
}

export function resolveVariantUncertaintyStatus(
  ctx: VariantUncertaintyContext,
): VariantUncertaintyStatus {
  const identity = ctx.identity;
  if (!identity) return "unresolved";

  if (identity.variantUncertaintyStatus) {
    return identity.variantUncertaintyStatus;
  }

  const staffConfirmed = Boolean(identity.staffSelection?.suspectId);
  if (staffConfirmed) {
    return "resolved_by_staff_confirmation";
  }

  if (identity.lockedIdentity.locked) {
    const hasRisks = (identity.lockedIdentity.unresolvedVariantRisks.length ?? 0) > 0;
    if (
      !hasRisks &&
      identity.lockedIdentity.lockStatus !== "not_locked_variant_uncertainty"
    ) {
      return "resolved_by_vision_lock";
    }
  }

  const locked = identity.lockedIdentity;
  const evidenceUncertain =
    ctx.evidence?.imageEvidence.identificationMode ===
    "continue_with_variant_uncertainty";

  if (
    locked.lockStatus === "not_locked_variant_uncertainty" ||
    (locked.unresolvedVariantRisks.length ?? 0) > 0 ||
    evidenceUncertain
  ) {
    return "unresolved";
  }

  return "resolved_by_vision_lock";
}

/** Apply staff-confirmed variant resolution; preserves historical uncertainty. */
export function applyStaffConfirmedVariantResolution(
  identity: CardCandidateBundle,
  evidence?: CardFlowV2EvidenceBundle,
): CardCandidateBundle {
  if (!identity.staffSelection?.suspectId) return identity;

  const historical: string[] = [
    ...(identity.historicalVariantUncertainty ?? []),
  ];
  for (const r of identity.lockedIdentity.unresolvedVariantRisks) {
    if (!historical.includes(r)) historical.push(r);
  }
  if (
    evidence?.imageEvidence.identificationMode ===
      "continue_with_variant_uncertainty" &&
    !historical.includes("identification_mode: continue_with_variant_uncertainty")
  ) {
    historical.push("identification_mode: continue_with_variant_uncertainty");
  }
  if (
    identity.lockedIdentity.lockStatus === "not_locked_variant_uncertainty" &&
    !historical.includes("lock_status: not_locked_variant_uncertainty")
  ) {
    historical.push("lock_status: not_locked_variant_uncertainty");
  }

  return {
    ...identity,
    variantUncertaintyStatus: "resolved_by_staff_confirmation",
    historicalVariantUncertainty: historical.length ? historical : undefined,
  };
}

export function historicalVariantUncertaintyNote(
  identity?: CardCandidateBundle,
): string | undefined {
  const hist = identity?.historicalVariantUncertainty;
  if (!hist?.length) return undefined;
  return `Historical variant uncertainty (resolved by staff): ${hist.join("; ")}`;
}
