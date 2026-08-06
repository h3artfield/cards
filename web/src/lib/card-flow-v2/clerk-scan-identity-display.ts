import { cardDisplayName } from "../processing/card-display-name";
import {
  isNonLatinPokemonName,
  pokemonJapaneseNameToEnglish,
} from "../processing/pokemon-utils";
import type { ScannedCard } from "../types";
import { getSlotValue } from "./evidence-utils";
import {
  extractPokemonScanIdentity,
  isJapanesePokemonEvidence,
  scanDerivedMetaFromSuspect,
} from "./pokemon-japanese-fallback";
import type { ImageEvidenceReport } from "./types";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";

export type ClerkScanIdentityDisplay = {
  primaryName: string;
  secondaryName?: string;
  setLabel?: string;
  setCode?: string;
  collectorNumber?: string;
  language?: string;
  finish?: string;
  fromScan: boolean;
};

function languageLabel(raw?: string | null): string | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "unknown") return undefined;
  if (v === "jp" || v === "ja" || v.includes("japanese")) return "Japanese";
  if (v === "en" || v.includes("english")) return "English";
  return raw?.trim();
}

function nameParts(rawName: string): { primaryName: string; secondaryName?: string } {
  const trimmed = rawName.trim();
  const english = pokemonJapaneseNameToEnglish(trimmed);
  const nativeName =
    isNonLatinPokemonName(trimmed) && english ? trimmed : undefined;
  return {
    primaryName: english ?? trimmed,
    secondaryName: nativeName,
  };
}

function partialFromEvidence(
  imageEvidence: ImageEvidenceReport,
): ClerkScanIdentityDisplay | null {
  const rawName =
    getSlotValue(imageEvidence, "card_name") ??
    getSlotValue(imageEvidence, "name");
  if (!rawName?.trim()) return null;

  const { primaryName, secondaryName } = nameParts(rawName);
  const setName = getSlotValue(imageEvidence, "set_name") ?? undefined;
  const setCode = getSlotValue(imageEvidence, "set_code") ?? undefined;
  const collectorNumber =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number") ??
    undefined;
  const finish =
    getSlotValue(imageEvidence, "foil_pattern") ??
    getSlotValue(imageEvidence, "finish") ??
    undefined;

  if (
    !secondaryName &&
    !setName?.trim() &&
    !setCode?.trim() &&
    !collectorNumber?.trim()
  ) {
    return null;
  }

  return {
    primaryName,
    secondaryName,
    setLabel: setName?.trim(),
    setCode: setCode?.trim()?.toUpperCase(),
    collectorNumber: collectorNumber?.trim(),
    language: languageLabel(getSlotValue(imageEvidence, "language")),
    finish: finish?.trim()?.replace(/_/g, " "),
    fromScan: true,
  };
}

/** Clerk flip-card identity — prefer GPT vision scan evidence before catalog lock. */
export function resolveClerkScanIdentityDisplay(
  card: ScannedCard,
  options?: { preferScan?: boolean },
): ClerkScanIdentityDisplay {
  const evidence = card.cardFlowV2Evidence?.imageEvidence;
  const isJpScan = evidence ? isJapanesePokemonEvidence(evidence) : false;
  const preferScan = isJpScan || (options?.preferScan ?? true);

  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;

  if (preferScan && evidence) {
    const scan = extractPokemonScanIdentity(evidence);
    if (scan) {
      return {
        primaryName: scan.displayName,
        secondaryName: scan.nativeName,
        setLabel: scan.setName,
        setCode: scan.setCode,
        collectorNumber: scan.collectorNumber,
        language: languageLabel(scan.language),
        finish: scan.finish?.replace(/_/g, " "),
        fromScan: true,
      };
    }

    const partial = partialFromEvidence(evidence);
    if (partial) return partial;
  }

  if (staffSuspect) {
    const meta = scanDerivedMetaFromSuspect(staffSuspect);
    return {
      primaryName: staffSuspect.canonicalName ?? cardDisplayName(card),
      secondaryName: meta?.nativeName,
      setLabel: staffSuspect.setName,
      setCode: staffSuspect.setCode?.toUpperCase(),
      collectorNumber: staffSuspect.collectorNumber ?? staffSuspect.cardNumber,
      language: staffSuspect.language
        ? languageLabel(staffSuspect.language)
        : undefined,
      finish: staffSuspect.finish?.replace(/_/g, " "),
      fromScan: staffSuspect.catalogSource === "scan_derived_fallback",
    };
  }

  return {
    primaryName: cardDisplayName(card),
    setLabel: card.setName ?? undefined,
    collectorNumber: card.cardNumber ?? undefined,
    fromScan: false,
  };
}

const DETECTIVE_FIELD_LABELS: Record<string, string> = {
  card_name: "Name",
  set_name: "Set",
  set_code: "Set code",
  collector_number: "Card number",
  card_number: "Card number",
  language: "Language",
  rarity: "Rarity",
  foil_pattern: "Finish",
  edition: "Edition",
  player_name: "Player",
  year: "Year",
  manufacturer: "Manufacturer",
};

/** Key scan fields for Reason back — ChatGPT-style detective readout. */
export function buildDetectiveEvidenceRows(
  imageEvidence?: ImageEvidenceReport,
): { label: string; value: string }[] {
  if (!imageEvidence) return [];

  const rows: { label: string; value: string }[] = [];
  const seen = new Set<string>();

  for (const slot of imageEvidence.evidenceSlots) {
    if (slot.status === "unknown" || slot.status === "not_applicable") continue;
    if (!slot.value?.trim()) continue;

    const labelKey =
      slot.field === "card_number" ? "collector_number" : slot.field;
    if (seen.has(labelKey)) continue;
    seen.add(labelKey);

    const label = DETECTIVE_FIELD_LABELS[slot.field] ?? slot.field.replace(/_/g, " ");
    let value = slot.value.trim();

    if (slot.field === "card_name") {
      const { primaryName, secondaryName } = nameParts(value);
      value = secondaryName ? `${primaryName} · ${secondaryName}` : primaryName;
    } else if (slot.field === "language") {
      value = languageLabel(value) ?? value;
    } else if (slot.field === "foil_pattern") {
      value = value.replace(/_/g, " ");
    }

    rows.push({ label, value });
  }

  return rows;
}
