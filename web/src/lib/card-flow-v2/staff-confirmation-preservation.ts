import type {
  CardCandidateBundle,
  CardSuspect,
  CatalogSource,
  CardCategory,
  V2StaffSuspectSelection,
} from "./types";
import type { CardFlowV2MarketBundle } from "./market/types";
import {
  applyStaffSuspectSelection,
  getStaffSelectedSuspect,
} from "./staff-suspect-selection";
import {
  promotePreparedSnapshotForStaffConfirmation,
  findSnapshotForSuspect,
} from "./market/promote-staff-confirmed-market";
import { applyStaffConfirmedVariantResolution } from "./variant-uncertainty";
import { isCardFlowV2StaffConfirmationEnabled } from "./feature-flag";

export type StaffConfirmationPreservationStatus =
  | "preserved"
  | "rematched"
  | "stale_needs_review"
  | "cleared_by_staff"
  | "cleared_due_to_image_change"
  | "cleared_due_to_missing_suspect"
  | "not_present";

export type StaffConfirmationPreservationRecord = {
  status: StaffConfirmationPreservationStatus;
  previousSuspectId?: string;
  rematchedSuspectId?: string;
  previousConfirmedAt?: string;
  preservedAt?: string;
  reason?: string;
  warnings: string[];
};

export type StaffConfirmedSuspectFingerprint = {
  category: CardCategory;
  catalogSource?: CatalogSource;
  catalogId?: string;
  canonicalName?: string;
  setCode?: string;
  setName?: string;
  cardNumber?: string;
  collectorNumber?: string;
  finish?: string;
  gradingCompany?: string;
  grade?: string;
  certNumber?: string;
};

export type StaffConfirmationImageRefs = {
  frontImageUrl: string;
  backImageUrl?: string;
};

function norm(s?: string): string {
  return (s ?? "").trim().toLowerCase();
}

/** Normalize finish tokens for rematch comparison. */
export function normalizeFinishForRematch(finish?: string): string {
  const f = norm(finish);
  if (!f) return "";
  if (/reverse.*holo|reverse_holo|reverseholofoil/.test(f)) return "reverse_holo";
  if (/^holofoil$|^holo$/.test(f)) return "holofoil";
  if (/nonfoil|non-foil|^normal$/.test(f)) return "normal";
  if (/foil/.test(f) && !/non/.test(f)) return "foil";
  if (/silver/.test(f)) return "silver";
  return f;
}

export function fingerprintFromSuspect(
  suspect: CardSuspect,
): StaffConfirmedSuspectFingerprint {
  return {
    category: suspect.category,
    catalogSource: suspect.catalogSource,
    catalogId: suspect.catalogId,
    canonicalName: suspect.canonicalName,
    setCode: suspect.setCode,
    setName: suspect.setName,
    cardNumber: suspect.cardNumber,
    collectorNumber: suspect.collectorNumber ?? suspect.cardNumber,
    finish: suspect.finish,
    gradingCompany: suspect.gradingCompany,
    grade: suspect.grade,
  };
}

function fingerprintMatchScore(
  fp: StaffConfirmedSuspectFingerprint,
  suspect: CardSuspect,
): number {
  // Priority 1: exact catalogSource + catalogId + finish
  if (
    fp.catalogSource &&
    fp.catalogId &&
    fp.catalogSource === suspect.catalogSource &&
    norm(fp.catalogId) === norm(suspect.catalogId)
  ) {
    const finishOk =
      !fp.finish ||
      normalizeFinishForRematch(fp.finish) ===
        normalizeFinishForRematch(suspect.finish);
    if (finishOk) return 100;
  }

  // Priority 2: category + name + setCode + collectorNumber + finish
  if (
    fp.category === suspect.category &&
    norm(fp.canonicalName) === norm(suspect.canonicalName) &&
    norm(fp.setCode) === norm(suspect.setCode) &&
    norm(fp.collectorNumber ?? fp.cardNumber) ===
      norm(suspect.collectorNumber ?? suspect.cardNumber)
  ) {
    const finishOk =
      !fp.finish ||
      normalizeFinishForRematch(fp.finish) ===
        normalizeFinishForRematch(suspect.finish);
    if (finishOk) return 90;
  }

  // Priority 3: category + name + setName + cardNumber + finish
  if (
    fp.category === suspect.category &&
    norm(fp.canonicalName) === norm(suspect.canonicalName) &&
    norm(fp.setName) === norm(suspect.setName) &&
    norm(fp.collectorNumber ?? fp.cardNumber) ===
      norm(suspect.collectorNumber ?? suspect.cardNumber)
  ) {
    const finishOk =
      !fp.finish ||
      normalizeFinishForRematch(fp.finish) ===
        normalizeFinishForRematch(suspect.finish);
    if (finishOk) return 80;
  }

  // Priority 4: graded/slab
  if (
    fp.gradingCompany &&
    fp.grade &&
    norm(fp.gradingCompany) === norm(suspect.gradingCompany) &&
    norm(fp.grade) === norm(suspect.grade) &&
    norm(fp.canonicalName) === norm(suspect.canonicalName)
  ) {
    return 85;
  }

  return 0;
}

export function rematchStaffConfirmedSuspect(input: {
  fingerprint: StaffConfirmedSuspectFingerprint;
  suspects: CardSuspect[];
  previousSuspectId?: string;
}): {
  suspect?: CardSuspect;
  matchType: "exact_id" | "fingerprint" | "none" | "ambiguous";
  candidates: CardSuspect[];
} {
  const { suspects, previousSuspectId, fingerprint } = input;

  if (previousSuspectId) {
    const exact = suspects.find((s) => s.suspectId === previousSuspectId);
    if (exact) {
      const score = fingerprintMatchScore(fingerprint, exact);
      if (score >= 80) {
        return { suspect: exact, matchType: "exact_id", candidates: [exact] };
      }
    }
  }

  const scanDerived = suspects.filter(
    (s) => s.catalogSource === "scan_derived_fallback",
  );
  if (
    previousSuspectId?.startsWith("scan_derived:") &&
    scanDerived.length === 1
  ) {
    const only = scanDerived[0]!;
    if (
      norm(only.canonicalName) === norm(fingerprint.canonicalName) &&
      norm(only.collectorNumber ?? only.cardNumber) ===
        norm(fingerprint.collectorNumber ?? fingerprint.cardNumber)
    ) {
      return { suspect: only, matchType: "fingerprint", candidates: [only] };
    }
  }

  const scored = suspects
    .map((s) => ({ suspect: s, score: fingerprintMatchScore(fingerprint, s) }))
    .filter((x) => x.score >= 80)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { matchType: "none", candidates: [] };
  }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return {
      matchType: "ambiguous",
      candidates: scored.map((x) => x.suspect),
    };
  }
  return {
    suspect: scored[0].suspect,
    matchType: "fingerprint",
    candidates: [scored[0].suspect],
  };
}

function imagesChanged(
  before?: StaffConfirmationImageRefs,
  after?: StaffConfirmationImageRefs,
): boolean {
  if (!before || !after) return false;
  return (
    norm(before.frontImageUrl) !== norm(after.frontImageUrl) ||
    norm(before.backImageUrl ?? "") !== norm(after.backImageUrl ?? "")
  );
}

export type StaffConfirmationPreservationInput = {
  previousIdentity?: CardCandidateBundle;
  previousMarket?: CardFlowV2MarketBundle;
  imageRefs: StaffConfirmationImageRefs;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  /** When true, skip preservation (staff explicitly cleared). */
  skipPreservation?: boolean;
};

export type StaffConfirmationPreservationResult = {
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  preservation: StaffConfirmationPreservationRecord;
};

export function applyStaffConfirmationPreservation(
  input: StaffConfirmationPreservationInput,
): Promise<StaffConfirmationPreservationResult> {
  return Promise.resolve(applyStaffConfirmationPreservationSync(input));
}

function applyStaffConfirmationPreservationSync(
  input: StaffConfirmationPreservationInput,
): StaffConfirmationPreservationResult {
  const now = new Date().toISOString();
  const notPresent: StaffConfirmationPreservationRecord = {
    status: "not_present",
    warnings: [],
    preservedAt: now,
  };

  if (
    input.skipPreservation ||
    !isCardFlowV2StaffConfirmationEnabled() ||
    !input.identity
  ) {
    return {
      identity: input.identity,
      market: input.market,
      preservation: notPresent,
    };
  }

  const prevSelection = input.previousIdentity?.staffSelection;
  if (!prevSelection?.suspectId) {
    return {
      identity: input.identity,
      market: input.market,
      preservation: notPresent,
    };
  }

  const prevSuspect =
    getStaffSelectedSuspect(input.previousIdentity!) ??
    input.previousIdentity!.suspects.find(
      (s) => s.suspectId === prevSelection.suspectId,
    );

  const fingerprint =
    prevSelection.fingerprint ??
    (prevSuspect ? fingerprintFromSuspect(prevSuspect) : undefined);

  if (!fingerprint) {
    return {
      identity: {
        ...input.identity,
        staffConfirmationPreservation: {
          status: "cleared_due_to_missing_suspect",
          previousSuspectId: prevSelection.suspectId,
          previousConfirmedAt: prevSelection.confirmedAt,
          preservedAt: now,
          reason: "Previous confirmed suspect fingerprint unavailable.",
          warnings: ["Could not rebuild fingerprint for staff confirmation."],
        },
      },
      market: input.market,
      preservation: {
        status: "cleared_due_to_missing_suspect",
        previousSuspectId: prevSelection.suspectId,
        previousConfirmedAt: prevSelection.confirmedAt,
        preservedAt: now,
        reason: "Previous confirmed suspect fingerprint unavailable.",
        warnings: [],
      },
    };
  }

  const prevImages = prevSelection.confirmedImageUrls
    ? {
        frontImageUrl: prevSelection.confirmedImageUrls.front,
        backImageUrl: prevSelection.confirmedImageUrls.back,
      }
    : undefined;

  if (imagesChanged(prevImages, input.imageRefs)) {
    const staleIdentity: CardCandidateBundle = {
      ...input.identity,
      staffSelection: {
        ...prevSelection,
        suspectId: prevSelection.suspectId,
        notes: prevSelection.notes,
        confirmedAt: prevSelection.confirmedAt,
        confirmedBy: prevSelection.confirmedBy,
        fingerprint,
        confirmedImageUrls: prevSelection.confirmedImageUrls,
      },
      staffConfirmationPreservation: {
        status: "stale_needs_review",
        previousSuspectId: prevSelection.suspectId,
        previousConfirmedAt: prevSelection.confirmedAt,
        preservedAt: now,
        reason: "Card images changed since staff confirmation.",
        warnings: [
          "Staff confirmation preserved as stale — images changed; review before trusting.",
        ],
      },
    };
    return {
      identity: staleIdentity,
      market: input.market,
      preservation: staleIdentity.staffConfirmationPreservation!,
    };
  }

  const rematch = rematchStaffConfirmedSuspect({
    fingerprint,
    suspects: input.identity.suspects,
    previousSuspectId: prevSelection.suspectId,
  });

  if (rematch.matchType === "ambiguous") {
    const staleIdentity: CardCandidateBundle = {
      ...input.identity,
      staffSelection: {
        ...prevSelection,
        fingerprint,
      },
      staffConfirmationPreservation: {
        status: "stale_needs_review",
        previousSuspectId: prevSelection.suspectId,
        previousConfirmedAt: prevSelection.confirmedAt,
        preservedAt: now,
        reason: "Multiple suspects match the staff-confirmed identity.",
        warnings: rematch.candidates.map((c) => c.label),
      },
    };
    return {
      identity: staleIdentity,
      market: input.market,
      preservation: staleIdentity.staffConfirmationPreservation!,
    };
  }

  if (!rematch.suspect) {
    const staleIdentity: CardCandidateBundle = {
      ...input.identity,
      staffSelection: {
        ...prevSelection,
        fingerprint,
      },
      staffConfirmationPreservation: {
        status: "stale_needs_review",
        previousSuspectId: prevSelection.suspectId,
        previousConfirmedAt: prevSelection.confirmedAt,
        preservedAt: now,
        reason: "Confirmed suspect no longer in candidate list.",
        warnings: [
          `Previously confirmed: ${prevSelection.suspectId}`,
          "No safe rematch found — staff should re-confirm.",
        ],
      },
    };
    return {
      identity: staleIdentity,
      market: input.market,
      preservation: staleIdentity.staffConfirmationPreservation!,
    };
  }

  // Conflicting variant: confirmed reverse holo but only normal matches with wrong finish
  const confirmedFinish = normalizeFinishForRematch(fingerprint.finish);
  const matchedFinish = normalizeFinishForRematch(rematch.suspect.finish);
  if (
    confirmedFinish &&
    matchedFinish &&
    confirmedFinish !== matchedFinish &&
    rematch.matchType !== "exact_id"
  ) {
    const staleIdentity: CardCandidateBundle = {
      ...input.identity,
      staffSelection: {
        ...prevSelection,
        fingerprint,
      },
      staffConfirmationPreservation: {
        status: "stale_needs_review",
        previousSuspectId: prevSelection.suspectId,
        rematchedSuspectId: rematch.suspect.suspectId,
        previousConfirmedAt: prevSelection.confirmedAt,
        preservedAt: now,
        reason: `Finish mismatch: confirmed ${fingerprint.finish}, closest match ${rematch.suspect.finish}.`,
        warnings: ["Will not auto-switch variant (e.g. reverse holo → normal)."],
      },
    };
    return {
      identity: staleIdentity,
      market: input.market,
      preservation: staleIdentity.staffConfirmationPreservation!,
    };
  }

  let identity = applyStaffSuspectSelection(input.identity, {
    suspectId: rematch.suspect.suspectId,
    confirmedBy: prevSelection.confirmedBy,
    notes: prevSelection.notes,
  });

  identity = {
    ...identity,
    staffSelection: {
      ...identity.staffSelection!,
      confirmedAt: prevSelection.confirmedAt,
      fingerprint,
      confirmedImageUrls: prevSelection.confirmedImageUrls ?? {
        front: input.imageRefs.frontImageUrl,
        back: input.imageRefs.backImageUrl,
      },
    },
  };

  const preservationStatus: StaffConfirmationPreservationStatus =
    rematch.suspect.suspectId === prevSelection.suspectId
      ? "preserved"
      : "rematched";

  const preservation: StaffConfirmationPreservationRecord = {
    status: preservationStatus,
    previousSuspectId: prevSelection.suspectId,
    rematchedSuspectId: rematch.suspect.suspectId,
    previousConfirmedAt: prevSelection.confirmedAt,
    preservedAt: now,
    reason:
      preservationStatus === "rematched"
        ? `Rematched by stable identity fields (${rematch.matchType}).`
        : "Staff confirmation preserved across reprocess.",
    warnings: [],
  };

  identity = { ...identity, staffConfirmationPreservation: preservation };

  if (identity.staffSelection?.suspectId) {
    identity = applyStaffConfirmedVariantResolution(identity);
  }

  let market = input.market;
  if (market) {
    const snapshot = findSnapshotForSuspect(market, rematch.suspect.suspectId);
    if (snapshot) {
      const promoted = promotePreparedSnapshotForStaffConfirmation({
        market,
        suspect: rematch.suspect,
        confirmedBy: prevSelection.confirmedBy,
      });
      if (promoted) market = promoted.market;
    }
  }

  return { identity, market, preservation };
}

export function enrichStaffSelectionWithFingerprint(
  identity: CardCandidateBundle,
  imageRefs: StaffConfirmationImageRefs,
): CardCandidateBundle {
  const sel = identity.staffSelection;
  if (!sel) return identity;
  const suspect = getStaffSelectedSuspect(identity);
  if (!suspect) return identity;
  return {
    ...identity,
    staffSelection: {
      ...sel,
      fingerprint: sel.fingerprint ?? fingerprintFromSuspect(suspect),
      confirmedImageUrls: sel.confirmedImageUrls ?? {
        front: imageRefs.frontImageUrl,
        back: imageRefs.backImageUrl,
      },
    },
  };
}

export function markStaffConfirmationCleared(
  identity: CardCandidateBundle,
  reason: StaffConfirmationPreservationStatus,
  detail?: string,
): CardCandidateBundle {
  const prev = identity.staffSelection;
  const { staffSelection: _, staffConfirmationPreservation: __, ...rest } =
    identity;
  return {
    ...rest,
    staffConfirmationPreservation: {
      status: reason,
      previousSuspectId: prev?.suspectId,
      previousConfirmedAt: prev?.confirmedAt,
      preservedAt: new Date().toISOString(),
      reason: detail,
      warnings: [],
    },
  };
}
