/**
 * Stable Oracle clause evidence refs for benchmark fixtures.
 * Format: oracle:<oracleId>:clause:<n>:<sha8>
 */
import { createHash } from "node:crypto";
import type { GoldenCatalogOracleCard } from "./load-golden-catalog-index";
import { combinedGoldenOracleText } from "./load-golden-catalog-index";

export type OracleClause = {
  clauseIndex: number;
  text: string;
  ref: string;
};

export function clauseTextSha8(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 8);
}

export function oracleClauseRef(oracleId: string, clauseIndex: number, clauseText: string): string {
  return `oracle:${oracleId}:clause:${clauseIndex}:${clauseTextSha8(clauseText)}`;
}

export function splitOracleClauses(oracleText: string, oracleId: string): OracleClause[] {
  const parts = oracleText
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.map((text, i) => ({
    clauseIndex: i,
    text,
    ref: oracleClauseRef(oracleId, i, text),
  }));
}

export function selectMechanicClauses(
  card: GoldenCatalogOracleCard,
  opts: { keywords?: string[]; minClauses?: number } = {},
): OracleClause[] {
  const oracleText = combinedGoldenOracleText(card);
  const clauses = splitOracleClauses(oracleText, card.oracleId);
  if (clauses.length === 0) return [];
  const keywords = (opts.keywords ?? []).map((k) => k.toLowerCase());
  const matched = clauses.filter((c) => {
    const lower = c.text.toLowerCase();
    return keywords.length === 0 || keywords.some((k) => lower.includes(k));
  });
  const min = opts.minClauses ?? 1;
  if (matched.length >= min) return matched.slice(0, Math.max(min, 3));
  return clauses.slice(0, Math.max(min, Math.min(3, clauses.length)));
}

export function isOracleClauseRef(ref: string): boolean {
  return /^oracle:[^:]+:clause:[0-9]+:[a-f0-9]{8}$/.test(ref);
}
