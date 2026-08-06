import type { CatalogCard } from "../deck-builder/types";
import { parseTypeParts } from "./commander-type-utils";

export type CommanderEligibilityBasis =
  | "legendary_creature"
  | "rules_text_allows_commander"
  | "background"
  | "partner_configuration"
  | "not_eligible";

export type CommanderLegalityStatus =
  | "legal"
  | "unreleased"
  | "banned"
  | "not_eligible"
  | "unknown";

export interface CommanderStatus {
  structurallyEligible: boolean;
  eligibilityBasis: CommanderEligibilityBasis;
  currentlyLegal: boolean;
  legalityStatus: CommanderLegalityStatus;
  releaseDate?: string;
  oracleId: string;
  canonicalName: string;
  setCode?: string;
}

function oracleTextAllowsCommander(oracleText: string): boolean {
  const lower = oracleText.toLowerCase();
  return (
    lower.includes("can be your commander") ||
    lower.includes("can serve as your commander")
  );
}

function isTokenTypeLine(typeLine: string): boolean {
  return typeLine.toLowerCase().includes("token");
}

/** Structural commander eligibility — independent of current format legality. */
export function deriveStructuralCommanderEligibility(input: {
  typeLine: string;
  oracleText?: string;
}): { eligible: boolean; basis: CommanderEligibilityBasis } {
  const typeLine = input.typeLine ?? "";
  if (isTokenTypeLine(typeLine)) {
    return { eligible: false, basis: "not_eligible" };
  }

  const lowerType = typeLine.toLowerCase();
  const oracleText = (input.oracleText ?? "").toLowerCase();
  const { supertypes, types } = parseTypeParts(typeLine);

  if (lowerType.includes("background")) {
    return { eligible: true, basis: "background" };
  }

  if (
    oracleText.includes("doctor's companion") ||
    oracleText.includes("doctors companion")
  ) {
    return { eligible: true, basis: "partner_configuration" };
  }

  if (
    oracleText.includes("partner") &&
    (oracleText.includes("partner with") || supertypes.includes("Legendary"))
  ) {
    return { eligible: true, basis: "partner_configuration" };
  }

  if (supertypes.includes("Legendary") && types.includes("Creature")) {
    return { eligible: true, basis: "legendary_creature" };
  }

  if (types.includes("Planeswalker") && supertypes.includes("Legendary")) {
    return { eligible: true, basis: "rules_text_allows_commander" };
  }

  if (oracleTextAllowsCommander(oracleText)) {
    return { eligible: true, basis: "rules_text_allows_commander" };
  }

  return { eligible: false, basis: "not_eligible" };
}

function parseReleaseDate(raw?: string): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function deriveCommanderStatus(input: {
  catalog: Pick<
    CatalogCard,
    "oracleId" | "name" | "typeLine" | "oracleText" | "commanderFormatLegal" | "set"
  >;
  legalities?: Record<string, string>;
  releasedAt?: string;
}): CommanderStatus | null {
  const oracleId = input.catalog.oracleId?.trim();
  if (!oracleId) return null;

  const structural = deriveStructuralCommanderEligibility({
    typeLine: input.catalog.typeLine,
    oracleText: input.catalog.oracleText,
  });

  const commanderLegality = input.legalities?.commander;
  const releaseDate = input.releasedAt?.trim() || undefined;
  const release = parseReleaseDate(releaseDate);
  const now = new Date();

  let legalityStatus: CommanderLegalityStatus;
  let currentlyLegal = false;

  if (!structural.eligible) {
    legalityStatus = "not_eligible";
  } else if (commanderLegality === "legal") {
    legalityStatus = "legal";
    currentlyLegal = true;
  } else if (commanderLegality === "banned") {
    legalityStatus = "banned";
  } else if (release && release > now) {
    legalityStatus = "unreleased";
  } else if (commanderLegality === "not_legal" && structural.eligible) {
    legalityStatus = release && release > now ? "unreleased" : "not_eligible";
  } else {
    legalityStatus = structural.eligible ? "unknown" : "not_eligible";
  }

  return {
    structurallyEligible: structural.eligible,
    eligibilityBasis: structural.basis,
    currentlyLegal,
    legalityStatus,
    releaseDate,
    oracleId,
    canonicalName: input.catalog.name,
    setCode: input.catalog.set,
  };
}

export type DeckBuildMode = "currently_legal" | "preview_theorycraft";

export function inferDeckBuildMode(input: {
  commanderStatus: CommanderStatus;
  message: string;
  conversationSummary?: string;
}): DeckBuildMode {
  const combined = `${input.conversationSummary ?? ""} ${input.message}`.toLowerCase();
  const previewLanguage =
    /\b(new|preview|previewed|upcoming|unreleased|not released|hasn't released|has not released|future set|main set)\b/i.test(
      combined,
    );

  if (
    input.commanderStatus.legalityStatus === "unreleased" ||
    (input.commanderStatus.releaseDate &&
      parseReleaseDate(input.commanderStatus.releaseDate)! > new Date() &&
      previewLanguage)
  ) {
    return "preview_theorycraft";
  }

  return "currently_legal";
}

export function previewTheorycraftNote(
  commanderName: string,
  releaseDate?: string,
): string {
  const releaseNote = releaseDate
    ? ` It releases ${releaseDate.slice(0, 10)}.`
    : "";
  return `${commanderName} is officially previewed but has not released yet. I can still theorycraft a Commander deck around it using its published card information.${releaseNote} This list is not legal for normal play until release.`;
}
