import { createWriteStream, existsSync, readdirSync } from "node:fs";
import { createGzip } from "node:zlib";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { NormalizedDeckInstance } from "../../../src/lib/commander-strategy/types";
import { fieldBracketV1, tagEventFromTitleV1 } from "../../../src/lib/commander-bracket-rubric/v1/event-tag-v1";
import { ensureDir, repoWebRoot, sha256File, snapshotRoot, writeJson } from "./lib";

const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const BAR = 95;

type TitleMap = Map<string, string>;

export async function extractB5IdentitySets(): Promise<Record<string, unknown>> {
  const web = repoWebRoot();
  const root = resolve(web, TOPDECK_ROOT);
  const outDir = ensureDir(join(snapshotRoot(), "b5"));
  if (!existsSync(root)) {
    const note = { status: "topdeck-missing", root };
    writeJson(join(outDir, "summary.json"), note);
    return note;
  }

  const titleByTid = loadTitles(root);
  const dest = join(outDir, "b5-identity-sets.jsonl.gz");
  const gzip = createGzip();
  const out = createWriteStream(dest);
  const done = pipeline(gzip, out);

  const seenHash = new Set<string>();
  let n = 0;
  let uniqueSets = 0;
  for (const dir of readdirSync(root).sort()) {
    const decksPath = join(root, dir, "normalized-decks-v3.json");
    if (!existsSync(decksPath)) continue;
    const decks = JSON.parse(require("node:fs").readFileSync(decksPath, "utf8")) as NormalizedDeckInstance[];
    for (const deck of decks) {
      const resolved = uniqueResolved(deck);
      if (resolved.length < BAR) continue;
      const tag = tagEventFromTitleV1(titleByTid.get(deck.tid));
      // Conservative B5 leakage set: every 95+ list from a cEDH-tagged event.
      // Phase 0 field 5 was cEDH + measured 4; including the ~20 measured 2–3
      // cEDH lists only makes the B4 overlap filter stricter.
      if (tag.kind !== "cedh") continue;
      const key = resolved.join("|");
      if (seenHash.has(key)) continue;
      seenHash.add(key);
      gzip.write(
        `${JSON.stringify({
          deckHash: deck.deckHash,
          tid: deck.tid,
          commanderOracleIds: deck.commanderOracleIds.filter(Boolean),
          oracleIds: resolved,
          fieldHint: fieldBracketV1({ measured: 4, tag }),
        })}\n`,
      );
      uniqueSets += 1;
      n += 1;
    }
  }
  gzip.end();
  await done;

  const summary = {
    bar: BAR,
    uniqueIdentitySets: uniqueSets,
    written: n,
    dest: dest.replace(/\\/g, "/"),
    sha256: sha256File(dest),
    filter: "TopDeck v3 lists with >=95 resolved oracle IDs from events tagged cEDH. Used only as the B4 leakage screen (Jaccard >= 0.6). Raw TopDeck lists are not copied into this snapshot.",
  };
  writeJson(join(outDir, "summary.json"), summary);
  return summary;
}

function uniqueResolved(deck: NormalizedDeckInstance): string[] {
  const ids = new Set<string>();
  for (const id of deck.commanderOracleIds) if (id) ids.add(id);
  for (const card of deck.mainboard) {
    if (card.oracleId && card.resolutionStatus === "resolved") ids.add(card.oracleId);
  }
  return [...ids].sort();
}

function loadTitles(root: string): TitleMap {
  const titles = new Map<string, string>();
  for (const dir of readdirSync(root)) {
    const statsPath = join(root, dir, "aggregate-stats.json");
    if (!existsSync(statsPath)) continue;
    const stats = JSON.parse(require("node:fs").readFileSync(statsPath, "utf8")) as {
      tournamentMeta?: Array<{ tid?: string; name?: string }>;
    };
    for (const row of stats.tournamentMeta ?? []) {
      if (row.tid && row.name && !titles.has(row.tid)) titles.set(row.tid, row.name);
    }
  }
  return titles;
}
