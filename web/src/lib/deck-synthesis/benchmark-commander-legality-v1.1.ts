/**
 * Benchmark commander legality v1.1 — structural vs format split with provenance.
 *
 * Accepted final benchmark-eligibility model (2026-08-12).
 * Uses versioned commander-format-legality snapshot for deterministic product legality.
 */
import {
  assessCommanderFormatLegality,
  COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION,
  LEGALITY_SOURCE_PRECEDENCE,
  loadCommanderFormatLegalitySnapshot,
  type CommanderFormatLegalitySnapshot,
  type CurrentCommanderFormatLegality,
  type LegalitySource,
  type SetCommanderFormatPolicy,
  type StructuralCommandZoneEligibility,
} from "@/lib/deck-builder/commander-format-legality-snapshot-v1";
import {
  deriveCommanderClassification,
  type CommanderClassification,
} from "@/lib/deck-builder/commander-classification";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  auditBenchmarkCaseEligibility,
  benchmarkPartnerPairCompatible,
  inferBenchmarkCommandZoneConfiguration,
  type BenchmarkCaseEligibilityAudit,
  type BenchmarkCommandZoneConfiguration,
} from "./benchmark-commander-eligibility-v1";
import { resolveBenchmarkCommanderOracleIds } from "./benchmark-commander-resolver-v1";

export const BENCHMARK_COMMANDER_LEGALITY_VERSION = "benchmark-commander-legality-v1.1" as const;
export const BENCHMARK_COMMANDER_LEGALITY_ONTOLOGY_STATUS = "FROZEN" as const;

export type {
  StructuralCommandZoneEligibility,
  CurrentCommanderFormatLegality,
  LegalitySource,
  SetCommanderFormatPolicy,
  CommanderFormatLegalitySnapshot,
};
export { LEGALITY_SOURCE_PRECEDENCE, COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION };

export type BenchmarkMode = "LIVE_COMMANDER" | "PREVIEW_THEORYCRAFT" | "SEMANTIC_ONLY_QA";

export type BenchmarkEligibilityRootCause =
  | "BANNED_COMMANDER"
  | "NON_CONSTRUCTED_ACORN"
  | "DIGITAL_ONLY"
  | "NOT_YET_LEGAL"
  | "STALE_LEGALITY_METADATA"
  | "CANNOT_OCCUPY_COMMAND_ZONE"
  | "INVALID_PARTNER_CONFIGURATION"
  | "INVALID_BACKGROUND_CONFIGURATION"
  | "INVALID_DOCTORS_COMPANION_CONFIGURATION"
  | "OTHER";

/** @deprecated Use setFormatPolicies in commander-format-legality-snapshot-v1.json */
export const SET_PRERELEASE_CALENDAR: Record<
  string,
  { setName: string; prereleaseAt: string; releasedAt: string }
> = {
  hob: {
    setName: "The Hobbit",
    prereleaseAt: "2026-08-07",
    releasedAt: "2026-08-14",
  },
};


export { loadCommanderFormatLegalitySnapshot };

export function buildDefaultCommanderFormatLegalitySnapshot(input: {
  catalog: DeckResolutionCatalog;
  legalityAsOf?: string;
}): CommanderFormatLegalitySnapshot {
  const commanderBannedOracleIds: string[] = [];
  let bulkUpdatedAt: string | null = null;

  for (const card of input.catalog.byOracleId.values()) {
    if (card.legalities?.commander?.toLowerCase() === "banned") {
      commanderBannedOracleIds.push(card.oracleId);
    }
    bulkUpdatedAt ??= card.evidence?.bulkUpdatedAt ?? card.updatedAt ?? null;
  }

  return {
    version: COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    legalityAsOf: input.legalityAsOf ?? new Date().toISOString(),
    catalogLegalityBulkUpdatedAt: bulkUpdatedAt,
    sourcePrecedence: [...LEGALITY_SOURCE_PRECEDENCE],
    commanderBannedOracleIds: [...new Set(commanderBannedOracleIds)].sort(),
    setFormatPolicies: [
      {
        setCode: "hob",
        setName: "The Hobbit",
        prereleaseAt: "2026-08-07",
        releasedAt: "2026-08-14",
        commanderLegalFromPrerelease: true,
        policyNote:
          "Wizards tabletop Commander legality begins at prerelease for this product; catalog Scryfall lags until main release.",
      },
      {
        setCode: "unf",
        setName: "Unfinity",
        releasedAt: "2022-10-07",
        nonConstructed: true,
        policyNote: "Acorn/non-Constructed Unfinity product.",
      },
      {
        setCode: "unk",
        setName: "Unknown Event",
        releasedAt: "2023-07-29",
        nonConstructed: true,
        policyNote: "Playtest/non-Constructed Unknown Event product.",
      },
    ],
    notes: [
      "commanderLegalFromPrerelease is explicit per-set policy — never inferred globally.",
      "Structural eligibility remains independent from format legality snapshots.",
    ],
  };
}

export type CommanderLegalityProvenance = import("@/lib/deck-builder/commander-format-legality-snapshot-v1").CommanderLegalityProvenance;
export type CommanderLegalityAssessment = import("@/lib/deck-builder/commander-format-legality-snapshot-v1").CommanderFormatLegalityAssessment;

export type BenchmarkMemberLegalityAuditV11 = {
  benchmarkInputName: string;
  role: string;
  oracleId: string | null;
  canonicalName: string | null;
  paperEligible: boolean;
  legality: CommanderLegalityAssessment | null;
  classification: CommanderClassification | null;
  canBeSoleCommander: boolean;
  canBePartOfCommandZone: boolean;
};

export type BenchmarkCaseLegalityAuditV11 = {
  caseId: string;
  set: string;
  commandZoneIdentity: string;
  commandZoneConfiguration: BenchmarkCommandZoneConfiguration;
  benchmarkMode: BenchmarkMode;
  benchmarkSelectionAt: string | null;
  benchmarkEvaluationAt: string | null;
  legalityAsOf: string;
  members: BenchmarkMemberLegalityAuditV11[];
  paperEligible: boolean;
  structuralCommandZoneEligibility: StructuralCommandZoneEligibility;
  currentCommanderFormatLegality: CurrentCommanderFormatLegality;
  legalityReason: string;
  canBeSoleCommander: boolean;
  canBePartOfCommandZone: boolean;
  configurationLegal: boolean;
  configurationFailureReason: string | null;
  rootCause: BenchmarkEligibilityRootCause;
  v1DiagnosticInvalid: boolean;
  v11LiveCommanderValid: boolean;
  v11PreviewTheorycraftValid: boolean;
  v11SemanticOnlyValid: boolean;
  discoveryDenominatorEligibleLive: boolean;
  provenance: CommanderLegalityProvenance[];
  detail: string;
};

export function assessCommanderLegality(input: {
  catalog: DeckResolutionCatalog;
  card: GoldenCatalogOracleCard;
  legalityAsOf?: string;
  checkedAt?: string;
  snapshot?: CommanderFormatLegalitySnapshot;
}): CommanderLegalityAssessment {
  const snapshot =
    input.snapshot ??
    loadCommanderFormatLegalitySnapshot() ??
    buildDefaultCommanderFormatLegalitySnapshot({
      catalog: input.catalog,
      legalityAsOf: input.legalityAsOf,
    });
  const paper = paperMetaForOracle(input.catalog, input.card.oracleId);
  const assessment = assessCommanderFormatLegality({
    card: input.card,
    snapshot: {
      ...snapshot,
      legalityAsOf: input.legalityAsOf ?? snapshot.legalityAsOf,
    },
    legalityAsOf: input.legalityAsOf,
    checkedAt: input.checkedAt,
    paperPopulationFrame: paper.paperPopulationFrame,
    nonCompetitiveReason: input.catalog.nonCompetitiveOracleReasons.get(input.card.oracleId) ?? null,
  });
  return assessment;
}

function classifyConfigurationRootCause(input: {
  v1Audit: BenchmarkCaseEligibilityAudit;
  members: BenchmarkMemberLegalityAuditV11[];
  configuration: BenchmarkCommandZoneConfiguration;
  catalog: DeckResolutionCatalog;
}): {
  rootCause: BenchmarkEligibilityRootCause;
  configurationLegal: boolean;
  configurationFailureReason: string | null;
} {
  const { v1Audit, members, configuration, catalog } = input;

  if (v1Audit.benchmarkValid) {
    return { rootCause: "OTHER", configurationLegal: true, configurationFailureReason: null };
  }

  if (configuration === "single_commander") {
    const member = members[0];
    if (!member) {
      return { rootCause: "OTHER", configurationLegal: false, configurationFailureReason: v1Audit.detail };
    }
    if (member.legality?.currentCommanderFormatLegality === "BANNED") {
      return {
        rootCause: "BANNED_COMMANDER",
        configurationLegal: false,
        configurationFailureReason: member.legality.legalityReason,
      };
    }
    if (member.legality?.currentCommanderFormatLegality === "NON_CONSTRUCTED") {
      return {
        rootCause: "NON_CONSTRUCTED_ACORN",
        configurationLegal: false,
        configurationFailureReason: member.legality.legalityReason,
      };
    }
    if (member.legality?.currentCommanderFormatLegality === "DIGITAL_ONLY") {
      return {
        rootCause: "DIGITAL_ONLY",
        configurationLegal: false,
        configurationFailureReason: member.legality.legalityReason,
      };
    }
    if (member.legality?.staleLegalityMetadata) {
      return {
        rootCause: "STALE_LEGALITY_METADATA",
        configurationLegal: member.legality.liveCommanderLegal,
        configurationFailureReason: member.legality.liveCommanderLegal
          ? null
          : member.legality.legalityReason,
      };
    }
    if (member.legality?.currentCommanderFormatLegality === "NOT_YET_LEGAL") {
      return {
        rootCause: "NOT_YET_LEGAL",
        configurationLegal: false,
        configurationFailureReason: member.legality.legalityReason,
      };
    }
    if (v1Audit.invalidReason === "INVALID_SOLE_COMMANDER") {
      if (member.classification?.pairingMechanic === "doctors_companion") {
        return {
          rootCause: "INVALID_DOCTORS_COMPANION_CONFIGURATION",
          configurationLegal: false,
          configurationFailureReason: v1Audit.detail,
        };
      }
      if (member.classification?.eligibilityBasis === "background_configuration") {
        return {
          rootCause: "INVALID_BACKGROUND_CONFIGURATION",
          configurationLegal: false,
          configurationFailureReason: v1Audit.detail,
        };
      }
      return {
        rootCause: "CANNOT_OCCUPY_COMMAND_ZONE",
        configurationLegal: false,
        configurationFailureReason: v1Audit.detail,
      };
    }
    if (v1Audit.invalidReason === "CANNOT_OCCUPY_COMMAND_ZONE") {
      return {
        rootCause: "CANNOT_OCCUPY_COMMAND_ZONE",
        configurationLegal: false,
        configurationFailureReason: v1Audit.detail,
      };
    }
  }

  if (configuration === "partner_pair") {
    const failing = members.find((m) => v1Audit.members.find((vm) => vm.benchmarkInputName === m.benchmarkInputName && !vm.eligible));
    if (failing?.legality?.currentCommanderFormatLegality === "NON_CONSTRUCTED") {
      return {
        rootCause: "NON_CONSTRUCTED_ACORN",
        configurationLegal: false,
        configurationFailureReason: failing.legality.legalityReason,
      };
    }
    if (v1Audit.invalidReason === "INVALID_PARTNER_MEMBER") {
      return {
        rootCause: "INVALID_PARTNER_CONFIGURATION",
        configurationLegal: false,
        configurationFailureReason: v1Audit.detail,
      };
    }
    if (v1Audit.invalidReason === "PARTNER_PAIR_INCOMPATIBLE") {
      return {
        rootCause: "INVALID_PARTNER_CONFIGURATION",
        configurationLegal: false,
        configurationFailureReason: v1Audit.detail,
      };
    }
    const legalityFail = members.find(
      (m) =>
        m.legality &&
        !m.legality.liveCommanderLegal &&
        m.legality.currentCommanderFormatLegality !== "NOT_YET_LEGAL",
    );
    if (legalityFail?.legality) {
      const cause: BenchmarkEligibilityRootCause =
        legalityFail.legality.currentCommanderFormatLegality === "BANNED"
          ? "BANNED_COMMANDER"
          : legalityFail.legality.currentCommanderFormatLegality === "DIGITAL_ONLY"
            ? "DIGITAL_ONLY"
            : legalityFail.legality.staleLegalityMetadata
              ? "STALE_LEGALITY_METADATA"
              : "NON_CONSTRUCTED_ACORN";
      return {
        rootCause: cause,
        configurationLegal: false,
        configurationFailureReason: legalityFail.legality.legalityReason,
      };
    }
    const pair = benchmarkPartnerPairCompatible(
      catalog,
      members[0]?.oracleId ?? "",
      members[1]?.oracleId ?? "",
    );
    if (!pair.compatible) {
      return {
        rootCause: "INVALID_PARTNER_CONFIGURATION",
        configurationLegal: false,
        configurationFailureReason: pair.reason,
      };
    }
  }

  if (configuration === "commander_with_background") {
    const bg = members.find((m) => m.role === "background");
    if (bg?.legality?.currentCommanderFormatLegality === "NON_CONSTRUCTED") {
      return {
        rootCause: "NON_CONSTRUCTED_ACORN",
        configurationLegal: false,
        configurationFailureReason: bg.legality.legalityReason,
      };
    }
    if (bg?.legality && !bg.legality.liveCommanderLegal) {
      return {
        rootCause: "INVALID_BACKGROUND_CONFIGURATION",
        configurationLegal: false,
        configurationFailureReason: `${bg.benchmarkInputName}: ${bg.legality.legalityReason}`,
      };
    }
    if (v1Audit.invalidReason === "INVALID_BACKGROUND_MEMBER" || v1Audit.invalidReason === "INVALID_COMMANDER_FOR_BACKGROUND") {
      return {
        rootCause: "INVALID_BACKGROUND_CONFIGURATION",
        configurationLegal: false,
        configurationFailureReason: v1Audit.detail,
      };
    }
  }

  return {
    rootCause: "OTHER",
    configurationLegal: false,
    configurationFailureReason: v1Audit.detail,
  };
}

export function auditBenchmarkCaseLegalityV11(input: {
  catalog: DeckResolutionCatalog;
  caseId: string;
  set: string;
  commanders: string[];
  commandZoneConfiguration?: string;
  benchmarkMode?: BenchmarkMode;
  legalityAsOf?: string;
  benchmarkSelectionAt?: string | null;
  benchmarkEvaluationAt?: string | null;
  checkedAt?: string;
}): BenchmarkCaseLegalityAuditV11 {
  const benchmarkMode = input.benchmarkMode ?? "LIVE_COMMANDER";
  const legalityAsOf = input.legalityAsOf ?? new Date().toISOString();
  const checkedAt = input.checkedAt ?? new Date().toISOString();

  const v1Audit = auditBenchmarkCaseEligibility({
    catalog: input.catalog,
    caseId: input.caseId,
    set: input.set,
    commanders: input.commanders,
    commandZoneConfiguration: input.commandZoneConfiguration,
  });

  const configuration = inferBenchmarkCommandZoneConfiguration({
    catalog: input.catalog,
    commanders: input.commanders,
    explicit: input.commandZoneConfiguration,
  });

  const members: BenchmarkMemberLegalityAuditV11[] = v1Audit.members.map((m) => {
    const card = m.oracleId ? input.catalog.byOracleId.get(m.oracleId) ?? null : null;
    const legality = card
      ? assessCommanderLegality({
          catalog: input.catalog,
          card,
          legalityAsOf,
          checkedAt,
        })
      : null;
    const classification = card
      ? deriveCommanderClassification({
          name: card.canonicalName,
          typeLine: card.typeLine,
          oracleText: card.oracleText,
          colorIdentity: card.colorIdentity,
          legalities: card.legalities,
        })
      : null;

    return {
      benchmarkInputName: m.benchmarkInputName,
      role: m.role,
      oracleId: m.oracleId,
      canonicalName: m.canonicalName,
      paperEligible: m.paperEligible,
      legality,
      classification,
      canBeSoleCommander: legality?.structurallyCanBeCommander ?? false,
      canBePartOfCommandZone: legality?.structurallyCanBePartOfCommandZone ?? false,
    };
  });

  const { rootCause, configurationLegal, configurationFailureReason } = classifyConfigurationRootCause({
    v1Audit,
    members,
    configuration,
    catalog: input.catalog,
  });

  const primaryLegality = members[0]?.legality;
  const allPaperEligible = members.every((m) => m.paperEligible);
  const allStructuralEligible =
    members.length > 0 &&
    members.every((m) => m.legality?.structuralCommandZoneEligibility === "ELIGIBLE");
  const allLiveLegal =
    members.length > 0 && members.every((m) => m.legality?.liveCommanderLegal ?? false);

  const structuralCommandZoneEligibility: StructuralCommandZoneEligibility = allStructuralEligible
    ? "ELIGIBLE"
    : "INELIGIBLE";

  const v11LiveCommanderValid =
    configurationLegal &&
    allPaperEligible &&
    allStructuralEligible &&
    allLiveLegal &&
    rootCause !== "BANNED_COMMANDER" &&
    rootCause !== "NON_CONSTRUCTED_ACORN" &&
    rootCause !== "DIGITAL_ONLY" &&
    rootCause !== "CANNOT_OCCUPY_COMMAND_ZONE" &&
    rootCause !== "INVALID_PARTNER_CONFIGURATION" &&
    rootCause !== "INVALID_BACKGROUND_CONFIGURATION" &&
    rootCause !== "INVALID_DOCTORS_COMPANION_CONFIGURATION";

  const v11PreviewTheorycraftValid =
    allPaperEligible &&
    allStructuralEligible &&
    members.every((m) => m.legality?.previewTheorycraftPermitted ?? false) &&
    rootCause !== "NON_CONSTRUCTED_ACORN" &&
    rootCause !== "DIGITAL_ONLY" &&
    rootCause !== "CANNOT_OCCUPY_COMMAND_ZONE" &&
    rootCause !== "INVALID_PARTNER_CONFIGURATION" &&
    rootCause !== "INVALID_BACKGROUND_CONFIGURATION" &&
    rootCause !== "INVALID_DOCTORS_COMPANION_CONFIGURATION";

  const v11SemanticOnlyValid = allPaperEligible && members.every((m) => m.oracleId);

  const worstFormatLegality: CurrentCommanderFormatLegality =
    members.find((m) => m.legality?.staleLegalityMetadata)?.legality?.currentCommanderFormatLegality ??
    primaryLegality?.currentCommanderFormatLegality ??
    "UNKNOWN";

  return {
    caseId: input.caseId,
    set: input.set,
    commandZoneIdentity: v1Audit.commandZoneIdentity,
    commandZoneConfiguration: configuration,
    benchmarkMode,
    benchmarkSelectionAt: input.benchmarkSelectionAt ?? null,
    benchmarkEvaluationAt: input.benchmarkEvaluationAt ?? null,
    legalityAsOf,
    members,
    paperEligible: allPaperEligible,
    structuralCommandZoneEligibility,
    currentCommanderFormatLegality: worstFormatLegality,
    legalityReason: configurationFailureReason ?? primaryLegality?.legalityReason ?? v1Audit.detail,
    canBeSoleCommander: members.every((m) => {
      if (configuration === "single_commander") return m.canBeSoleCommander;
      if (configuration === "commander_with_background" && m.role !== "background") return m.canBeSoleCommander;
      return true;
    }),
    canBePartOfCommandZone: members.every((m) => m.canBePartOfCommandZone || m.canBeSoleCommander),
    configurationLegal,
    configurationFailureReason,
    rootCause,
    v1DiagnosticInvalid: !v1Audit.benchmarkValid,
    v11LiveCommanderValid,
    v11PreviewTheorycraftValid,
    v11SemanticOnlyValid,
    discoveryDenominatorEligibleLive: benchmarkMode === "LIVE_COMMANDER" ? v11LiveCommanderValid : false,
    provenance: members.map((m) => m.legality?.provenance).filter(Boolean) as CommanderLegalityProvenance[],
    detail: v1Audit.detail,
  };
}

export function scanStalePrereleaseLegalityCohort(input: {
  catalog: DeckResolutionCatalog;
  setCode: string;
  legalityAsOf?: string;
}): Array<{
  oracleId: string;
  canonicalName: string;
  scryfallCommanderLegality: string | null;
  releasedAt: string | null;
  prereleaseAt: string | null;
  structuralCommandZoneEligibility: StructuralCommandZoneEligibility;
  staleLegalityMetadata: boolean;
  liveCommanderLegal: boolean;
}> {
  const legalityAsOf = input.legalityAsOf ?? new Date().toISOString();
  const setCode = input.setCode.toLowerCase();
  const out: ReturnType<typeof scanStalePrereleaseLegalityCohort> = [];

  for (const card of input.catalog.byOracleId.values()) {
    if (card.releaseInformation?.setCode?.toLowerCase() !== setCode) continue;
    const assessment = assessCommanderLegality({
      catalog: input.catalog,
      card,
      legalityAsOf,
    });
    if (assessment.staleLegalityMetadata || assessment.currentCommanderFormatLegality === "NOT_YET_LEGAL") {
      out.push({
        oracleId: card.oracleId,
        canonicalName: card.canonicalName,
        scryfallCommanderLegality: card.legalities?.commander ?? null,
        releasedAt: card.releaseInformation?.releasedAt ?? null,
        prereleaseAt: SET_PRERELEASE_CALENDAR[setCode]?.prereleaseAt ?? null,
        structuralCommandZoneEligibility: assessment.structuralCommandZoneEligibility,
        staleLegalityMetadata: assessment.staleLegalityMetadata,
        liveCommanderLegal: assessment.liveCommanderLegal,
      });
    }
  }

  return out.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

export function resolveBenchmarkCommanderNames(input: {
  catalog: DeckResolutionCatalog;
  commanders: string[];
}): string[] {
  return resolveBenchmarkCommanderOracleIds(input.catalog, input.commanders).oracleIds;
}
