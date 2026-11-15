/**
 * Normative Commander eligibility-state roots v2 with pre/post freshness universe separation.
 */
import { createHash } from "node:crypto";
import { deriveCommanderClassification } from "../../src/lib/deck-builder/commander-classification";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import { paperMetaForOracle } from "./load-deck-resolution-catalog";
import type { LoadedExposedOracleIds } from "./load-exposed-benchmark-oracle-ids-v2";

export const COMMANDER_ELIGIBILITY_STATE_ROOT_V2 = "phase6a1-commander-eligibility-state-sorted-newline-root-v2";

export type CommanderEligibilityStateRow = {
  oracleId: string;
  paperEligible: boolean;
  commanderFormatStatus: string;
  structurallyEligible: boolean;
  canBeSoleCommander: boolean;
  canOccupyCommandZone: boolean;
};

export type CommanderEligibilityStateRootsV2 = {
  fullEligibilityStateRootSha256: string;
  eligibleUniverseBeforeFreshness: {
    oracleIdCount: number;
    oracleIdSetSha256: string;
  };
  freshEligibleUniverse: {
    oracleIdCount: number;
    oracleIdSetSha256: string;
    excludedOracleIdCount: number;
    exposedIdentitiesManifestByteSha256: string;
  };
};

function sha256SortedLines(lines: string[]): string {
  return createHash("sha256")
    .update([...lines].sort().join("\n"))
    .digest("hex");
}

export function eligibilityStateLine(row: CommanderEligibilityStateRow): string {
  return [
    row.oracleId,
    row.paperEligible ? "true" : "false",
    row.commanderFormatStatus,
    row.structurallyEligible ? "true" : "false",
    row.canBeSoleCommander ? "true" : "false",
    row.canOccupyCommandZone ? "true" : "false",
  ].join("|");
}

export function computeCommanderEligibilityStateRow(
  catalog: DeckResolutionCatalog,
  oracleId: string,
): CommanderEligibilityStateRow {
  const card = catalog.byOracleId.get(oracleId);
  const paper = paperMetaForOracle(catalog, oracleId);
  const classification = card
    ? deriveCommanderClassification({
        name: card.canonicalName,
        typeLine: card.typeLine,
        oracleText: card.oracleText,
        colorIdentity: card.colorIdentity,
        legalities: card.legalities,
      })
    : undefined;

  return {
    oracleId,
    paperEligible: paper.paperEligible,
    commanderFormatStatus: classification?.commanderFormatStatus ?? "unknown",
    structurallyEligible: classification?.structurallyEligible ?? false,
    canBeSoleCommander: classification?.canBeSoleCommander ?? false,
    canOccupyCommandZone: classification?.canOccupyCommandZone ?? false,
  };
}

export function isEligibleUniverseBeforeFreshnessRow(row: CommanderEligibilityStateRow): boolean {
  return (
    row.paperEligible &&
    row.commanderFormatStatus === "legal" &&
    row.structurallyEligible &&
    row.canBeSoleCommander
  );
}

export function computeCommanderEligibilityStateRootsV2(
  catalog: DeckResolutionCatalog,
  exposed: LoadedExposedOracleIds,
): { rows: CommanderEligibilityStateRow[]; roots: CommanderEligibilityStateRootsV2 } {
  const rows = [...catalog.byOracleId.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((oracleId) => computeCommanderEligibilityStateRow(catalog, oracleId));

  const beforeFreshnessIds = rows.filter(isEligibleUniverseBeforeFreshnessRow).map((r) => r.oracleId);
  const freshIds = beforeFreshnessIds.filter((oracleId) => !exposed.excludedOracleIds.has(oracleId));

  return {
    rows,
    roots: {
      fullEligibilityStateRootSha256: sha256SortedLines(rows.map(eligibilityStateLine)),
      eligibleUniverseBeforeFreshness: {
        oracleIdCount: beforeFreshnessIds.length,
        oracleIdSetSha256: sha256SortedLines(beforeFreshnessIds),
      },
      freshEligibleUniverse: {
        oracleIdCount: freshIds.length,
        oracleIdSetSha256: sha256SortedLines(freshIds),
        excludedOracleIdCount: exposed.excludedOracleIds.size,
        exposedIdentitiesManifestByteSha256: exposed.manifestByteSha256,
      },
    },
  };
}
