import { createHash } from "node:crypto";

export type DeckHashInput = {
  commanderOracleIds: string[];
  mainboard: Array<{ oracleId: string; quantity: number }>;
};

export function computeDeckHash(input: DeckHashInput): string {
  const commanders = [...input.commanderOracleIds].sort().join(",");
  const main = [...input.mainboard]
    .filter((c) => c.oracleId)
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId) || a.quantity - b.quantity)
    .map((c) => `${c.oracleId}:${c.quantity}`)
    .join("|");
  const payload = `cmd=${commanders};main=${main}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function hashTopdeckPlayerId(playerId: string): string {
  return createHash("sha256").update(`topdeck-player:${playerId}`).digest("hex").slice(0, 24);
}

export function makePodId(tid: string, round: number | string, table: number | string): string {
  return `${tid}:${round}:${table}`;
}

export function makeDeckInstanceId(tid: string, playerIdHash: string): string {
  return `${tid}:${playerIdHash}`;
}
