import type { CatalogCard, CatalogOracleCard, CommanderEligibility } from "./types";
import {
  classificationToLegacyEligibility,
  deriveCommanderClassification,
  type CommanderClassification,
} from "./commander-classification";
import { deriveTagDerivedProfileV0 } from "./functional-profile";

/** @deprecated Use deriveCommanderClassification. */
export function deriveCommanderEligibility(
  catalog: Pick<
    CatalogCard,
    "commanderFormatLegal" | "colorIdentity" | "typeLine" | "oracleText" | "name" | "legalities"
  >,
): CommanderEligibility {
  const classification = deriveCommanderClassification({
    name: catalog.name,
    typeLine: catalog.typeLine,
    oracleText: catalog.oracleText,
    colorIdentity: catalog.colorIdentity ?? [],
    legalities: catalog.legalities ?? {
      commander: catalog.commanderFormatLegal ? "legal" : "not_legal",
    },
  });
  return classificationToLegacyEligibility(classification);
}

export function deriveOracleCommanderFields(input: {
  name: string;
  typeLine: string;
  oracleText?: string;
  colorIdentity: string[];
  legalities?: Record<string, string | undefined>;
}): {
  commanderClassification: CommanderClassification;
  commanderEligibility: CommanderEligibility;
  commanderEligibilityVersion: string;
} {
  const commanderClassification = deriveCommanderClassification(input);
  return {
    commanderClassification,
    commanderEligibility: classificationToLegacyEligibility(commanderClassification),
    commanderEligibilityVersion: commanderClassification.sourceVersion,
  };
}

export function buildCatalogOracleCard(input: {
  catalog: CatalogCard;
  oracleTags?: string[];
  existing?: CatalogOracleCard | null;
}): CatalogOracleCard | null {
  const oracleId = input.catalog.oracleId?.trim();
  if (!oracleId) return null;

  const printingId = input.catalog.id;
  const printingIds = [
    ...new Set([...(input.existing?.printingIds ?? []), printingId]),
  ];
  const oracleTags =
    input.oracleTags ??
    (input.existing?.oracleTags?.length ? input.existing.oracleTags : []);
  const keywords = input.catalog.keywords ?? input.existing?.keywords ?? [];
  const tagDerivedProfileV0 = deriveTagDerivedProfileV0({ oracleTags, keywords });

  const commanderFields = deriveOracleCommanderFields({
    name: input.catalog.name,
    typeLine: input.catalog.typeLine,
    oracleText: input.catalog.oracleText ?? input.existing?.oracleText,
    colorIdentity: input.catalog.colorIdentity ?? [],
    legalities: input.catalog.legalities,
  });

  const now = new Date().toISOString();

  return {
    id: oracleId,
    canonicalName: input.catalog.name,
    oracleText: input.catalog.oracleText ?? input.existing?.oracleText,
    manaCost: input.catalog.manaCost ?? input.existing?.manaCost,
    cmc: input.catalog.cmc,
    typeLine: input.catalog.typeLine,
    colorIdentity: input.catalog.colorIdentity ?? [],
    colors: input.catalog.colors ?? input.existing?.colors,
    keywords,
    oracleTags,
    commanderClassification: commanderFields.commanderClassification,
    commanderEligibility: commanderFields.commanderEligibility,
    commanderEligibilityVersion: commanderFields.commanderEligibilityVersion,
    tagDerivedProfileV0:
      Object.keys(tagDerivedProfileV0.roles).length > 0
        ? tagDerivedProfileV0
        : undefined,
    printingIds,
    sourceVersion: input.catalog.updatedAt ?? now,
    updatedAt: now,
  };
}

export async function upsertCatalogOracleFromPrinting(input: {
  catalog: CatalogCard;
  oracleTags?: string[];
  getExistingOracle?: (oracleId: string) => Promise<CatalogOracleCard | null>;
  saveOracle: (oracle: CatalogOracleCard) => Promise<void>;
}): Promise<CatalogOracleCard | null> {
  const oracleId = input.catalog.oracleId?.trim();
  if (!oracleId) return null;

  const existing = input.getExistingOracle
    ? await input.getExistingOracle(oracleId)
    : null;
  const oracle = buildCatalogOracleCard({
    catalog: input.catalog,
    oracleTags: input.oracleTags,
    existing,
  });
  if (!oracle) return null;

  await input.saveOracle(oracle);
  return oracle;
}
