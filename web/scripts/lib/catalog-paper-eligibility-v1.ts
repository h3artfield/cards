/**
 * Paper eligibility from complete Scryfall default_cards bulk (authoritative games[] on printings).
 *
 * paperEligible(oracleId) = exists printing P for oracleId where P.games includes "paper"
 */
import { createHash } from "node:crypto";

export type PaperPopulationFrame =
  | "PAPER"
  | "DIGITAL_ONLY"
  | "NON_CARD"
  | "MALFORMED";

export type DigitalOnlySubtype =
  | "arena_only"
  | "alchemy"
  | "rebalanced"
  | "mtgo_only"
  | "mixed_digital"
  | "other_digital";

export type OraclePrintingAggregate = {
  oracleId: string;
  printingCount: number;
  paperPrintingCount: number;
  hasPaperPrinting: boolean;
  gamesUnion: string[];
  layouts: string[];
  setCodes: string[];
  setTypes: string[];
  digitalFlags: boolean[];
  examplePrintings: Array<{
    scryfallId: string;
    name: string;
    set: string;
    setName?: string;
    setType?: string;
    layout: string;
    games: string[];
    digital?: boolean;
  }>;
};

export function extractOracleIdFromBulk(raw: Record<string, unknown>): string | undefined {
  const top = raw.oracle_id as string | undefined;
  if (top?.trim()) return top.trim();
  const faces = raw.card_faces as Array<{ oracle_id?: string }> | undefined;
  for (const face of faces ?? []) {
    if (face.oracle_id?.trim()) return face.oracle_id.trim();
  }
  return undefined;
}

export function printingHasPaperGames(raw: Record<string, unknown>): boolean {
  const games = raw.games as string[] | undefined;
  return Boolean(games?.length && games.includes("paper"));
}

export function createOraclePrintingAggregate(oracleId: string): OraclePrintingAggregate {
  return {
    oracleId,
    printingCount: 0,
    paperPrintingCount: 0,
    hasPaperPrinting: false,
    gamesUnion: [],
    layouts: [],
    setCodes: [],
    setTypes: [],
    digitalFlags: [],
    examplePrintings: [],
  };
}

export function ingestPrintingAggregate(
  agg: OraclePrintingAggregate,
  raw: Record<string, unknown>,
): void {
  const scryfallId = String(raw.id ?? "");
  const name = String(raw.name ?? "");
  const set = String(raw.set ?? "");
  const setName = raw.set_name as string | undefined;
  const setType = raw.set_type as string | undefined;
  const layout = String(raw.layout ?? "");
  const games = (raw.games as string[] | undefined) ?? [];
  const digital = Boolean(raw.digital);

  agg.printingCount += 1;
  if (printingHasPaperGames(raw)) {
    agg.paperPrintingCount += 1;
    agg.hasPaperPrinting = true;
  }

  for (const g of games) {
    if (!agg.gamesUnion.includes(g)) agg.gamesUnion.push(g);
  }
  if (layout && !agg.layouts.includes(layout)) agg.layouts.push(layout);
  if (set && !agg.setCodes.includes(set)) agg.setCodes.push(set);
  if (setType && !agg.setTypes.includes(setType)) agg.setTypes.push(setType);
  agg.digitalFlags.push(digital);

  if (agg.examplePrintings.length < 5) {
    agg.examplePrintings.push({
      scryfallId,
      name,
      set,
      setName,
      setType,
      layout,
      games,
      digital,
    });
  }
}

export function classifyDigitalOnlySubtype(agg: OraclePrintingAggregate): DigitalOnlySubtype {
  const games = new Set(agg.gamesUnion);
  const setTypes = new Set(agg.setTypes.map((s) => s.toLowerCase()));

  if (setTypes.has("alchemy")) return "alchemy";
  if (setTypes.has("rebalanced") || agg.setCodes.some((c) => c.startsWith("rebalanced"))) {
    return "rebalanced";
  }
  if (games.size === 1 && games.has("arena")) return "arena_only";
  if (games.size === 1 && games.has("mtgo")) return "mtgo_only";
  if ([...games].every((g) => g === "arena" || g === "mtgo")) return "mixed_digital";
  return "other_digital";
}

export function paperPopulationFrame(input: {
  populationCategory: "A" | "B" | "C" | "D" | "E";
  hasPaperPrinting: boolean;
  printingCount: number;
}): PaperPopulationFrame {
  if (input.populationCategory === "D") return "NON_CARD";
  if (input.populationCategory === "E") return "MALFORMED";
  if (input.hasPaperPrinting) return "PAPER";
  return "DIGITAL_ONLY";
}

export function paperPopulationHash(
  rows: Array<{ oracleId: string; oracleTextHash: string; cardStructureHash: string; paperEligible: boolean }>,
): string {
  const body = rows
    .filter((r) => r.paperEligible)
    .map(
      (r) => `${r.oracleId}|${r.oracleTextHash}|${r.cardStructureHash}|paper`,
    )
    .sort();
  return createHash("sha256").update(body.join("\n")).digest("hex");
}
