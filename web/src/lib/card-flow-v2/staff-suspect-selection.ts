import type { CardFlowV2MarketBundle, CandidateMarketSnapshot } from "./market/types";
import type {
  CardCandidateBundle,
  CardSuspect,
  SuspectAssessment,
  V2StaffSuspectSelection,
} from "./types";
import { scanDerivedMetaFromSuspect } from "./pokemon-japanese-fallback";
import {
  referenceImagesFromSuspect,
  referenceSourceLabel,
} from "./suspect-reference-image";
import {
  fingerprintFromSuspect,
  type StaffConfirmationImageRefs,
} from "./staff-confirmation-preservation";
import { applyStaffConfirmedVariantResolution } from "./variant-uncertainty";
import { identityFieldsFromSuspect } from "./knowledge/riftbound";

export type SuspectPickerRow = {
  suspectId: string;
  label: string;
  matchScore: number;
  finish?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  language?: string;
  rarity?: string;
  missingEvidence: string[];
  variantRisks: string[];
  reasoning: string;
  catalogSource: string;
  scryfallUri?: string;
  referenceImageUrl?: string;
  referenceImageBackUrl?: string;
  referenceImageSource?:
    | "scryfall"
    | "pokemon_tcg"
    | "pricecharting"
    | "tcgplayer"
    | "catalog"
    | "unknown";
  hasReferenceImage: boolean;
  referenceImageSourceLabel?: string;
  marketSnapshot?: CandidateMarketSnapshot;
  /** Riftbound-specific display fields */
  subtitle?: string;
  altArt?: boolean;
  overnumbered?: boolean;
  signatureStatus?: string;
  productUrl?: string;
  /** Scan-derived fallback (Directive 010) */
  scanDerived?: boolean;
  scanDerivedBadge?: string;
  pricingStatusLabel?: string;
  nativeName?: string;
};

/** Staff-facing variant inspection notes (MTG, Pokémon, YGO, Sports, …). */
export function getVariantStaffExplanations(
  identity: CardCandidateBundle,
): string[] {
  const lines: string[] = [];
  lines.push(...getMtgVariantStaffExplanations(identity));
  const poke = identity.pokemonReversePatternInspection;
  if (poke?.attempted) {
    lines.push(
      poke.staffSummary ??
        `Reverse pattern inspection: ${poke.reversePattern} (crop: ${poke.cropQuality}).`,
    );
  }
  const ygo = identity.ygoEditionInspection;
  if (ygo?.attempted) {
    lines.push(
      ygo.staffSummary ??
        `Edition inspection: ${ygo.edition} (crop: ${ygo.cropQuality}).`,
    );
  }
  const sports = identity.sportsPrizmStampInspection;
  if (sports?.attempted) {
    lines.push(
      sports.staffSummary ??
        `Prizm stamp inspection: ${sports.prizmStampVisible} (crop: ${sports.cropQuality}).`,
    );
  }
  return lines;
}

/** MTG-only variant inspection notes. */
export function getMtgVariantStaffExplanations(
  identity: CardCandidateBundle,
): string[] {
  const lines: string[] = [];
  const list = identity.mtgListMarkInspection;
  if (list?.attempted) {
    lines.push(
      list.staffSummary ??
        `List mark inspection: ${list.listMarkVisible} (crop: ${list.cropQuality}).`,
    );
  }
  const foil = identity.mtgFoilWashInspection;
  if (foil?.attempted) {
    lines.push(
      foil.staffSummary ??
        `Foil wash inspection: ${foil.foilWashVisible} (crop: ${foil.cropQuality}).`,
    );
  }
  const frame = identity.mtgFrameTreatmentInspection;
  if (frame?.attempted) {
    lines.push(
      frame.staffSummary ??
        `Frame treatment inspection: ${frame.frameTreatment} (crop: ${frame.cropQuality}).`,
    );
  }
  return lines;
}

/** @deprecated Use getMtgVariantStaffExplanations */
export function getMtgListStaffExplanation(
  identity: CardCandidateBundle,
): string | undefined {
  return getMtgVariantStaffExplanations(identity)[0];
}

export function buildSuspectPickerRows(
  identity: CardCandidateBundle,
  market?: CardFlowV2MarketBundle,
): SuspectPickerRow[] {
  const snapshotBySuspect = new Map<string, CandidateMarketSnapshot>();
  for (const snap of market?.snapshots ?? []) {
    if (snap.suspectId) snapshotBySuspect.set(snap.suspectId, snap);
  }

  const assessmentById = new Map(
    identity.suspectAssessments.map((a) => [a.suspectId, a]),
  );

  const rows = identity.suspects
    .map((suspect) =>
      rowFromSuspect(
        suspect,
        assessmentById.get(suspect.suspectId),
        snapshotBySuspect.get(suspect.suspectId),
      ),
    )
    .sort((a, b) => b.matchScore - a.matchScore);
  return rows;
}

function rowFromSuspect(
  suspect: CardSuspect,
  assessment: SuspectAssessment | undefined,
  marketSnapshot?: CandidateMarketSnapshot,
): SuspectPickerRow {
  const raw = suspect.rawCatalogData as {
    scryfall_uri?: string;
    subtitle?: string;
    productUrl?: string;
    signatureType?: string;
    parsedCollectorNumber?: { hasAltArtSuffix?: boolean; isOvernumbered?: boolean };
  } | undefined;
  const rb =
    suspect.category === "riftbound"
      ? identityFieldsFromSuspect(suspect)
      : undefined;
  const scanMeta = scanDerivedMetaFromSuspect(suspect);
  const pricingLabel =
    scanMeta?.pricingStatus === "tcgplayer_japan_exact"
      ? undefined
      : scanMeta?.pricingStatus === "pricecharting_exact"
      ? undefined
      : scanMeta?.pricingStatus === "manual_price_required"
        ? "Manual review required"
        : scanMeta?.pricingStatus === "market_data_missing"
          ? "Market data missing"
          : undefined;
  const refs = referenceImagesFromSuspect(suspect);
  return {
    suspectId: suspect.suspectId,
    label: suspect.label,
    matchScore: assessment?.matchScore ?? 0,
    finish: suspect.finish,
    setCode: suspect.setCode,
    setName: suspect.setName,
    collectorNumber: suspect.collectorNumber ?? suspect.cardNumber,
    language: suspect.language,
    rarity: suspect.rarity,
    missingEvidence: assessment?.missingEvidence ?? [],
    variantRisks: assessment?.variantRisks ?? [],
    reasoning: assessment?.reasoning ?? "",
    catalogSource: suspect.catalogSource,
    scryfallUri: raw?.scryfall_uri,
    referenceImageUrl: refs.referenceImageUrl,
    referenceImageBackUrl: refs.referenceImageBackUrl,
    referenceImageSource: refs.referenceImageSource,
    hasReferenceImage: refs.hasReferenceImage,
    referenceImageSourceLabel: refs.hasReferenceImage
      ? referenceSourceLabel(refs.referenceImageSource)
      : undefined,
    marketSnapshot,
    subtitle: raw?.subtitle ?? rb?.subtitle,
    altArt: rb?.parsedCollectorNumber?.hasAltArtSuffix,
    overnumbered: rb?.parsedCollectorNumber?.isOvernumbered,
    signatureStatus: rb?.signatureType ?? raw?.signatureType,
    productUrl: raw?.productUrl,
    scanDerived: suspect.catalogSource === "scan_derived_fallback",
    scanDerivedBadge: scanMeta
      ? scanMeta.tcgplayerJapanProduct
        ? "TCGplayer Japan catalog match"
        : scanMeta.pricingStatus === "pricecharting_exact"
          ? "PriceCharting catalog match"
          : refs.hasReferenceImage
            ? "Catalog reference attached"
            : "Generated from scan — catalog not found"
      : undefined,
    pricingStatusLabel: pricingLabel,
    nativeName: scanMeta?.nativeName,
  };
}

export function getStaffSelectedSuspect(
  identity: CardCandidateBundle,
): CardSuspect | undefined {
  const id = identity.staffSelection?.suspectId;
  if (!id) return undefined;
  return identity.suspects.find((s) => s.suspectId === id);
}

export function getStaffSelectedMarketSnapshot(
  identity: CardCandidateBundle,
  market?: CardFlowV2MarketBundle,
): CandidateMarketSnapshot | undefined {
  const id = identity.staffSelection?.suspectId;
  if (!id || !market) return undefined;
  return market.snapshots.find((s) => s.suspectId === id);
}

export type ManualPrintingEntry = {
  name: string;
  setName?: string;
  setCode?: string;
  cardNumber?: string;
  finish?: string;
  language?: string;
  notes?: string;
};

function labelFromManualEntry(entry: ManualPrintingEntry): string {
  const parts = [
    entry.name.trim(),
    entry.setCode?.trim() || entry.setName?.trim(),
    entry.cardNumber?.trim() ? `#${entry.cardNumber.trim()}` : undefined,
    entry.finish?.replace(/_/g, " "),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function appendManualSuspect(
  identity: CardCandidateBundle,
  entry: ManualPrintingEntry,
): { identity: CardCandidateBundle; suspectId: string } {
  const name = entry.name.trim();
  if (!name) {
    throw new Error("Card name is required for manual entry");
  }

  const suspectId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const category = identity.category ?? identity.lockedIdentity.category;
  const label = labelFromManualEntry(entry);

  const suspect: CardSuspect = {
    suspectId,
    category,
    label,
    canonicalName: name,
    catalogSource: "unknown",
    setName: entry.setName?.trim() || undefined,
    setCode: entry.setCode?.trim()?.toUpperCase() || undefined,
    cardNumber: entry.cardNumber?.trim() || undefined,
    collectorNumber: entry.cardNumber?.trim() || undefined,
    finish: entry.finish?.trim() || undefined,
    language: entry.language?.trim() || "en",
    variantTags: [],
    expectedEvidence: [],
  };

  const assessment: SuspectAssessment = {
    suspectId,
    matchScore: 0,
    canConfirm: true,
    canEliminate: false,
    supportingEvidence: ["staff_manual_entry"],
    contradictingEvidence: [],
    missingEvidence: [],
    variantRisks: [],
    reasoning: "Staff entered printing details manually.",
  };

  return {
    suspectId,
    identity: {
      ...identity,
      suspects: [...identity.suspects, suspect],
      suspectAssessments: [...identity.suspectAssessments, assessment],
    },
  };
}

export function applyManualStaffPrintingEntry(
  identity: CardCandidateBundle,
  input: ManualPrintingEntry & {
    confirmedBy?: string;
    imageRefs?: StaffConfirmationImageRefs;
  },
): CardCandidateBundle {
  const { identity: withSuspect, suspectId } = appendManualSuspect(identity, input);
  const noteParts = [input.notes?.trim(), "Manual printing entry"].filter(Boolean);
  return applyStaffSuspectSelection(withSuspect, {
    suspectId,
    confirmedBy: input.confirmedBy,
    notes: noteParts.join(" — "),
    imageRefs: input.imageRefs,
  });
}

export function applyStaffSuspectSelection(
  identity: CardCandidateBundle,
  input: {
    suspectId: string;
    confirmedBy?: string;
    notes?: string;
    imageRefs?: StaffConfirmationImageRefs;
  },
): CardCandidateBundle {
  const suspect = identity.suspects.find((s) => s.suspectId === input.suspectId);
  if (!suspect) {
    throw new Error(`Unknown suspectId: ${input.suspectId}`);
  }

  const staffSelection: V2StaffSuspectSelection = {
    suspectId: input.suspectId,
    confirmedAt: new Date().toISOString(),
    confirmedBy: input.confirmedBy,
    notes: input.notes?.trim() || undefined,
    fingerprint: fingerprintFromSuspect(suspect),
    confirmedImageUrls: input.imageRefs
      ? {
          front: input.imageRefs.frontImageUrl,
          back: input.imageRefs.backImageUrl,
        }
      : undefined,
  };

  return applyStaffConfirmedVariantResolution({
    ...identity,
    staffSelection,
  });
}

export function clearStaffSuspectSelection(
  identity: CardCandidateBundle,
): CardCandidateBundle {
  const { staffSelection: _, staffConfirmationPreservation: __, ...rest } =
    identity;
  return rest;
}
