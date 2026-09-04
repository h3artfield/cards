/**
 * Candidates chosen for tournament consensus rather than textual similarity.
 *
 * Semantic neighbors cannot find upgrades: only 2% of cards have a Game
 * Changer within their top-20, and Sol Ring's nearest neighbor is Mana Screw
 * at distance 0.000. This source instead takes cards that do the same job as
 * the outgoing card and are played materially more often.
 *
 * "Same job" needs care. The derived-role vocabulary is uneven — board_interaction
 * covers 28.7% of the catalog while removal covers 0.1% — so matching on any
 * shared role pairs a removal spell with a land. Common roles therefore only
 * count alongside a matching card type.
 */
import {
  getSemanticMapPoint,
  loadSemanticMapPoints,
} from "@/lib/semantic-visualization/artifact-loader";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { playRateFor } from "./play-rate-server";
import type { SwapCandidate } from "./types";

/** Ignore cards barely more played than the incumbent; that is noise, not an upgrade. */
const MIN_LIFT = 1.25;
/** A role on more than this share of the catalog describes no particular job. */
const SPECIFIC_ROLE_MAX_SHARE = 0.15;

const TYPE_PRIORITY = [
  "Land",
  "Creature",
  "Planeswalker",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
] as const;

export function primaryTypeOf(types: readonly string[]): string {
  for (const type of TYPE_PRIORITY) {
    if (types.includes(type)) return type;
  }
  return types[0] ?? "Unknown";
}

export function isLandType(types: readonly string[]): boolean {
  return types.includes("Land");
}

type RoleTables = {
  byRole: Map<string, string[]>;
  specific: Set<string>;
};

let tables: RoleTables | null = null;

function roleTables(): RoleTables {
  if (tables) return tables;
  const points = loadSemanticMapPoints();
  const byRole = new Map<string, string[]>();
  for (const point of points) {
    for (const role of point.derivedRoles) {
      const bucket = byRole.get(role);
      if (bucket) bucket.push(point.oracleId);
      else byRole.set(role, [point.oracleId]);
    }
  }
  const specific = new Set<string>();
  for (const [role, ids] of byRole) {
    if (ids.length / points.length <= SPECIFIC_ROLE_MAX_SHARE) specific.add(role);
  }
  tables = { byRole, specific };
  return tables;
}

/**
 * Roles narrow enough to describe a job. Shared with the bracket attainment
 * pass so both use one definition of "does the same thing".
 */
export function specificRolesOf(roles: readonly string[]): string[] {
  const { specific } = roleTables();
  return roles.filter((role) => specific.has(role));
}

export function findUpgradeCandidates(args: {
  oracleId: string;
  commanderColorIdentity: string[];
  limit?: number;
}): SwapCandidate[] {
  const outgoing = getSemanticMapPoint(args.oracleId);
  if (!outgoing) return [];

  const { byRole, specific } = roleTables();
  const outgoingRate = playRateFor(args.oracleId)?.rate ?? 0;
  const outgoingType = primaryTypeOf(outgoing.types);
  const outgoingIsLand = isLandType(outgoing.types);
  const outgoingSpecific = outgoing.derivedRoles.filter((role) => specific.has(role));
  // With no distinctive role the only defensible claim is "same type, same
  // broad job", so the type must match exactly.
  const requireSameType = outgoingSpecific.length === 0;
  const matchRoles = requireSameType ? outgoing.derivedRoles : outgoingSpecific;

  const seen = new Set<string>([args.oracleId]);
  const scored: Array<{ candidate: SwapCandidate; rate: number }> = [];

  for (const role of matchRoles) {
    for (const oracleId of byRole.get(role) ?? []) {
      if (seen.has(oracleId)) continue;
      seen.add(oracleId);

      const stat = playRateFor(oracleId);
      if (!stat) continue;
      if (outgoingRate > 0 && stat.rate < outgoingRate * MIN_LIFT) continue;

      const point = getSemanticMapPoint(oracleId);
      if (!point) continue;
      if (isLandType(point.types) !== outgoingIsLand) continue;
      if (requireSameType && primaryTypeOf(point.types) !== outgoingType) continue;
      if (!commanderLegalInIdentity(point.colorIdentity, args.commanderColorIdentity)) continue;

      scored.push({
        rate: stat.rate,
        candidate: {
          oracleId: point.oracleId,
          name: point.name,
          colorIdentity: point.colorIdentity,
          manaValue: point.manaValue,
          typeLine: point.typeLine,
          primaryType: primaryTypeOf(point.types),
          isLand: isLandType(point.types),
          derivedRoles: point.derivedRoles,
          source: "role_upgrade",
          semanticDistance: null,
        },
      });
    }
  }

  scored.sort((a, b) => b.rate - a.rate || a.candidate.name.localeCompare(b.candidate.name));
  return scored.slice(0, args.limit ?? 20).map((entry) => entry.candidate);
}
