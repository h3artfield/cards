import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import { cardCatalogLookupByName } from "../clerk-tools/card-catalog";
import {
  deriveCommanderStatus,
  deriveStructuralCommanderEligibility,
} from "../commander-status";

export type CardFactKind =
  | "commander_eligibility"
  | "color_identity"
  | "card_type"
  | "legendary"
  | "planeswalker_commander";

export interface CardFactAnswer {
  kind: CardFactKind;
  oracleId: string;
  canonicalName: string;
  directAnswer: string;
  reason: string;
  typeLine: string;
  colorIdentity: string[];
  commanderStatus?: ReturnType<typeof deriveCommanderStatus>;
  resolutionSource: "local_oracle" | "live_scryfall";
}

function colorLabel(colors: string[]): string {
  if (colors.length === 0) return "colorless";
  const map: Record<string, string> = {
    W: "white",
    U: "blue",
    B: "black",
    R: "red",
    G: "green",
  };
  return colors.map((c) => map[c] ?? c).join(", ");
}

function formatCommanderEligibilityAnswer(input: {
  name: string;
  status: NonNullable<ReturnType<typeof deriveCommanderStatus>>;
  typeLine: string;
}): { directAnswer: string; reason: string } {
  const { name, status, typeLine } = input;

  if (!status.structurallyEligible) {
    return {
      directAnswer: `No — **${name}** is not eligible to serve as a commander.`,
      reason: `${name} is a ${typeLine.split("—")[0]?.trim() ?? typeLine}. Commanders must be legendary creatures, backgrounds, or cards whose rules text allows them to lead a deck — not ordinary sorceries, instants, or other non-commander card types.`,
    };
  }

  if (status.legalityStatus === "unreleased") {
    return {
      directAnswer: `**${name}** is structurally eligible as a commander but is not released yet (${status.releaseDate?.slice(0, 10) ?? "upcoming"}).`,
      reason: `It is a ${typeLine.split("—")[0]?.trim() ?? typeLine}. Preview cards may be theorycrafted before they are legal in normal play.`,
    };
  }

  if (status.currentlyLegal) {
    return {
      directAnswer: `Yes — **${name}** is a legal commander.`,
      reason: `${name} is a ${typeLine.split("—")[0]?.trim() ?? typeLine}.`,
    };
  }

  return {
    directAnswer: `**${name}** is not currently legal as a commander in sanctioned play.`,
    reason: `Although it is a ${typeLine.split("—")[0]?.trim() ?? typeLine}, its current legality status is "${status.legalityStatus}". Being printed in a Commander product does not by itself make a card your commander.`,
  };
}

async function resolveCardForFact(
  cardPhrase: string,
  _conversationContext: string,
): Promise<{
  oracleId: string;
  canonicalName: string;
  typeLine: string;
  colorIdentity: string[];
  oracleText?: string;
  commanderFormatLegal: boolean;
  canBeSoleCommander: boolean;
  resolutionSource: "local_oracle" | "live_scryfall";
  commanderStatus: ReturnType<typeof deriveCommanderStatus>;
} | null> {
  const hit = await cardCatalogLookupByName(cardPhrase);
  if (!hit?.oracleId) return null;

  const oracle = await deckBuilderStore.getCatalogOracleCard(hit.oracleId);
  const typeLine = hit.typeLine ?? oracle?.typeLine ?? "";
  const oracleText = oracle?.oracleText;
  const structural = deriveStructuralCommanderEligibility({ typeLine, oracleText });

  const canBeSole =
    oracle?.commanderClassification?.canBeSoleCommander ??
    hit.canBeSoleCommander ??
    oracle?.commanderEligibility.eligible ??
    false;
  const formatLegal = hit.commanderFormatLegal ?? false;

  const status =
    deriveCommanderStatus({
      catalog: {
        oracleId: hit.oracleId,
        name: hit.name,
        typeLine,
        oracleText,
        set: "",
      },
      legalities: {
        commander: formatLegal ? "legal" : "not_legal",
      },
    }) ??
    ({
      structurallyEligible: structural.eligible,
      eligibilityBasis: structural.basis,
      currentlyLegal: canBeSole,
      legalityStatus: canBeSole ? "legal" : "not_eligible",
      oracleId: hit.oracleId,
      canonicalName: hit.name,
    } as NonNullable<ReturnType<typeof deriveCommanderStatus>>);

  return {
    oracleId: hit.oracleId,
    canonicalName: hit.name,
    typeLine,
    colorIdentity: hit.colorIdentity,
    oracleText,
    commanderFormatLegal: formatLegal,
    canBeSoleCommander: canBeSole,
    resolutionSource: oracle ? "local_oracle" : "live_scryfall",
    commanderStatus: status,
  };
}

export async function answerCardFactQuestion(input: {
  question: string;
  kind: CardFactKind;
  cardPhrase: string;
  conversationSummary?: string;
}): Promise<CardFactAnswer | { ambiguous: true; message: string } | null> {
  const resolved = await resolveCardForFact(
    input.cardPhrase,
    `${input.conversationSummary ?? ""}\n${input.question}`,
  );

  if (!resolved) {
    return null;
  }

  const { canonicalName, typeLine, colorIdentity, commanderStatus } = resolved;

  switch (input.kind) {
    case "commander_eligibility":
    case "planeswalker_commander": {
      const formatted = formatCommanderEligibilityAnswer({
        name: canonicalName,
        status: commanderStatus!,
        typeLine,
      });
      return {
        kind: input.kind,
        oracleId: resolved.oracleId,
        canonicalName,
        directAnswer: formatted.directAnswer,
        reason: `${formatted.reason} Color identity: ${colorLabel(colorIdentity)}.`,
        typeLine,
        colorIdentity,
        commanderStatus: commanderStatus ?? undefined,
        resolutionSource: resolved.resolutionSource,
      };
    }
    case "color_identity":
      return {
        kind: input.kind,
        oracleId: resolved.oracleId,
        canonicalName,
        directAnswer: `**${canonicalName}** has color identity ${colorLabel(colorIdentity)} (${colorIdentity.join("") || "C"}).`,
        reason: `Derived from canonical oracle data for ${canonicalName} (${typeLine.split("—")[0]?.trim()}).`,
        typeLine,
        colorIdentity,
        commanderStatus: commanderStatus ?? undefined,
        resolutionSource: resolved.resolutionSource,
      };
    case "card_type":
      return {
        kind: input.kind,
        oracleId: resolved.oracleId,
        canonicalName,
        directAnswer: `**${canonicalName}** is a ${typeLine.split("—")[0]?.trim() ?? typeLine}.`,
        reason: typeLine.includes("—")
          ? `Full type line: ${typeLine}.`
          : `Type from canonical card data.`,
        typeLine,
        colorIdentity,
        commanderStatus: commanderStatus ?? undefined,
        resolutionSource: resolved.resolutionSource,
      };
    case "legendary": {
      const isLegendary = typeLine.toLowerCase().includes("legendary");
      return {
        kind: input.kind,
        oracleId: resolved.oracleId,
        canonicalName,
        directAnswer: isLegendary
          ? `Yes — **${canonicalName}** is legendary.`
          : `No — **${canonicalName}** is not legendary.`,
        reason: `Type line: ${typeLine}.`,
        typeLine,
        colorIdentity,
        commanderStatus: commanderStatus ?? undefined,
        resolutionSource: resolved.resolutionSource,
      };
    }
    default:
      return null;
  }
}
