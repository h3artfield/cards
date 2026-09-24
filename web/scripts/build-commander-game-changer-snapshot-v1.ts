#!/usr/bin/env npx tsx
/**
 * Freeze official Commander Game Changers list as of training observation cutoff.
 * Authoritative list: Wizards Commander Game Changers (through observation cutoff).
 * Scryfall is:gamechanger used only for name → oracleId resolution.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { normalizeOracleName } from "../src/lib/deck-builder/golden-catalog/normalize-name";
import {
  COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION,
  WIZARDS_GAME_CHANGERS_AUTHORITATIVE_SOURCE,
  commanderGameChangerSnapshotPath,
  gameChangerSnapshotContentHash,
  hashOfficialGameChangerNames,
  hashResolvedGameChangerOracleIds,
  type CommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { OBSERVATION_CUTOFF } from "../src/lib/commander-strategy/training-snapshot-v1";

loadProjectEnvLocal();

type ScryfallCard = {
  name: string;
  oracle_id: string;
  color_identity?: string[];
};

async function fetchAllGameChangers(): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null =
    "https://api.scryfall.com/cards/search?q=is%3Agamechanger&unique=oracle";
  while (url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "CardsCommanderStudy/1.0" },
    });
    if (!res.ok) throw new Error(`Scryfall search failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as {
      data?: ScryfallCard[];
      has_more?: boolean;
      next_page?: string;
    };
    cards.push(...(body.data ?? []));
    url = body.has_more ? (body.next_page ?? null) : null;
    if (url) await new Promise((r) => setTimeout(r, 100));
  }
  return cards;
}

async function main() {
  const retrievedAt = new Date().toISOString();
  const scryfallMirror = await fetchAllGameChangers();
  const officialCardNames = scryfallMirror.map((c) => c.name).sort((a, b) => a.localeCompare(b));
  const catalog = await loadGoldenCatalogIndex();

  const unresolvedIdentities: string[] = [];
  const ambiguousIdentities: Array<{ name: string; candidateOracleIds: string[] }> = [];
  const resolvedCards: CommanderGameChangerSnapshot["cards"] = [];

  for (const card of scryfallMirror.sort((a, b) => a.name.localeCompare(b.name))) {
    const byScryfall = catalog.byOracleId.get(card.oracle_id);
    if (byScryfall) {
      resolvedCards.push({
        oracleId: byScryfall.oracleId,
        canonicalName: byScryfall.canonicalName,
        scryfallOracleId: card.oracle_id,
        colorIdentity: byScryfall.colorIdentity ?? card.color_identity ?? [],
      });
      continue;
    }

    const normalized = normalizeOracleName(card.name);
    const candidates = catalog.byNormalizedName.get(normalized) ?? [];
    const exact = candidates.filter(
      (c) => normalizeOracleName(c.canonicalName.split("//")[0]?.trim() ?? c.canonicalName) === normalized,
    );
    if (exact.length === 1) {
      resolvedCards.push({
        oracleId: exact[0]!.oracleId,
        canonicalName: exact[0]!.canonicalName,
        scryfallOracleId: card.oracle_id,
        colorIdentity: exact[0]!.colorIdentity ?? card.color_identity ?? [],
      });
    } else if (exact.length > 1) {
      ambiguousIdentities.push({
        name: card.name,
        candidateOracleIds: exact.map((c) => c.oracleId),
      });
    } else {
      unresolvedIdentities.push(`${card.name}|${card.oracle_id}`);
    }
  }

  const resolvedNameSet = new Set(resolvedCards.map((c) => c.canonicalName));
  const officialNameSet = new Set(officialCardNames);
  const missingFromResolution = officialCardNames.filter((n) => !resolvedNameSet.has(n));
  const extraInResolution = resolvedCards
    .map((c) => c.canonicalName)
    .filter((n) => !officialNameSet.has(n));

  const oracleIds = resolvedCards.map((c) => c.oracleId).sort();
  const equalityAudit = {
    officialNameCount: officialCardNames.length,
    resolvedOracleIdCount: oracleIds.length,
    missingFromResolution,
    extraInResolution,
    ambiguousIdentities,
    missingCount: missingFromResolution.length,
    extraCount: extraInResolution.length,
    ambiguousCount: ambiguousIdentities.length,
    pass:
      missingFromResolution.length === 0 &&
      extraInResolution.length === 0 &&
      ambiguousIdentities.length === 0 &&
      officialCardNames.length === oracleIds.length,
  };

  const snapshot: CommanderGameChangerSnapshot = {
    gameChangerListVersion: COMMANDER_GAME_CHANGER_SNAPSHOT_VERSION,
    observationCutoff: OBSERVATION_CUTOFF,
    effectiveDate: "2026-02-09",
    authoritativeSource: WIZARDS_GAME_CHANGERS_AUTHORITATIVE_SOURCE,
    resolutionSource: {
      label: "Scryfall oracle identity resolution",
      query: "is:gamechanger unique:oracle",
      retrievedAt,
    },
    officialCardNames,
    officialNamesContentHash: hashOfficialGameChangerNames(officialCardNames),
    oracleIds,
    resolvedOracleIdsContentHash: hashResolvedGameChangerOracleIds(oracleIds),
    cards: resolvedCards.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
    contentHash: "",
    equalityAudit,
    resolutionAudit: {
      officialListCount: officialCardNames.length,
      resolvedCount: resolvedCards.length,
      unresolvedIdentities,
      ambiguousIdentities,
      unresolvedCount: unresolvedIdentities.length,
      ambiguousCount: ambiguousIdentities.length,
    },
  };
  snapshot.contentHash = gameChangerSnapshotContentHash(snapshot.cards);

  if (
    snapshot.resolutionAudit.unresolvedCount > 0 ||
    snapshot.resolutionAudit.ambiguousCount > 0 ||
    !equalityAudit.pass
  ) {
    console.error(JSON.stringify({ resolutionAudit: snapshot.resolutionAudit, equalityAudit }, null, 2));
    throw new Error("Game Changer resolution/equality audit failed");
  }

  const outPath = commanderGameChangerSnapshotPath();
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(
    JSON.stringify(
      {
        path: outPath,
        authoritativeSource: snapshot.authoritativeSource.label,
        officialNameCount: officialCardNames.length,
        resolvedOracleIdCount: oracleIds.length,
        officialNamesContentHash: snapshot.officialNamesContentHash,
        resolvedOracleIdsContentHash: snapshot.resolvedOracleIdsContentHash,
        contentHash: snapshot.contentHash,
        equalityAuditPass: equalityAudit.pass,
        observationCutoff: OBSERVATION_CUTOFF,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
