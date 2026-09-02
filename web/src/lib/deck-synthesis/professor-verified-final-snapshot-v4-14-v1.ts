/**
 * Verified final snapshot v4.14 — metric truth bound to canonical deck fingerprint.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  computeDeckSnapshotV47,
  profileMapForSelected,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47, type FunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import { computeFinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";
import { classifyTutorCardV411 } from "./professor-tutor-discovery-v4-11-v1";

export const PROFESSOR_VERIFIED_FINAL_SNAPSHOT_V4_14_V1_VERSION = "professor-verified-final-snapshot-v4-14-v1";

export type RoleCountMetricsV414 = {
  rawCount: number;
  uniqueSources: number;
  weightedCoverage: number;
  repeatableSources: number;
  conditionalSources: number;
};

export type InteractionQualityV414 = {
  count: number;
  instantSpeed: number;
  avgManaValue: number;
  targetBreadth: number;
  cards: string[];
};

export type ProtectionQualityV414 = {
  count: number;
  boardProtection: number;
  stackProtection: number;
  commanderProtection: number;
  cards: string[];
};

export type AccelerationProfileV414 = {
  total: number;
  fastMana: number;
  earlyAcceleration: number;
  midgameRamp: number;
  landRamp: number;
  avgManaValue: number;
  byManaValue: Record<string, number>;
};

export type VerifiedDeckSnapshotV414 = {
  version: typeof PROFESSOR_VERIFIED_FINAL_SNAPSHOT_V4_14_V1_VERSION;
  deckFingerprint: string;
  snapshotFingerprint: string;
  interaction: RoleCountMetricsV414 & { quality: InteractionQualityV414 };
  protection: RoleCountMetricsV414 & { quality: ProtectionQualityV414 };
  tutors: RoleCountMetricsV414;
  acceleration: AccelerationProfileV414;
  cardAdvantage: RoleCountMetricsV414;
  profilesHydrated: number;
};

const FAST_MANA_NAMES = /sol ring|mana crypt|chrome mox|mox diamond|jeweled lotus|lotus petal|dockside|grim monolith|mana vault|ritual|seething/i;

function snapshotFingerprint(profiles: FunctionalCardProfileV47[]): string {
  const roles = profiles
    .flatMap((p) => p.roles)
    .sort()
    .join(",");
  return `${profiles.length}:${roles.slice(0, 64)}`;
}

function roleMetrics(profiles: FunctionalCardProfileV47[], role: string): RoleCountMetricsV414 {
  const matching = profiles.filter((p) => p.roles.includes(role as FunctionalCardProfileV47["roles"][number]));
  const unique = new Set(matching.map((p) => p.oracleId));
  const weighted = matching.reduce((acc, p) => acc + 1 / Math.max(p.roles.length, 1), 0);
  const repeatable = matching.filter((p) => /whenever|each turn|at the beginning/.test(p.exactOracleText.toLowerCase())).length;
  const conditional = matching.filter((p) => /if |when |unless /.test(p.exactOracleText.toLowerCase())).length;
  return {
    rawCount: matching.length,
    uniqueSources: unique.size,
    weightedCoverage: Math.round(weighted * 100) / 100,
    repeatableSources: repeatable,
    conditionalSources: conditional,
  };
}

function buildInteractionQuality(profiles: FunctionalCardProfileV47[]): InteractionQualityV414 {
  const cards = profiles.filter((p) => p.roles.includes("interaction"));
  let instantSpeed = 0;
  let mvSum = 0;
  let breadth = 0;
  for (const p of cards) {
    const text = p.exactOracleText.toLowerCase();
    if (/instant|flash/.test(p.typeLine.toLowerCase())) instantSpeed++;
    mvSum += p.manaValue;
    if (/any target|destroy target|exile target/.test(text)) breadth++;
  }
  return {
    count: cards.length,
    instantSpeed,
    avgManaValue: cards.length ? Math.round((mvSum / cards.length) * 100) / 100 : 0,
    targetBreadth: breadth,
    cards: cards.map((p) => p.name),
  };
}

function buildProtectionQuality(profiles: FunctionalCardProfileV47[]): ProtectionQualityV414 {
  const cards = profiles.filter((p) => p.roles.includes("protection"));
  let board = 0;
  let stack = 0;
  let commander = 0;
  for (const p of cards) {
    const text = p.exactOracleText.toLowerCase();
    if (/hexproof|indestructible|prevent all damage|can't be destroyed/.test(text)) board++;
    if (/counter target/.test(text)) stack++;
    if (/commander|hexproof.*commander|shield/.test(text)) commander++;
  }
  return {
    count: cards.length,
    boardProtection: board,
    stackProtection: stack,
    commanderProtection: commander,
    cards: cards.map((p) => p.name),
  };
}

function buildAccelerationProfile(profiles: FunctionalCardProfileV47[]): AccelerationProfileV414 {
  const ramp = profiles.filter((p) => p.roles.includes("ramp") && !p.roles.includes("land"));
  const byMv: Record<string, number> = {};
  let fastMana = 0;
  let early = 0;
  let mid = 0;
  let landRamp = 0;
  let mvSum = 0;
  for (const p of ramp) {
    const mv = p.manaValue;
    byMv[String(mv)] = (byMv[String(mv)] ?? 0) + 1;
    mvSum += mv;
    if (FAST_MANA_NAMES.test(p.name.toLowerCase())) fastMana++;
    else if (mv <= 2) early++;
    else if (mv <= 4) mid++;
    if (p.roles.includes("land") || /search your library for a .* land/.test(p.exactOracleText.toLowerCase())) landRamp++;
  }
  return {
    total: ramp.length,
    fastMana,
    earlyAcceleration: early,
    midgameRamp: mid,
    landRamp,
    avgManaValue: ramp.length ? Math.round((mvSum / ramp.length) * 100) / 100 : 0,
    byManaValue: byMv,
  };
}

export function hydrateAndVerifyDeckStateV414(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
}): ProfessorCouncilStateV47 {
  const functionalProfiles = profileMapForSelected(args.state.selectedCards, args.catalog, {});
  const hydrated = { ...args.state, functionalProfiles };
  const snapshot = computeDeckSnapshotV47({ state: hydrated, catalog: args.catalog });
  return { ...hydrated, snapshots: [snapshot] };
}

export function computeVerifiedDeckSnapshotV414(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
}): VerifiedDeckSnapshotV414 {
  const hydrated = hydrateAndVerifyDeckStateV414(args);
  const profiles = args.state.selectedCards
    .map((c) => (c.oracleId ? hydrated.functionalProfiles[c.oracleId] : null))
    .filter(Boolean) as FunctionalCardProfileV47[];

  const fp = computeFinalDeckFingerprintV411({ state: hydrated, catalog: args.catalog });
  const interactionBase = roleMetrics(profiles, "interaction");
  const protectionBase = roleMetrics(profiles, "protection");
  const tutorProfiles = profiles.filter((p) => {
    const golden = args.catalog.byOracleId.get(p.oracleId);
    return golden && classifyTutorCardV411(golden);
  });

  return {
    version: PROFESSOR_VERIFIED_FINAL_SNAPSHOT_V4_14_V1_VERSION,
    deckFingerprint: fp.finalDeckFingerprint,
    snapshotFingerprint: snapshotFingerprint(profiles),
    interaction: { ...interactionBase, quality: buildInteractionQuality(profiles) },
    protection: { ...protectionBase, quality: buildProtectionQuality(profiles) },
    tutors: {
      rawCount: tutorProfiles.length,
      uniqueSources: tutorProfiles.length,
      weightedCoverage: tutorProfiles.length,
      repeatableSources: 0,
      conditionalSources: 0,
    },
    acceleration: buildAccelerationProfile(profiles),
    cardAdvantage: roleMetrics(profiles, "card-advantage"),
    profilesHydrated: Object.keys(hydrated.functionalProfiles).length,
  };
}

export function assertMetricRegressionV414(args: {
  catalog: DeckResolutionCatalog;
  cardNames: string[];
  expectInteraction?: number;
  expectProtection?: number;
}): { ok: boolean; verified: VerifiedDeckSnapshotV414; errors: string[] } {
  const selected = args.cardNames.map((name, i) => {
    let oracleId: string | null = null;
    for (const [, g] of args.catalog.byOracleId.entries()) {
      if (g.canonicalName.toLowerCase() === name.toLowerCase()) {
        oracleId = g.oracleId;
        break;
      }
    }
    const golden = oracleId ? args.catalog.byOracleId.get(oracleId) : null;
    const profile = golden ? buildFunctionalCardProfileV47(golden) : null;
    return {
      cardId: `test-${i}`,
      oracleId,
      name,
      proposedBy: "RESEARCH" as const,
      origin: "ORACLE_SEARCH" as const,
      proposalReason: "test",
      functions: profile?.roles ?? [],
      roles: profile?.roles ?? [],
      packages: [],
      engines: [],
      commanderDependence: "MEDIUM" as const,
      worksWithoutCommander: "MEDIUM" as const,
      semanticConnections: [],
      oracleVerified: true,
      legalityVerified: true,
      colorIdentityVerified: true,
      criticStatus: "CHARTER_OK",
      status: "SELECTED" as const,
      addedAtRevision: 1,
      lastReviewedRevision: 1,
      category: (profile?.roles.includes("land") ? "land" : "spell") as "land" | "spell",
    };
  });

  const state = {
    selectedCards: selected,
    functionalProfiles: {},
    assemblyRevision: 1,
    snapshots: [],
  } as unknown as ProfessorCouncilStateV47;

  const verified = computeVerifiedDeckSnapshotV414({ state, catalog: args.catalog });
  const errors: string[] = [];
  if (args.expectInteraction !== undefined && verified.interaction.rawCount < args.expectInteraction) {
    errors.push(`interactionCount ${verified.interaction.rawCount} < ${args.expectInteraction}`);
  }
  if (args.expectProtection !== undefined && verified.protection.rawCount < args.expectProtection) {
    errors.push(`protectionCount ${verified.protection.rawCount} < ${args.expectProtection}`);
  }
  return { ok: errors.length === 0, verified, errors };
}
