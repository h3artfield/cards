import type { CardSuspect, ImageEvidenceReport, SuspectAssessment } from "./types";
import {
  getRiftboundLockBlockers,
  identityFieldsFromSuspect,
  inferRiftboundSignatureType,
} from "./knowledge/riftbound";
import { getSlotValue } from "./evidence-utils";

export function augmentRiftboundSuspectAssessments(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  imageEvidence: ImageEvidenceReport,
): SuspectAssessment[] {
  const competing = suspects.map((s) => identityFieldsFromSuspect(s));
  const signatureVisible =
    getSlotValue(imageEvidence, "riftbound_signature_visible") === "true" ||
    getSlotValue(imageEvidence, "riftbound_signature_visible") === "yes";

  return assessments.map((a) => {
    const suspect = suspects.find((s) => s.suspectId === a.suspectId);
    if (!suspect) return a;

    const identity = identityFieldsFromSuspect(suspect);
    const blockers = getRiftboundLockBlockers({
      identity,
      competingSuspects: competing.filter((c) => c.name === identity.name),
    });

    const variantRisks = [...a.variantRisks];
    for (const b of blockers) {
      if (b.includes("signature")) {
        variantRisks.push("Riftbound signature status uncertain or competing");
      }
      if (b.includes("overnumbered")) {
        variantRisks.push("Riftbound overnumbered variant — do not mix with base comps");
      }
      if (b.includes("alt_art")) {
        variantRisks.push("Riftbound alternate art — do not mix with base comps");
      }
      if (b.includes("ultimate")) {
        variantRisks.push("Ultimate rarity — staff review required");
      }
    }

    if (
      signatureVisible &&
      identity.signatureType === "none" &&
      suspect.variantTags.includes("overnumbered")
    ) {
      variantRisks.push(
        "Visible signature on non-signature overnumbered suspect — verify official vs aftermarket",
      );
    }

    let matchScore = a.matchScore;
    if (blockers.includes("ultimate_requires_staff_review")) {
      matchScore = Math.min(matchScore, 0.84);
    }
    if (blockers.includes("signature_status_uncertain")) {
      matchScore = Math.min(matchScore, 0.8);
    }

    const canConfirm =
      a.canConfirm &&
      blockers.length === 0 &&
      !variantRisks.some((r) => r.includes("Ultimate") || r.includes("signature"));

    return {
      ...a,
      matchScore,
      canConfirm,
      variantRisks: [...new Set(variantRisks)].slice(0, 6),
      reasoning:
        blockers.length > 0
          ? `${a.reasoning} Riftbound blockers: ${blockers.join(", ")}.`
          : a.reasoning,
    };
  });
}

export function applyRiftboundIdentityLockAdjustments(
  locked: import("./types").LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
): import("./types").LockedCardIdentity {
  const top = assessments[0];
  const topSuspect = suspects.find((s) => s.suspectId === top?.suspectId);
  if (!topSuspect) return locked;

  const identity = identityFieldsFromSuspect(topSuspect);
  const blockers = getRiftboundLockBlockers({
    identity,
    competingSuspects: suspects.map((s) => identityFieldsFromSuspect(s)),
  });

  if (!blockers.length) return locked;

  const variantRisks = [
    ...new Set([...locked.unresolvedVariantRisks, ...blockers]),
  ].slice(0, 8);

  let lockStatus = locked.lockStatus;
  let lockedFlag = locked.locked;

  if (
    blockers.some((b) =>
      [
        "signature_status_uncertain",
        "signature_variant_competes",
        "alt_art_suffix_without_variant_confirmation",
        "overnumbered_without_variant_confirmation",
      ].includes(b),
    )
  ) {
    lockStatus = "not_locked_variant_uncertainty";
    lockedFlag = false;
  } else if (blockers.includes("ultimate_requires_staff_review")) {
    lockStatus = "manual_review_recommended";
    lockedFlag = false;
  } else if (blockers.includes("aftermarket_autograph_requires_manual_review")) {
    lockStatus = "manual_review_recommended";
    lockedFlag = false;
  }

  return {
    ...locked,
    locked: lockedFlag,
    lockStatus,
    unresolvedVariantRisks: variantRisks,
    staffMessage: locked.staffMessage + `\n\nRiftbound: ${blockers.join("; ")}`,
  };
}
