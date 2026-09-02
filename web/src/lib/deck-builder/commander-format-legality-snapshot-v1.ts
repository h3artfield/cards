/**
 * Commander format legality snapshot v1 — deterministic product legality with provenance.
 *
 * Separates structural command-zone eligibility from current Commander format legality.
 * Does not mutate semantic discovery or Oracle mechanics.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveCommanderClassification,
  type CommanderClassification,
} from "./commander-classification";
import type { CardLegalities, GoldenCatalogOracleCard } from "./golden-catalog/schemas";
import type { CatalogCard } from "./types";

export const COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION =
  "commander-format-legality-snapshot-v1" as const;

export type StructuralCommandZoneEligibility = "ELIGIBLE" | "INELIGIBLE";

export type CurrentCommanderFormatLegality =
  | "LEGAL"
  | "BANNED"
  | "NOT_YET_LEGAL"
  | "NON_CONSTRUCTED"
  | "DIGITAL_ONLY"
  | "UNKNOWN";

export type LegalitySource =
  | "structural_oracle_classification"
  | "wizards_banned_policy"
  | "set_format_policy"
  | "set_release_timing"
  | "paper_population_frame"
  | "non_competitive_frame_supplement"
  | "scryfall_golden_catalog_legalities";

export type SetCommanderFormatPolicy = {
  setCode: string;
  setName: string;
  prereleaseAt?: string;
  releasedAt: string;
  /** Explicit Wizards/product policy — NOT inferred globally for all sets. */
  commanderLegalFromPrerelease?: boolean;
  nonConstructed?: boolean;
  digitalOnly?: boolean;
  policyNote?: string;
};

export type CommanderFormatLegalitySnapshot = {
  version: typeof COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION;
  generatedAt: string;
  legalityAsOf: string;
  catalogLegalityBulkUpdatedAt: string | null;
  sourcePrecedence: LegalitySource[];
  commanderBannedOracleIds: string[];
  setFormatPolicies: SetCommanderFormatPolicy[];
  notes: string[];
};

export type CommanderLegalityProvenance = {
  legalitySource: LegalitySource;
  legalitySourceUpdatedAt: string | null;
  legalityDerivedAt: string;
  catalogCommanderFormatStatus: CommanderClassification["commanderFormatStatus"];
  scryfallCommanderLegality: string | null;
};

export type CommanderFormatLegalityAssessment = {
  structuralCommandZoneEligibility: StructuralCommandZoneEligibility;
  structurallyCanBeCommander: boolean;
  structurallyCanBePartOfCommandZone: boolean;
  currentCommanderFormatLegality: CurrentCommanderFormatLegality;
  configurationLegality: boolean;
  legalityEffectiveDate: string | null;
  legalityReason: string;
  legalitySource: LegalitySource;
  legalityCheckedAt: string;
  legalityAsOf: string;
  provenance: CommanderLegalityProvenance;
  staleLegalityMetadata: boolean;
  liveCommanderLegal: boolean;
  previewTheorycraftPermitted: boolean;
};

export const LEGALITY_SOURCE_PRECEDENCE: LegalitySource[] = [
  "structural_oracle_classification",
  "wizards_banned_policy",
  "set_format_policy",
  "set_release_timing",
  "paper_population_frame",
  "non_competitive_frame_supplement",
  "scryfall_golden_catalog_legalities",
];

export type LegalityCardInput = {
  oracleId: string;
  canonicalName: string;
  typeLine: string;
  oracleText?: string;
  colorIdentity: string[];
  legalities?: CardLegalities | Record<string, string | undefined>;
  releaseInformation?: {
    setCode?: string;
    setName?: string;
    releasedAt?: string;
  };
  updatedAt?: string;
  evidence?: { bulkUpdatedAt?: string };
};

const SNAPSHOT_SEARCH_PATHS = [
  resolve(process.cwd(), "data/milestones/catalog-shadow/commander-format-legality-snapshot-v1.json"),
  resolve(process.cwd(), "web/data/milestones/catalog-shadow/commander-format-legality-snapshot-v1.json"),
];

let cachedSnapshot: CommanderFormatLegalitySnapshot | null | undefined;

export function loadCommanderFormatLegalitySnapshot(): CommanderFormatLegalitySnapshot | null {
  if (cachedSnapshot !== undefined) return cachedSnapshot;
  for (const snapshotPath of SNAPSHOT_SEARCH_PATHS) {
    if (!existsSync(snapshotPath)) continue;
    cachedSnapshot = JSON.parse(
      readFileSync(snapshotPath, "utf8"),
    ) as CommanderFormatLegalitySnapshot;
    return cachedSnapshot;
  }
  cachedSnapshot = null;
  return null;
}

export function catalogCardToLegalityInput(
  catalog: Pick<
    CatalogCard,
    | "oracleId"
    | "name"
    | "typeLine"
    | "oracleText"
    | "colorIdentity"
    | "legalities"
    | "commanderFormatLegal"
    | "set"
    | "setName"
    | "updatedAt"
  > & { releasedAt?: string },
): LegalityCardInput | null {
  const oracleId = catalog.oracleId?.trim();
  if (!oracleId) return null;
  return {
    oracleId,
    canonicalName: catalog.name,
    typeLine: catalog.typeLine,
    oracleText: catalog.oracleText,
    colorIdentity: catalog.colorIdentity ?? [],
    legalities:
      catalog.legalities ??
      ({
        commander: catalog.commanderFormatLegal ? "legal" : "not_legal",
      } as CardLegalities),
    releaseInformation: {
      setCode: catalog.set,
      setName: catalog.setName,
      releasedAt: catalog.releasedAt,
    },
    updatedAt: catalog.updatedAt,
  };
}

export function resolveProductCommanderFormatLegal(input: {
  catalog: Pick<
    CatalogCard,
    | "oracleId"
    | "name"
    | "typeLine"
    | "oracleText"
    | "colorIdentity"
    | "legalities"
    | "commanderFormatLegal"
    | "set"
    | "setName"
    | "updatedAt"
  > & { releasedAt?: string };
  classification: CommanderClassification;
  snapshot?: CommanderFormatLegalitySnapshot | null;
  legalityAsOf?: string;
}): {
  commanderFormatLegal: boolean;
  canBeSoleCommander: boolean;
  assessment: CommanderFormatLegalityAssessment | null;
} {
  const card = catalogCardToLegalityInput(input.catalog);
  const snapshot = input.snapshot ?? loadCommanderFormatLegalitySnapshot();
  if (!card || !snapshot) {
    return {
      commanderFormatLegal: input.catalog.commanderFormatLegal ?? false,
      canBeSoleCommander: input.classification.canBeSoleCommander,
      assessment: null,
    };
  }

  const assessment = assessCommanderFormatLegality({
    card,
    snapshot,
    legalityAsOf: input.legalityAsOf,
  });

  const commanderFormatLegal =
    input.classification.eligibilityBasis === "background_configuration" ||
    input.classification.pairingMechanic === "doctors_companion"
      ? assessment.liveCommanderLegal && input.classification.canBePartOfCommandZone
      : assessment.liveCommanderLegal && assessment.structurallyCanBeCommander;

  return {
    commanderFormatLegal,
    canBeSoleCommander:
      input.classification.canBeSoleCommander &&
      assessment.liveCommanderLegal &&
      assessment.structurallyCanBeCommander,
    assessment,
  };
}

function parseIsoDate(raw?: string | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(raw: string): Date {
  const d = parseIsoDate(raw)!;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isOnOrAfter(asOf: Date, dateIso: string): boolean {
  return asOf.getTime() >= startOfUtcDay(dateIso).getTime();
}

function deriveStructuralFields(classification: CommanderClassification): {
  structuralCommandZoneEligibility: StructuralCommandZoneEligibility;
  structurallyCanBeCommander: boolean;
  structurallyCanBePartOfCommandZone: boolean;
} {
  if (classification.eligibilityBasis === "not_eligible") {
    return {
      structuralCommandZoneEligibility: "INELIGIBLE",
      structurallyCanBeCommander: false,
      structurallyCanBePartOfCommandZone: false,
    };
  }

  if (
    classification.eligibilityBasis === "background_configuration" ||
    classification.pairingMechanic === "choose_background"
  ) {
    return {
      structuralCommandZoneEligibility: "ELIGIBLE",
      structurallyCanBeCommander: false,
      structurallyCanBePartOfCommandZone: true,
    };
  }

  if (classification.pairingMechanic === "doctors_companion") {
    return {
      structuralCommandZoneEligibility: "ELIGIBLE",
      structurallyCanBeCommander: false,
      structurallyCanBePartOfCommandZone: true,
    };
  }

  if (
    classification.eligibilityBasis === "legendary_creature" ||
    classification.eligibilityBasis === "legendary_vehicle" ||
    classification.eligibilityBasis === "legendary_spacecraft" ||
    classification.eligibilityBasis === "explicit_can_be_commander_text"
  ) {
    return {
      structuralCommandZoneEligibility: "ELIGIBLE",
      structurallyCanBeCommander: true,
      structurallyCanBePartOfCommandZone: true,
    };
  }

  return {
    structuralCommandZoneEligibility: "INELIGIBLE",
    structurallyCanBeCommander: false,
    structurallyCanBePartOfCommandZone: false,
  };
}

function resolveSetPolicy(
  snapshot: CommanderFormatLegalitySnapshot,
  card: LegalityCardInput,
): SetCommanderFormatPolicy | null {
  const setCode = card.releaseInformation?.setCode?.toLowerCase();
  if (!setCode) return null;
  return snapshot.setFormatPolicies.find((p) => p.setCode.toLowerCase() === setCode) ?? null;
}

export function assessCommanderFormatLegality(input: {
  card: LegalityCardInput | GoldenCatalogOracleCard;
  snapshot: CommanderFormatLegalitySnapshot;
  legalityAsOf?: string;
  checkedAt?: string;
  paperPopulationFrame?: string;
  nonCompetitiveReason?: string | null;
}): CommanderFormatLegalityAssessment {
  const legalityAsOf = input.legalityAsOf ?? input.snapshot.legalityAsOf;
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const asOfDate = parseIsoDate(legalityAsOf) ?? new Date();
  const classification = deriveCommanderClassification({
    name: input.card.canonicalName,
    typeLine: input.card.typeLine,
    oracleText: input.card.oracleText,
    colorIdentity: input.card.colorIdentity,
    legalities: input.card.legalities,
  });
  const structural = deriveStructuralFields(classification);
  const scryfallCommander = input.card.legalities?.commander?.toLowerCase() ?? null;
  const setPolicy = resolveSetPolicy(input.snapshot, input.card);
  const provenanceBase: CommanderLegalityProvenance = {
    legalitySource: "scryfall_golden_catalog_legalities",
    legalitySourceUpdatedAt:
      input.snapshot.catalogLegalityBulkUpdatedAt ?? input.card.evidence?.bulkUpdatedAt ?? input.card.updatedAt ?? null,
    legalityDerivedAt: checkedAt,
    catalogCommanderFormatStatus: classification.commanderFormatStatus,
    scryfallCommanderLegality: scryfallCommander,
  };

  if (input.paperPopulationFrame === "DIGITAL_ONLY" || setPolicy?.digitalOnly) {
    return {
      ...structural,
      currentCommanderFormatLegality: "DIGITAL_ONLY",
      configurationLegality: false,
      legalityEffectiveDate: null,
      legalityReason: "Oracle identity is digital-only in paper population frame.",
      legalitySource: "paper_population_frame",
      legalityCheckedAt: checkedAt,
      legalityAsOf,
      provenance: { ...provenanceBase, legalitySource: "paper_population_frame" },
      staleLegalityMetadata: false,
      liveCommanderLegal: false,
      previewTheorycraftPermitted: false,
    };
  }

  if (input.nonCompetitiveReason || setPolicy?.nonConstructed) {
    return {
      ...structural,
      currentCommanderFormatLegality: "NON_CONSTRUCTED",
      configurationLegality: false,
      legalityEffectiveDate: null,
      legalityReason: input.nonCompetitiveReason
        ? `Non-competitive frame: ${input.nonCompetitiveReason}`
        : `Non-Constructed set policy (${setPolicy?.setCode ?? "unknown"}).`,
      legalitySource: input.nonCompetitiveReason
        ? "non_competitive_frame_supplement"
        : "set_format_policy",
      legalityCheckedAt: checkedAt,
      legalityAsOf,
      provenance: {
        ...provenanceBase,
        legalitySource: input.nonCompetitiveReason
          ? "non_competitive_frame_supplement"
          : "set_format_policy",
      },
      staleLegalityMetadata: false,
      liveCommanderLegal: false,
      previewTheorycraftPermitted: false,
    };
  }

  if (
    input.snapshot.commanderBannedOracleIds.includes(input.card.oracleId) ||
    scryfallCommander === "banned"
  ) {
    return {
      ...structural,
      currentCommanderFormatLegality: "BANNED",
      configurationLegality: structural.structurallyCanBeCommander || structural.structurallyCanBePartOfCommandZone,
      legalityEffectiveDate: null,
      legalityReason: "Banned from Commander format (official Commander banned list).",
      legalitySource: "wizards_banned_policy",
      legalityCheckedAt: checkedAt,
      legalityAsOf,
      provenance: { ...provenanceBase, legalitySource: "wizards_banned_policy" },
      staleLegalityMetadata: false,
      liveCommanderLegal: false,
      previewTheorycraftPermitted: false,
    };
  }

  if (scryfallCommander === "legal" || scryfallCommander === "restricted") {
    return {
      ...structural,
      currentCommanderFormatLegality: "LEGAL",
      configurationLegality: structural.structuralCommandZoneEligibility === "ELIGIBLE",
      legalityEffectiveDate: setPolicy?.releasedAt ?? input.card.releaseInformation?.releasedAt ?? null,
      legalityReason: "Commander format legal per reconciled catalog legality.",
      legalitySource: "scryfall_golden_catalog_legalities",
      legalityCheckedAt: checkedAt,
      legalityAsOf,
      provenance: provenanceBase,
      staleLegalityMetadata: false,
      liveCommanderLegal:
        structural.structuralCommandZoneEligibility === "ELIGIBLE" &&
        (structural.structurallyCanBeCommander || structural.structurallyCanBePartOfCommandZone),
      previewTheorycraftPermitted: true,
    };
  }

  if (setPolicy?.commanderLegalFromPrerelease && setPolicy.prereleaseAt && setPolicy.releasedAt) {
    const pastPrerelease = isOnOrAfter(asOfDate, setPolicy.prereleaseAt);
    const beforeMainRelease = !isOnOrAfter(asOfDate, setPolicy.releasedAt);
    if (
      pastPrerelease &&
      beforeMainRelease &&
      structural.structuralCommandZoneEligibility === "ELIGIBLE"
    ) {
      return {
        ...structural,
        currentCommanderFormatLegality: "LEGAL",
        configurationLegality: true,
        legalityEffectiveDate: setPolicy.prereleaseAt,
        legalityReason: `${setPolicy.setName}: explicit Commander tabletop policy legal from prerelease ${setPolicy.prereleaseAt}; catalog Scryfall still not_legal until main release ${setPolicy.releasedAt}.`,
        legalitySource: "set_format_policy",
        legalityCheckedAt: checkedAt,
        legalityAsOf,
        provenance: { ...provenanceBase, legalitySource: "set_format_policy" },
        staleLegalityMetadata: scryfallCommander === "not_legal",
        liveCommanderLegal: true,
        previewTheorycraftPermitted: true,
      };
    }
  }

  const releasedAt = setPolicy?.releasedAt ?? input.card.releaseInformation?.releasedAt;
  if (releasedAt && !isOnOrAfter(asOfDate, releasedAt)) {
    return {
      ...structural,
      currentCommanderFormatLegality: "NOT_YET_LEGAL",
      configurationLegality: false,
      legalityEffectiveDate: setPolicy?.prereleaseAt ?? releasedAt,
      legalityReason: `Main set release ${releasedAt} not yet reached at legalityAsOf.`,
      legalitySource: "set_release_timing",
      legalityCheckedAt: checkedAt,
      legalityAsOf,
      provenance: { ...provenanceBase, legalitySource: "set_release_timing" },
      staleLegalityMetadata: false,
      liveCommanderLegal: false,
      previewTheorycraftPermitted: structural.structuralCommandZoneEligibility === "ELIGIBLE",
    };
  }

  if (scryfallCommander === "not_legal") {
    return {
      ...structural,
      currentCommanderFormatLegality: "UNKNOWN",
      configurationLegality: false,
      legalityEffectiveDate: null,
      legalityReason:
        "Scryfall reports not_legal without a reconciled set-format policy or release timing classification.",
      legalitySource: "scryfall_golden_catalog_legalities",
      legalityCheckedAt: checkedAt,
      legalityAsOf,
      provenance: provenanceBase,
      staleLegalityMetadata: false,
      liveCommanderLegal: false,
      previewTheorycraftPermitted: false,
    };
  }

  return {
    ...structural,
    currentCommanderFormatLegality: "UNKNOWN",
    configurationLegality: false,
    legalityEffectiveDate: null,
    legalityReason: "Commander legality could not be determined from snapshot precedence.",
    legalitySource: "structural_oracle_classification",
    legalityCheckedAt: checkedAt,
    legalityAsOf,
    provenance: { ...provenanceBase, legalitySource: "structural_oracle_classification" },
    staleLegalityMetadata: false,
    liveCommanderLegal: false,
    previewTheorycraftPermitted: false,
  };
}
