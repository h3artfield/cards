import type { CardLegalities } from "./golden-catalog/schemas";
import { parseTypeLine } from "./golden-catalog/parse-type-line";

export const COMMANDER_ELIGIBILITY_VERSION = "commander-eligibility-v2" as const;

export type CommanderFormatStatus =
  | "legal"
  | "banned"
  | "not_legal"
  | "unreleased"
  | "unknown";

export type CommanderEligibilityBasisV2 =
  | "legendary_creature"
  | "legendary_vehicle"
  | "legendary_spacecraft"
  | "explicit_can_be_commander_text"
  | "background_configuration"
  | "partner_configuration"
  | "not_eligible";

export type PairingMechanic =
  | "partner"
  | "partner_with"
  | "choose_background"
  | "doctors_companion"
  | "friends_forever"
  | null;

export interface CommanderClassification {
  structurallyEligible: boolean;
  eligibilityBasis: CommanderEligibilityBasisV2;
  commanderFormatStatus: CommanderFormatStatus;
  /** @deprecated Prefer canBeSoleCommander. */
  canOccupyCommandZone: boolean;
  canBeSoleCommander: boolean;
  canBePartOfCommandZone: boolean;
  requiresCompatiblePair: boolean;
  pairingMechanic: PairingMechanic;
  /** @deprecated */
  requiresPairedCommander: boolean;
  /** @deprecated */
  pairingRules?: string[];
  commanderColorIdentity: string[];
  reason: string;
  sourceVersion: typeof COMMANDER_ELIGIBILITY_VERSION;
}

export interface CommanderClassificationInput {
  name: string;
  typeLine: string;
  oracleText?: string;
  colorIdentity: string[];
  legalities?: CardLegalities | Record<string, string | undefined>;
}

export function hasExplicitCanBeCommanderText(oracleText: string): boolean {
  const normalized = oracleText
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ");
  return (
    /\bcan be your commander\b/.test(normalized) ||
    /\bcan serve as (?:your )?commander\b/.test(normalized) ||
    /\bmay be (?:your )?commander\b/.test(normalized) ||
    /\bthis (?:legendary )?(?:planeswalker|creature|artifact|enchantment|vehicle|spacecraft) can be your commander\b/.test(
      normalized,
    )
  );
}

export function hasPartnerConfiguration(oracleText: string): boolean {
  const normalized = oracleText
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ");
  return (
    /\bpartner with\b/.test(normalized) ||
    /\bpartner\b(?!\s+with)/.test(normalized) ||
    /\bfriends forever\b/.test(normalized)
  );
}

export function hasPartnerWith(oracleText: string): boolean {
  return /\bpartner with\b/i.test(oracleText);
}

export function hasDoctorsCompanion(oracleText: string): boolean {
  const normalized = oracleText
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ");
  return /\bdoctor'?s companion\b/.test(normalized);
}

export function hasChooseBackground(oracleText: string): boolean {
  const normalized = oracleText
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ");
  return /\bchoose a background\b/.test(normalized);
}

export function mapCommanderFormatStatus(
  legalities?: CardLegalities | Record<string, string | undefined>,
): CommanderFormatStatus {
  const status = legalities?.commander?.toLowerCase();
  if (!status) return "unknown";
  if (status === "legal") return "legal";
  if (status === "banned") return "banned";
  if (status === "not_legal") return "not_legal";
  if (status === "restricted") return "legal";
  return "unknown";
}

export function isCommanderFormatLegal(
  legalities?: CardLegalities | Record<string, string | undefined>,
): boolean {
  return mapCommanderFormatStatus(legalities) === "legal";
}

type ClassificationDraft = Omit<
  CommanderClassification,
  "sourceVersion" | "requiresPairedCommander" | "canOccupyCommandZone"
> & {
  requiresPairedCommander?: boolean;
  canOccupyCommandZone?: boolean;
};

function finish(partial: ClassificationDraft): CommanderClassification {
  const canBeSoleCommander = partial.canBeSoleCommander;
  return {
    ...partial,
    canOccupyCommandZone: partial.canOccupyCommandZone ?? canBeSoleCommander,
    requiresPairedCommander: partial.requiresCompatiblePair,
    sourceVersion: COMMANDER_ELIGIBILITY_VERSION,
  };
}

export function deriveCommanderClassification(
  input: CommanderClassificationInput,
): CommanderClassification {
  const typeLine = input.typeLine ?? "";
  const oracleText = input.oracleText ?? "";
  const colorIdentity = input.colorIdentity ?? [];
  const commanderFormatStatus = mapCommanderFormatStatus(input.legalities);
  const { supertypes, types, subtypes } = parseTypeLine(typeLine);
  const lowerType = typeLine.toLowerCase();

  const formatLegal = commanderFormatStatus === "legal";
  const explicitText = hasExplicitCanBeCommanderText(oracleText);
  const partner = hasPartnerConfiguration(oracleText);
  const partnerWith = hasPartnerWith(oracleText);
  const doctorsCompanion = hasDoctorsCompanion(oracleText);
  const chooseBackground = hasChooseBackground(oracleText);
  const isBackground = lowerType.includes("background") || subtypes.includes("Background");
  const isLegendary = supertypes.includes("Legendary");
  const isCreature = types.includes("Creature");
  const isVehicle = types.includes("Vehicle");
  const isSpacecraft = types.includes("Spacecraft");
  const isPlaneswalker = types.includes("Planeswalker");

  if (isBackground) {
    return finish({
      structurallyEligible: true,
      eligibilityBasis: "background_configuration",
      commanderFormatStatus,
      canBeSoleCommander: false,
      canBePartOfCommandZone: formatLegal,
      requiresCompatiblePair: true,
      pairingMechanic: "choose_background",
      pairingRules: ["Requires a commander with Choose a Background"],
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? "Backgrounds cannot be your sole commander — they pair with a commander that has Choose a Background"
        : "Background enchantment is not legal in the Commander format",
    });
  }

  if (doctorsCompanion) {
    return finish({
      structurallyEligible: true,
      eligibilityBasis: "partner_configuration",
      commanderFormatStatus,
      canBeSoleCommander: false,
      canBePartOfCommandZone: formatLegal,
      requiresCompatiblePair: true,
      pairingMechanic: "doctors_companion",
      pairingRules: ["Doctor's companion requires a Doctor commander"],
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? "Doctor's companion cannot be your sole commander — it requires a Doctor commander"
        : "Doctor's companion is not legal in the Commander format",
    });
  }

  if (isLegendary && isCreature) {
    const basis: CommanderEligibilityBasisV2 = isVehicle
      ? "legendary_vehicle"
      : isSpacecraft
        ? "legendary_spacecraft"
        : "legendary_creature";
    const pairingMechanic: PairingMechanic = partnerWith
      ? "partner_with"
      : partner
        ? "partner"
        : chooseBackground
          ? "choose_background"
          : null;
    return finish({
      structurallyEligible: true,
      eligibilityBasis: basis,
      commanderFormatStatus,
      canBeSoleCommander: formatLegal,
      canBePartOfCommandZone: formatLegal,
      requiresCompatiblePair: false,
      pairingMechanic,
      pairingRules: partner ? ["May partner with a compatible commander"] : undefined,
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? partner
          ? "Legendary creature with Partner — legal as a sole commander"
          : "Legendary creature — legal as a sole commander"
        : "Legendary creature that is not currently legal as a commander in this format",
    });
  }

  if (explicitText) {
    const pairingMechanic: PairingMechanic = chooseBackground
      ? "choose_background"
      : partnerWith
        ? "partner_with"
        : partner
          ? "partner"
          : null;
    return finish({
      structurallyEligible: true,
      eligibilityBasis: "explicit_can_be_commander_text",
      commanderFormatStatus,
      canBeSoleCommander: formatLegal,
      canBePartOfCommandZone: formatLegal,
      requiresCompatiblePair: false,
      pairingMechanic,
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? "Oracle text explicitly allows this card to be your commander"
        : "Card has commander permission text but is not legal in the Commander format",
    });
  }

  if (isLegendary && isPlaneswalker) {
    return finish({
      structurallyEligible: false,
      eligibilityBasis: "not_eligible",
      commanderFormatStatus,
      canBeSoleCommander: false,
      canBePartOfCommandZone: false,
      requiresCompatiblePair: false,
      pairingMechanic: null,
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? "Legendary planeswalker without commander permission text — legal in a Commander deck but cannot occupy the command zone"
        : "Legendary planeswalker is not legal in the Commander format",
    });
  }

  if (isLegendary && (types.includes("Enchantment") || types.includes("Artifact"))) {
    return finish({
      structurallyEligible: false,
      eligibilityBasis: "not_eligible",
      commanderFormatStatus,
      canBeSoleCommander: false,
      canBePartOfCommandZone: false,
      requiresCompatiblePair: false,
      pairingMechanic: null,
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? "Legendary permanent without commander permission text — legal in a Commander deck but cannot occupy the command zone"
        : "Not legal in the Commander format",
    });
  }

  if (isLegendary && isVehicle && !isCreature) {
    return finish({
      structurallyEligible: false,
      eligibilityBasis: "not_eligible",
      commanderFormatStatus,
      canBeSoleCommander: false,
      canBePartOfCommandZone: false,
      requiresCompatiblePair: false,
      pairingMechanic: null,
      commanderColorIdentity: colorIdentity,
      reason: formatLegal
        ? "Legendary Vehicle without commander permission text — legal in a Commander deck but cannot occupy the command zone"
        : "Not legal in the Commander format",
    });
  }

  return finish({
    structurallyEligible: false,
    eligibilityBasis: "not_eligible",
    commanderFormatStatus,
    canBeSoleCommander: false,
    canBePartOfCommandZone: false,
    requiresCompatiblePair: false,
    pairingMechanic: null,
    commanderColorIdentity: colorIdentity,
    reason: formatLegal
      ? "The card is legal in a Commander deck but cannot occupy the command zone"
      : commanderFormatStatus === "banned"
        ? "Banned from the Commander format"
        : "Not eligible to be a commander",
  });
}

export function classificationToLegacyEligibility(c: CommanderClassification): {
  eligible: boolean;
  basis:
    | "legendary_creature"
    | "card_text_allows_commander"
    | "background"
    | "doctor_companion"
    | "partner_variant"
    | "not_eligible";
  commanderColorIdentity: string[];
  partnerRestrictions?: string[];
  reason: string;
  sourceVersion: string;
} {
  let basis:
    | "legendary_creature"
    | "card_text_allows_commander"
    | "background"
    | "doctor_companion"
    | "partner_variant"
    | "not_eligible" = "not_eligible";

  switch (c.eligibilityBasis) {
    case "legendary_creature":
    case "legendary_vehicle":
    case "legendary_spacecraft":
      basis = "legendary_creature";
      break;
    case "explicit_can_be_commander_text":
      basis = "card_text_allows_commander";
      break;
    case "background_configuration":
      basis = "background";
      break;
    case "partner_configuration":
      basis = c.pairingMechanic === "doctors_companion" ? "doctor_companion" : "partner_variant";
      break;
    default:
      basis = "not_eligible";
  }

  return {
    eligible: c.canBeSoleCommander,
    basis,
    commanderColorIdentity: c.commanderColorIdentity,
    partnerRestrictions: c.pairingRules,
    reason: c.reason,
    sourceVersion: c.sourceVersion,
  };
}
