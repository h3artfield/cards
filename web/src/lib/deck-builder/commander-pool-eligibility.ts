import {
  deriveCommanderClassification,
  type CommanderClassification,
  type CommanderClassificationInput,
} from "./commander-classification";
import {
  assessCommanderFormatLegality,
  loadCommanderFormatLegalitySnapshot,
  resolveProductCommanderFormatLegal,
} from "./commander-format-legality-snapshot-v1";
import type { GoldenCatalogOracleCard } from "./golden-catalog/schemas";
import type { CatalogCard } from "./types";
import type { InventoryItem } from "../types";

const STRUCTURAL_SOLE_COMMANDER_BASES = new Set<CommanderClassification["eligibilityBasis"]>([
  "legendary_creature",
  "legendary_vehicle",
  "legendary_spacecraft",
  "explicit_can_be_commander_text",
]);

/** Legendary creature (etc.) that can occupy the command zone alone — not Background / Doctor's Companion. */
export function isStructuralSoleCommanderClassification(
  classification: CommanderClassification,
): boolean {
  if (!classification.structurallyEligible) return false;
  if (classification.requiresCompatiblePair) return false;
  return STRUCTURAL_SOLE_COMMANDER_BASES.has(classification.eligibilityBasis);
}

export function isStructuralSoleCommanderCandidate(
  input: CommanderClassificationInput,
): boolean {
  return isStructuralSoleCommanderClassification(deriveCommanderClassification(input));
}

type PoolLegalityInput = CommanderClassificationInput & {
  oracleId?: string;
  releaseInformation?: GoldenCatalogOracleCard["releaseInformation"];
  updatedAt?: string;
  evidence?: GoldenCatalogOracleCard["evidence"];
};

function reconciledSoleCommanderLegality(input: PoolLegalityInput): {
  canBeSoleCommander: boolean;
  commanderFormatLegal: boolean;
} {
  const classification = deriveCommanderClassification(input);
  if (!isStructuralSoleCommanderClassification(classification)) {
    return { canBeSoleCommander: false, commanderFormatLegal: false };
  }

  const snapshot = loadCommanderFormatLegalitySnapshot();
  if (!snapshot || !input.oracleId) {
    return {
      canBeSoleCommander: classification.canBeSoleCommander,
      commanderFormatLegal: classification.commanderFormatStatus === "legal",
    };
  }

  const resolved = resolveProductCommanderFormatLegal({
    catalog: {
      oracleId: input.oracleId,
      name: input.name,
      typeLine: input.typeLine,
      oracleText: input.oracleText,
      colorIdentity: input.colorIdentity,
      legalities: input.legalities,
      commanderFormatLegal: classification.commanderFormatStatus === "legal",
      set: input.releaseInformation?.setCode ?? "",
      setName: input.releaseInformation?.setName,
      releasedAt: input.releaseInformation?.releasedAt,
      updatedAt: input.updatedAt,
    },
    classification,
    snapshot,
  });

  if (resolved.canBeSoleCommander) {
    return {
      canBeSoleCommander: true,
      commanderFormatLegal: resolved.commanderFormatLegal,
    };
  }

  // Golden catalog bulk legality can lag Scryfall — trust structure for paper commanders.
  const assessment = assessCommanderFormatLegality({
    card: {
      oracleId: input.oracleId,
      canonicalName: input.name,
      typeLine: input.typeLine,
      oracleText: input.oracleText,
      colorIdentity: input.colorIdentity,
      legalities: input.legalities,
      releaseInformation: input.releaseInformation,
      updatedAt: input.updatedAt,
      evidence: input.evidence,
    },
    snapshot,
  });

  if (
    assessment.structurallyCanBeCommander &&
    assessment.currentCommanderFormatLegality !== "BANNED" &&
    assessment.currentCommanderFormatLegality !== "DIGITAL_ONLY" &&
    assessment.currentCommanderFormatLegality !== "NON_CONSTRUCTED" &&
    input.legalities?.commander?.toLowerCase() !== "banned"
  ) {
    const staleNotLegal =
      input.legalities?.commander?.toLowerCase() === "not_legal" ||
      classification.commanderFormatStatus === "not_legal";
    if (staleNotLegal || assessment.staleLegalityMetadata) {
      return { canBeSoleCommander: true, commanderFormatLegal: true };
    }
  }

  return {
    canBeSoleCommander: resolved.canBeSoleCommander,
    commanderFormatLegal: resolved.commanderFormatLegal,
  };
}

/** Shared sole-commander pool rule for Professor search + manual deck builder. */
export function isSoleCommanderPoolCandidate(
  input: PoolLegalityInput,
): boolean {
  if (!isStructuralSoleCommanderCandidate(input)) return false;
  if (input.legalities?.commander?.toLowerCase() === "banned") return false;
  return reconciledSoleCommanderLegality(input).canBeSoleCommander;
}

export function goldenOracleCardIsSoleCommanderPoolCandidate(
  card: GoldenCatalogOracleCard,
): boolean {
  return isSoleCommanderPoolCandidate({
    oracleId: card.oracleId,
    name: card.canonicalName,
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    colorIdentity: card.colorIdentity ?? [],
    legalities: card.legalities,
    releaseInformation: card.releaseInformation,
    updatedAt: card.updatedAt,
    evidence: card.evidence,
  });
}

export function inventoryItemIsSoleCommanderCandidate(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): boolean {
  if (item.catalogCanBeSoleCommander === true) return true;

  const typeLine = item.catalogTypeLine ?? catalog?.typeLine;
  if (!typeLine?.trim()) return false;

  const name =
    item.productName?.trim() ||
    item.displayName.split(" — ")[0]?.trim() ||
    item.displayName;

  return isSoleCommanderPoolCandidate({
    oracleId: item.catalogOracleId ?? catalog?.oracleId,
    name,
    typeLine,
    oracleText: item.catalogOracleText ?? catalog?.oracleText,
    colorIdentity: item.catalogColorIdentity ?? catalog?.colorIdentity ?? [],
    legalities: catalog?.legalities,
    releaseInformation: item.catalogSetCode
      ? { setCode: item.catalogSetCode, setName: item.setName }
      : undefined,
  });
}
