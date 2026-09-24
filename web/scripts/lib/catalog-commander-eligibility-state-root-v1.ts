/**
 * Normative deterministic Commander eligibility-state roots (phase6a1-commander-eligibility-state-sorted-newline-root-v1).
 */
import { createHash } from "node:crypto";
import { deriveCommanderClassification } from "../../src/lib/deck-builder/commander-classification";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import { paperMetaForOracle } from "./load-deck-resolution-catalog";

export const COMMANDER_ELIGIBILITY_STATE_ROOT_V1 = "phase6a1-commander-eligibility-state-sorted-newline-root-v1";

export type CommanderEligibilityStateRow = {
  oracleId: string;
  paperEligible: boolean;
  commanderFormatStatus: string;
  structurallyEligible: boolean;
  canBeSoleCommander: boolean;
  canOccupyCommandZone: boolean;
};

export type CommanderEligibilityStateRootsV1 = {
  fullEligibilityStateRootSha256: string;
  singleCommanderEligibleOracleIdCount: number;
  singleCommanderEligibleOracleIdSetSha256: string;
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

export function isSingleCommanderEligibleRow(row: CommanderEligibilityStateRow): boolean {
  return (
    row.paperEligible &&
    row.commanderFormatStatus === "legal" &&
    row.structurallyEligible &&
    row.canBeSoleCommander
  );
}

export function computeCommanderEligibilityStateRoots(
  catalog: DeckResolutionCatalog,
): { rows: CommanderEligibilityStateRow[]; roots: CommanderEligibilityStateRootsV1 } {
  const rows = [...catalog.byOracleId.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((oracleId) => computeCommanderEligibilityStateRow(catalog, oracleId));

  const fullEligibilityStateRootSha256 = sha256SortedLines(rows.map(eligibilityStateLine));
  const eligibleOracleIds = rows.filter(isSingleCommanderEligibleRow).map((r) => r.oracleId);
  const singleCommanderEligibleOracleIdSetSha256 = sha256SortedLines(eligibleOracleIds);

  return {
    rows,
    roots: {
      fullEligibilityStateRootSha256,
      singleCommanderEligibleOracleIdCount: eligibleOracleIds.length,
      singleCommanderEligibleOracleIdSetSha256,
    },
  };
}
