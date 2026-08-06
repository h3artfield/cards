import type { CardFace, GoldenCatalogOracleCard } from "./schemas";
import { normalizeOracleName } from "./normalize-name";
import { parseTypeLine } from "./parse-type-line";
import { deriveOracleCommanderFields } from "../catalog-oracle-card";
import { deriveTagDerivedProfileV0 } from "../functional-profile";
import type { CatalogCard } from "../types";

const SOURCE_VERSION_PREFIX = "scryfall-oracle_cards";

function extractOracleText(raw: Record<string, unknown>): string | undefined {
  const top = raw.oracle_text as string | undefined;
  if (top?.trim()) return top.trim();
  const faces = raw.card_faces as Array<{ oracle_text?: string }> | undefined;
  if (faces?.length) {
    const combined = faces
      .map((face) => face.oracle_text?.trim())
      .filter(Boolean)
      .join("\n//\n");
    if (combined) return combined;
  }
  return undefined;
}

function extractKeywords(raw: Record<string, unknown>): string[] {
  const keywords = raw.keywords as string[] | undefined;
  if (keywords?.length) return keywords;
  const faces = raw.card_faces as Array<{ keywords?: string[] }> | undefined;
  const merged = new Set<string>();
  for (const face of faces ?? []) {
    for (const keyword of face.keywords ?? []) merged.add(keyword);
  }
  return [...merged];
}

function extractCardFaces(raw: Record<string, unknown>): CardFace[] | undefined {
  const faces = raw.card_faces as Array<Record<string, unknown>> | undefined;
  if (!faces?.length) return undefined;
  return faces.map((face) => ({
    name: face.name as string | undefined,
    manaCost: face.mana_cost as string | undefined,
    typeLine: face.type_line as string | undefined,
    oracleText: face.oracle_text as string | undefined,
    colors: face.colors as string[] | undefined,
    power: face.power as string | undefined,
    toughness: face.toughness as string | undefined,
    loyalty: face.loyalty as string | undefined,
  }));
}

function syntheticCatalogForEligibility(input: {
  name: string;
  typeLine: string;
  oracleText?: string;
  colorIdentity: string[];
  legalities: Record<string, string | undefined>;
}): Pick<
  CatalogCard,
  "name" | "typeLine" | "oracleText" | "colorIdentity" | "legalities"
> {
  return {
    name: input.name,
    typeLine: input.typeLine,
    oracleText: input.oracleText,
    colorIdentity: input.colorIdentity,
    legalities: input.legalities,
  };
}

/** Parse one Scryfall oracle_cards bulk row into a golden oracle record. */
export function parseOracleCardFromBulk(
  raw: Record<string, unknown>,
  input?: {
    bulkUpdatedAt?: string;
    oracleTags?: string[];
    existing?: Partial<GoldenCatalogOracleCard> | null;
  },
): GoldenCatalogOracleCard | null {
  const oracleId = (raw.oracle_id as string | undefined)?.trim();
  const name = (raw.name as string | undefined)?.trim();
  if (!oracleId || !name) return null;

  const typeLine = String(raw.type_line ?? "");
  const { supertypes, types, subtypes } = parseTypeLine(typeLine);
  const legalities = (raw.legalities as Record<string, string>) ?? {};
  const keywords = extractKeywords(raw);
  const oracleTags =
    input?.oracleTags ??
    (input?.existing?.oracleTags?.length ? input.existing.oracleTags : []);
  const tagDerivedProfileV0 = deriveTagDerivedProfileV0({ oracleTags, keywords });
  const now = new Date().toISOString();
  const bulkStamp = input?.bulkUpdatedAt ?? now;
  const commanderFields = deriveOracleCommanderFields({
    name,
    typeLine,
    oracleText: extractOracleText(raw),
    colorIdentity: (raw.color_identity as string[]) ?? [],
    legalities,
  });

  return {
    id: oracleId,
    oracleId,
    canonicalName: name,
    normalizedName: normalizeOracleName(name),
    layout: raw.layout as string | undefined,
    cardFaces: extractCardFaces(raw),
    manaCost: raw.mana_cost as string | undefined,
    manaValue: Number(raw.cmc ?? 0),
    cmc: Number(raw.cmc ?? 0),
    colors: (raw.colors as string[]) ?? [],
    colorIdentity: (raw.color_identity as string[]) ?? [],
    typeLine,
    supertypes,
    types,
    subtypes,
    oracleText: extractOracleText(raw),
    keywords,
    producedMana: (raw.produced_mana as string[] | undefined) ?? undefined,
    legalities,
    commanderClassification: commanderFields.commanderClassification,
    commanderEligibility: commanderFields.commanderEligibility,
    commanderEligibilityVersion: commanderFields.commanderEligibilityVersion,
    games: raw.games as string[] | undefined,
    reserved: Boolean(raw.reserved),
    releaseInformation: raw.released_at
      ? {
          releasedAt: String(raw.released_at),
          setCode: raw.set as string | undefined,
          setName: raw.set_name as string | undefined,
        }
      : undefined,
    oracleTags,
    tagDerivedProfileV0:
      Object.keys(tagDerivedProfileV0.roles).length > 0
        ? tagDerivedProfileV0
        : input?.existing?.tagDerivedProfileV0,
    printingIds: input?.existing?.printingIds ?? [],
    sourceVersion: `${SOURCE_VERSION_PREFIX}:${bulkStamp}`,
    evidence: {
      source: "scryfall_bulk",
      bulkUpdatedAt: bulkStamp,
      profileVersion: input?.existing?.profileVersion,
    },
    profileVersion: input?.existing?.profileVersion,
    updatedAt: now,
  };
}
