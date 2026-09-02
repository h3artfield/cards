import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OBSERVATION_CUTOFF } from "../training-snapshot-v1";

export const COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION = "commander-game-changers-snapshot-2026-08-11-v1";

export const WIZARDS_GAME_CHANGERS_AUTHORITATIVE_SOURCE = {
  label: "Wizards Commander Game Changers list",
  effectiveThroughObservationCutoff: OBSERVATION_CUTOFF,
  wizardsAnnouncementUrl:
    "https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026",
  bracketRulesNote:
    "Game Changers are a bracket barometer only: Brackets 1–2 exclude them; Bracket 3 allows up to three; Brackets 4–5 unlimited. Do not infer bracket labels from counts alone.",
} as const;

export type CommanderGameChangerSnapshot = {
  gameChangerListVersion: typeof COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION;
  observationCutoff: string;
  effectiveDate: string;
  /** Authoritative deckbuilding signal — Wizards official list frozen through observation cutoff. */
  authoritativeSource: typeof WIZARDS_GAME_CHANGERS_AUTHORITATIVE_SOURCE;
  /** Scryfall used only for oracle identity resolution, not list authorship. */
  resolutionSource: {
    label: "Scryfall oracle identity resolution";
    query: string;
    retrievedAt: string;
  };
  officialCardNames: string[];
  officialNamesContentHash: string;
  oracleIds: string[];
  resolvedOracleIdsContentHash: string;
  cards: Array<{
    oracleId: string;
    canonicalName: string;
    scryfallOracleId: string;
    colorIdentity: string[];
  }>;
  contentHash: string;
  equalityAudit: {
    officialNameCount: number;
    resolvedOracleIdCount: number;
    missingFromResolution: string[];
    extraInResolution: string[];
    ambiguousIdentities: Array<{ name: string; candidateOracleIds: string[] }>;
    missingCount: number;
    extraCount: number;
    ambiguousCount: number;
    pass: boolean;
  };
  resolutionAudit: {
    officialListCount: number;
    resolvedCount: number;
    unresolvedIdentities: string[];
    ambiguousIdentities: Array<{ name: string; candidateOracleIds: string[] }>;
    unresolvedCount: number;
    ambiguousCount: number;
  };
};

const SNAPSHOT_PATH = resolve(
  process.cwd(),
  "data/milestones/commander-strategy/commander-game-changers-snapshot-2026-08-11-v1.json",
);

export function commanderGameChangerSnapshotPath(): string {
  return SNAPSHOT_PATH;
}

export function hashOfficialGameChangerNames(names: readonly string[]): string {
  return createHash("sha256").update([...names].sort().join("\n")).digest("hex");
}

export function hashResolvedGameChangerOracleIds(oracleIds: readonly string[]): string {
  return createHash("sha256").update([...oracleIds].sort().join("\n")).digest("hex");
}

export function gameChangerSnapshotContentHash(cards: CommanderGameChangerSnapshot["cards"]): string {
  const payload = cards
    .map((c) => `${c.oracleId}|${c.canonicalName}|${c.scryfallOracleId}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

export function loadCommanderGameChangerSnapshot(): CommanderGameChangerSnapshot {
  if (!existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Missing Game Changer snapshot: ${SNAPSHOT_PATH}. Run build-commander-game-changer-snapshot-v1.ts`);
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as CommanderGameChangerSnapshot;
  if (snapshot.observationCutoff !== OBSERVATION_CUTOFF) {
    throw new Error(
      `Game Changer snapshot observationCutoff mismatch: expected ${OBSERVATION_CUTOFF}, got ${snapshot.observationCutoff}`,
    );
  }
  if (snapshot.resolutionAudit.unresolvedCount !== 0 || snapshot.resolutionAudit.ambiguousCount !== 0) {
    throw new Error(
      `Game Changer snapshot resolution audit failed: unresolved=${snapshot.resolutionAudit.unresolvedCount} ambiguous=${snapshot.resolutionAudit.ambiguousCount}`,
    );
  }
  if (snapshot.equalityAudit && !snapshot.equalityAudit.pass) {
    throw new Error(
      `Game Changer equality audit failed: missing=${snapshot.equalityAudit.missingCount} extra=${snapshot.equalityAudit.extraCount} ambiguous=${snapshot.equalityAudit.ambiguousCount}`,
    );
  }
  return snapshot;
}

export function gameChangerOracleIdSet(snapshot: CommanderGameChangerSnapshot): Set<string> {
  return new Set(snapshot.oracleIds);
}
