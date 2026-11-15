/**
 * Phase 6A.1 — Blinding audit + shuffle helpers for v4b presentation correction.
 */
import { createHash } from "node:crypto";

export const BLINDING_AUDIT_V1_VERSION = "phase6a1-blinding-audit-v1";

export type V4TupleKey = `${string}:${string}:${string}`;

export function tupleKey(caseId: string, requirementId: string, candidateOracleId: string): V4TupleKey {
  return `${caseId}:${requirementId}:${candidateOracleId}`;
}

export function requirementGroupKey(caseId: string, requirementId: string): string {
  return `${caseId}:${requirementId}`;
}

const PROHIBITED_KEY_PATTERNS = [
  /rank/i,
  /score/i,
  /probability/i,
  /confidence/i,
  /matchtype/i,
  /functionalmatch/i,
  /tier/i,
  /automatedlabel/i,
  /performance/i,
  /position/i,
  /slot/i,
  /percentile/i,
  /ordinal/i,
  /topkposition/i,
  /top_k_position/i,
  /generalcandidate/i,
  /functionalrolefit/i,
  /commandersemanticfit/i,
  /directionfit/i,
  /structuralfit/i,
  /composite/i,
  /falseexactfunctionclaim/i,
];

export function isProhibitedBlindKey(key: string): boolean {
  return PROHIBITED_KEY_PATTERNS.some((p) => p.test(key));
}

export function scanProhibitedBlindFields(
  value: unknown,
  path = "",
): string[] {
  const hits: string[] = [];
  if (value === null || value === undefined) return hits;
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...scanProhibitedBlindFields(item, `${path}[${i}]`)));
    return hits;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${k}` : k;
      if (isProhibitedBlindKey(k)) hits.push(next);
      hits.push(...scanProhibitedBlindFields(v, next));
    }
  }
  return hits;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function fingerprintTupleSet(keys: Iterable<string>): string {
  const sorted = [...keys].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
}

/** Deterministic shuffle seed derived internally — not written to reviewer artifacts. */
function internalShuffleSeed(tupleFingerprint: string): number {
  const digest = createHash("sha256").update(`phase6a1-v4b-blind-shuffle:${tupleFingerprint}`).digest();
  return digest.readUInt32BE(0);
}

export function shuffleBlindPresentation<T extends { caseId: string; requirementId: string; packetId: string }>(
  packets: T[],
  tupleFingerprint: string,
): T[] {
  const seed = internalShuffleSeed(tupleFingerprint);
  const rand = mulberry32(seed);

  const byRequirement = new Map<string, T[]>();
  for (const p of packets) {
    const g = requirementGroupKey(p.caseId, p.requirementId);
    if (!byRequirement.has(g)) byRequirement.set(g, []);
    byRequirement.get(g)!.push(p);
  }

  const shuffledGroups: T[] = [];
  for (const group of byRequirement.values()) {
    const copy = [...group];
    shuffleInPlace(copy, rand);
    shuffledGroups.push(...copy);
  }

  shuffleInPlace(shuffledGroups, rand);
  return shuffledGroups;
}

export function stripProhibitedBlindFields(packet: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(packet)) {
    if (isProhibitedBlindKey(k)) continue;
    out[k] = v;
  }
  return out;
}

export function orderingPreservesRetrievalRank(input: {
  blindPackets: Array<{ packetId: string; caseId: string; requirementId: string }>;
  rankByPacketId: Map<string, number>;
}): boolean {
  const byReq = new Map<string, string[]>();
  for (const p of input.blindPackets) {
    const g = requirementGroupKey(p.caseId, p.requirementId);
    if (!byReq.has(g)) byReq.set(g, []);
    byReq.get(g)!.push(p.packetId);
  }

  for (const ids of byReq.values()) {
    if (ids.length < 2) continue;
    let ascending = true;
    let descending = true;
    for (let i = 1; i < ids.length; i++) {
      const prev = input.rankByPacketId.get(ids[i - 1]!) ?? 0;
      const cur = input.rankByPacketId.get(ids[i]!) ?? 0;
      if (cur <= prev) ascending = false;
      if (cur >= prev) descending = false;
    }
    if (ascending || descending) return true;
  }
  return false;
}

export function sha256FileContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
