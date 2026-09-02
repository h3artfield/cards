/**
 * Benchmark commander eligibility preflight — Phase 5 benchmark integrity (P0).
 *
 * Every command-zone identity must pass the same deterministic eligibility
 * checks used for product Commander deck validation framing.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import {
  deriveCommanderClassification,
  type CommanderClassification,
} from "@/lib/deck-builder/commander-classification";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  benchmarkCommanderResolutionPreflight,
  resolveBenchmarkCommanderOracleIds,
  type BenchmarkCommanderResolutionAudit,
} from "./benchmark-commander-resolver-v1";

export {
  benchmarkCaseAccounting,
  benchmarkCommanderResolutionPreflight,
  resolveBenchmarkCommanderOracleIds,
} from "./benchmark-commander-resolver-v1";

export type BenchmarkCommandZoneConfiguration =
  | "single_commander"
  | "partner_pair"
  | "commander_with_background";

export type BenchmarkEligibilityInvalidReason =
  | "UNRESOLVED_IDENTITY"
  | "AMBIGUOUS_RESOLUTION"
  | "NOT_PAPER_ELIGIBLE"
  | "COMMANDER_FORMAT_NOT_LEGAL"
  | "CANNOT_OCCUPY_COMMAND_ZONE"
  | "INVALID_SOLE_COMMANDER"
  | "INVALID_PARTNER_MEMBER"
  | "INVALID_BACKGROUND_MEMBER"
  | "INVALID_COMMANDER_FOR_BACKGROUND"
  | "PARTNER_PAIR_INCOMPATIBLE"
  | "INVALID_CONFIGURATION_CARD_COUNT"
  | "INVALID_BENCHMARK_CONFIGURATION";

export type BenchmarkMemberEligibilityAudit = {
  benchmarkInputName: string;
  role: "sole_commander" | "partner_member" | "commander_with_background" | "background";
  resolution: BenchmarkCommanderResolutionAudit;
  oracleId: string | null;
  canonicalName: string | null;
  paperEligible: boolean;
  commanderFormatLegal: boolean;
  commanderFormatStatus: CommanderClassification["commanderFormatStatus"];
  structurallyEligible: boolean;
  canOccupyCommandZone: boolean;
  canBeSoleCommander: boolean;
  canBePartOfCommandZone: boolean;
  pairingMechanic: CommanderClassification["pairingMechanic"];
  eligible: boolean;
  invalidReason: BenchmarkEligibilityInvalidReason | null;
  detail: string;
};

export type BenchmarkCaseEligibilityAudit = {
  caseId: string;
  set: string;
  commandZoneConfiguration: BenchmarkCommandZoneConfiguration;
  commandZoneIdentity: string;
  members: BenchmarkMemberEligibilityAudit[];
  configurationLegal: boolean;
  benchmarkValid: boolean;
  invalidReason: BenchmarkEligibilityInvalidReason | null;
  detail: string;
  /** Excluded from Commander-discovery accuracy denominators when false. */
  discoveryDenominatorEligible: boolean;
  benchmarkIntegrityLabel: "VALID_BENCHMARK_CONFIGURATION" | "INVALID_BENCHMARK_CONFIGURATION";
};

export type BenchmarkCommanderEligibilityPreflightResult = {
  pass: boolean;
  totalCases: number;
  validCases: number;
  invalidCases: number;
  caseAudits: BenchmarkCaseEligibilityAudit[];
  invalidCaseIds: string[];
};

function isBackgroundCard(card: GoldenCatalogOracleCard): boolean {
  return (card.typeLine ?? "").toLowerCase().includes("background");
}

function commanderFormatLegal(card: GoldenCatalogOracleCard): boolean {
  const classification = deriveCommanderClassification({
    name: card.canonicalName,
    typeLine: card.typeLine,
    oracleText: card.oracleText,
    colorIdentity: card.colorIdentity,
    legalities: card.legalities,
  });
  return classification.commanderFormatStatus === "legal";
}

function auditMember(input: {
  catalog: DeckResolutionCatalog;
  benchmarkInputName: string;
  role: BenchmarkMemberEligibilityAudit["role"];
  configuration: BenchmarkCommandZoneConfiguration;
}): BenchmarkMemberEligibilityAudit {
  const resolution = resolveBenchmarkCommanderOracleIds(input.catalog, [input.benchmarkInputName]).audits[0]!;
  const card = resolution.oracleId ? input.catalog.byOracleId.get(resolution.oracleId) ?? null : null;
  const paper = resolution.oracleId ? paperMetaForOracle(input.catalog, resolution.oracleId) : null;
  const classification = card
    ? deriveCommanderClassification({
        name: card.canonicalName,
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        colorIdentity: card.colorIdentity,
        legalities: card.legalities,
      })
    : undefined;

  const base: BenchmarkMemberEligibilityAudit = {
    benchmarkInputName: input.benchmarkInputName,
    role: input.role,
    resolution,
    oracleId: resolution.oracleId,
    canonicalName: card?.canonicalName ?? resolution.canonicalName,
    paperEligible: paper?.paperEligible ?? false,
    commanderFormatLegal: card ? commanderFormatLegal(card) : false,
    commanderFormatStatus: classification?.commanderFormatStatus ?? "unknown",
    structurallyEligible: classification?.structurallyEligible ?? false,
    canOccupyCommandZone: classification?.canOccupyCommandZone ?? false,
    canBeSoleCommander: classification?.canBeSoleCommander ?? false,
    canBePartOfCommandZone: classification?.canBePartOfCommandZone ?? false,
    pairingMechanic: classification?.pairingMechanic ?? null,
    eligible: false,
    invalidReason: null,
    detail: "",
  };

  if (!resolution.resolved || !resolution.oracleId || !card) {
    return {
      ...base,
      invalidReason: resolution.ambiguityHardFail ? "AMBIGUOUS_RESOLUTION" : "UNRESOLVED_IDENTITY",
      detail: resolution.rootCauseDetail,
    };
  }

  if (!paper?.paperEligible) {
    return {
      ...base,
      invalidReason: "NOT_PAPER_ELIGIBLE",
      detail: `Oracle identity not in paper-eligible study population (${paper?.paperPopulationFrame ?? "UNKNOWN"}).`,
    };
  }

  if (!commanderFormatLegal(card)) {
    const nonCompetitive = input.catalog.nonCompetitiveOracleReasons.get(resolution.oracleId);
    return {
      ...base,
      invalidReason: "COMMANDER_FORMAT_NOT_LEGAL",
      detail: nonCompetitive
        ? `Commander format status ${base.commanderFormatStatus}: ${nonCompetitive}`
        : `Commander format status ${base.commanderFormatStatus} — cannot occupy command zone in normal Commander.`,
    };
  }

  if (input.role === "background") {
    if (!isBackgroundCard(card)) {
      return {
        ...base,
        invalidReason: "INVALID_BACKGROUND_MEMBER",
        detail: "Second command-zone slot requires a Background enchantment.",
      };
    }
    if (!classification?.canBePartOfCommandZone) {
      return {
        ...base,
        invalidReason: "CANNOT_OCCUPY_COMMAND_ZONE",
        detail: classification?.reason ?? "Background cannot occupy command zone.",
      };
    }
    return { ...base, eligible: true, detail: "Background member eligible." };
  }

  if (!classification?.canOccupyCommandZone && !classification?.canBePartOfCommandZone && !classification?.canBeSoleCommander) {
    return {
      ...base,
      invalidReason: "CANNOT_OCCUPY_COMMAND_ZONE",
      detail: classification?.reason ?? "Card cannot occupy the command zone.",
    };
  }

  if (input.configuration === "single_commander") {
    if (!classification?.canBeSoleCommander) {
      return {
        ...base,
        invalidReason: "INVALID_SOLE_COMMANDER",
        detail: classification?.reason ?? "Card cannot be a sole commander.",
      };
    }
    return { ...base, eligible: true, detail: "Sole commander eligible." };
  }

  if (input.configuration === "partner_pair") {
    if (!classification?.canBePartOfCommandZone && !classification?.canBeSoleCommander) {
      return {
        ...base,
        invalidReason: "INVALID_PARTNER_MEMBER",
        detail: classification?.reason ?? "Partner member cannot occupy command zone.",
      };
    }
    if (classification?.pairingMechanic === "choose_background") {
      return {
        ...base,
        invalidReason: "INVALID_PARTNER_MEMBER",
        detail: "Choose-a-Background commander cannot occupy a generic partner pair slot.",
      };
    }
    if (classification?.pairingMechanic === "doctors_companion") {
      return {
        ...base,
        invalidReason: "INVALID_PARTNER_MEMBER",
        detail: "Doctor's companion requires a Doctor commander, not a generic partner pair.",
      };
    }
    return { ...base, eligible: true, detail: "Partner member eligible." };
  }

  // commander_with_background — commander slot
  if (!classification?.canBeSoleCommander) {
    return {
      ...base,
      invalidReason: "INVALID_COMMANDER_FOR_BACKGROUND",
      detail: classification?.reason ?? "Commander slot requires a legal sole commander.",
    };
  }
  if (classification.pairingMechanic !== "choose_background") {
    return {
      ...base,
      invalidReason: "INVALID_COMMANDER_FOR_BACKGROUND",
      detail: "Commander must have Choose a Background to pair with a Background.",
    };
  }
  return { ...base, eligible: true, detail: "Choose-a-Background commander eligible." };
}

export function benchmarkPartnerPairCompatible(
  catalog: DeckResolutionCatalog,
  aOracleId: string,
  bOracleId: string,
): { compatible: boolean; reason: string } {
  const a = catalog.byOracleId.get(aOracleId);
  const b = catalog.byOracleId.get(bOracleId);
  if (!a || !b) return { compatible: false, reason: "Missing oracle card for partner pair." };

  const ta = (a.oracleText ?? "").toLowerCase();
  const tb = (b.oracleText ?? "").toLowerCase();

  if (/friends forever/.test(ta) || /friends forever/.test(tb)) {
    const ok = /friends forever/.test(ta) && /friends forever/.test(tb);
    return ok
      ? { compatible: true, reason: "Friends forever pairing." }
      : { compatible: false, reason: "Friends forever requires both commanders to have Friends forever." };
  }

  const withA = ta.match(/partner with ([^.(\n]+)/);
  const withB = tb.match(/partner with ([^.(\n]+)/);
  if (withA) {
    const target = normalizeOracleName(withA[1].trim());
    const nb = normalizeOracleName(b.canonicalName);
    const ok = nb.includes(target) || target.includes(nb);
    return ok
      ? { compatible: true, reason: `Partner with ${b.canonicalName}.` }
      : { compatible: false, reason: `${a.canonicalName} partners only with ${withA[1].trim()}.` };
  }
  if (withB) {
    const target = normalizeOracleName(withB[1].trim());
    const na = normalizeOracleName(a.canonicalName);
    const ok = na.includes(target) || target.includes(na);
    return ok
      ? { compatible: true, reason: `Partner with ${a.canonicalName}.` }
      : { compatible: false, reason: `${b.canonicalName} partners only with ${withB[1].trim()}.` };
  }

  const genericPartner = /\bpartner\b/.test(ta) && /\bpartner\b/.test(tb);
  return genericPartner
    ? { compatible: true, reason: "Generic Partner pairing." }
    : { compatible: false, reason: "No compatible partner pairing mechanic between members." };
}

export function inferBenchmarkCommandZoneConfiguration(input: {
  catalog: DeckResolutionCatalog;
  commanders: string[];
  explicit?: string;
}): BenchmarkCommandZoneConfiguration {
  if (input.explicit === "partner_pair" || input.explicit === "commander_with_background" || input.explicit === "single_commander") {
    return input.explicit;
  }
  if (input.commanders.length <= 1) return "single_commander";
  const resolution = resolveBenchmarkCommanderOracleIds(input.catalog, input.commanders);
  if (resolution.oracleIds.length === 2) {
    const second = input.catalog.byOracleId.get(resolution.oracleIds[1]!);
    if (second && isBackgroundCard(second)) return "commander_with_background";
  }
  return "partner_pair";
}

export function auditBenchmarkCaseEligibility(input: {
  catalog: DeckResolutionCatalog;
  caseId: string;
  set: string;
  commanders: string[];
  commandZoneConfiguration?: string;
}): BenchmarkCaseEligibilityAudit {
  const configuration = inferBenchmarkCommandZoneConfiguration({
    catalog: input.catalog,
    commanders: input.commanders,
    explicit: input.commandZoneConfiguration,
  });

  const commandZoneIdentity = input.commanders.join(" + ");

  if (configuration === "single_commander" && input.commanders.length !== 1) {
    return {
      caseId: input.caseId,
      set: input.set,
      commandZoneConfiguration: configuration,
      commandZoneIdentity,
      members: [],
      configurationLegal: false,
      benchmarkValid: false,
      invalidReason: "INVALID_CONFIGURATION_CARD_COUNT",
      detail: `single_commander configuration requires exactly 1 commander (found ${input.commanders.length}).`,
      discoveryDenominatorEligible: false,
      benchmarkIntegrityLabel: "INVALID_BENCHMARK_CONFIGURATION",
    };
  }

  if (configuration === "partner_pair" && input.commanders.length !== 2) {
    return {
      caseId: input.caseId,
      set: input.set,
      commandZoneConfiguration: configuration,
      commandZoneIdentity,
      members: [],
      configurationLegal: false,
      benchmarkValid: false,
      invalidReason: "INVALID_CONFIGURATION_CARD_COUNT",
      detail: `partner_pair configuration requires exactly 2 commanders (found ${input.commanders.length}).`,
      discoveryDenominatorEligible: false,
      benchmarkIntegrityLabel: "INVALID_BENCHMARK_CONFIGURATION",
    };
  }

  if (configuration === "commander_with_background" && input.commanders.length !== 2) {
    return {
      caseId: input.caseId,
      set: input.set,
      commandZoneConfiguration: configuration,
      commandZoneIdentity,
      members: [],
      configurationLegal: false,
      benchmarkValid: false,
      invalidReason: "INVALID_CONFIGURATION_CARD_COUNT",
      detail: `commander_with_background configuration requires exactly 2 cards (found ${input.commanders.length}).`,
      discoveryDenominatorEligible: false,
      benchmarkIntegrityLabel: "INVALID_BENCHMARK_CONFIGURATION",
    };
  }

  const members: BenchmarkMemberEligibilityAudit[] =
    configuration === "single_commander"
      ? [
          auditMember({
            catalog: input.catalog,
            benchmarkInputName: input.commanders[0]!,
            role: "sole_commander",
            configuration,
          }),
        ]
      : configuration === "partner_pair"
        ? [
            auditMember({
              catalog: input.catalog,
              benchmarkInputName: input.commanders[0]!,
              role: "partner_member",
              configuration,
            }),
            auditMember({
              catalog: input.catalog,
              benchmarkInputName: input.commanders[1]!,
              role: "partner_member",
              configuration,
            }),
          ]
        : [
            auditMember({
              catalog: input.catalog,
              benchmarkInputName: input.commanders[0]!,
              role: "commander_with_background",
              configuration,
            }),
            auditMember({
              catalog: input.catalog,
              benchmarkInputName: input.commanders[1]!,
              role: "background",
              configuration,
            }),
          ];

  const memberFailure = members.find((m) => !m.eligible);
  if (memberFailure) {
    return {
      caseId: input.caseId,
      set: input.set,
      commandZoneConfiguration: configuration,
      commandZoneIdentity,
      members,
      configurationLegal: false,
      benchmarkValid: false,
      invalidReason: memberFailure.invalidReason ?? "INVALID_BENCHMARK_CONFIGURATION",
      detail: `${memberFailure.benchmarkInputName}: ${memberFailure.detail}`,
      discoveryDenominatorEligible: false,
      benchmarkIntegrityLabel: "INVALID_BENCHMARK_CONFIGURATION",
    };
  }

  if (configuration === "partner_pair") {
    const pair = benchmarkPartnerPairCompatible(
      input.catalog,
      members[0]!.oracleId!,
      members[1]!.oracleId!,
    );
    if (!pair.compatible) {
      return {
        caseId: input.caseId,
        set: input.set,
        commandZoneConfiguration: configuration,
        commandZoneIdentity,
        members,
        configurationLegal: false,
        benchmarkValid: false,
        invalidReason: "PARTNER_PAIR_INCOMPATIBLE",
        detail: pair.reason,
        discoveryDenominatorEligible: false,
        benchmarkIntegrityLabel: "INVALID_BENCHMARK_CONFIGURATION",
      };
    }
  }

  return {
    caseId: input.caseId,
    set: input.set,
    commandZoneConfiguration: configuration,
    commandZoneIdentity,
    members,
    configurationLegal: true,
    benchmarkValid: true,
    invalidReason: null,
    detail: "Command-zone configuration passes eligibility preflight.",
    discoveryDenominatorEligible: true,
    benchmarkIntegrityLabel: "VALID_BENCHMARK_CONFIGURATION",
  };
}

export function benchmarkCommanderEligibilityPreflight(input: {
  catalog: DeckResolutionCatalog;
  cases: Array<{
    id: string;
    commanders: string[];
    commandZoneConfiguration?: string;
  }>;
  set: string;
}): BenchmarkCommanderEligibilityPreflightResult {
  const resolutionPreflight = benchmarkCommanderResolutionPreflight({
    catalog: input.catalog,
    commanderNames: input.cases.flatMap((c) => c.commanders),
  });

  const caseAudits = input.cases.map((c) =>
    auditBenchmarkCaseEligibility({
      catalog: input.catalog,
      caseId: c.id,
      set: input.set,
      commanders: c.commanders,
      commandZoneConfiguration: c.commandZoneConfiguration,
    }),
  );

  const invalidCaseIds = caseAudits.filter((a) => !a.benchmarkValid).map((a) => a.caseId);

  return {
    pass: resolutionPreflight.pass && invalidCaseIds.length === 0,
    totalCases: caseAudits.length,
    validCases: caseAudits.filter((a) => a.benchmarkValid).length,
    invalidCases: invalidCaseIds.length,
    caseAudits,
    invalidCaseIds,
  };
}

/** Combined resolution + eligibility gate for benchmark sealing. */
export function benchmarkCommandZonePreflight(input: {
  catalog: DeckResolutionCatalog;
  cases: Array<{
    id: string;
    commanders: string[];
    commandZoneConfiguration?: string;
  }>;
  set: string;
}): {
  pass: boolean;
  resolution: ReturnType<typeof benchmarkCommanderResolutionPreflight>;
  eligibility: BenchmarkCommanderEligibilityPreflightResult;
} {
  const resolution = benchmarkCommanderResolutionPreflight({
    catalog: input.catalog,
    commanderNames: input.cases.flatMap((c) => c.commanders),
  });
  const eligibility = benchmarkCommanderEligibilityPreflight(input);
  return {
    pass: resolution.pass && eligibility.pass,
    resolution,
    eligibility,
  };
}
