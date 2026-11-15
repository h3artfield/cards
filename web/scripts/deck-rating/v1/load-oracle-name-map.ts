import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import {
  emptyOracleNameMap,
  ingestOracleRecord,
  type OracleNameMap,
} from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { newestMatching, snapshotRoot } from "./lib";

export async function loadSnapshotOracleNameMap(snap = snapshotRoot()): Promise<OracleNameMap> {
  const path = newestMatching(join(snap, "scryfall"), /^oracle-cards-.*\.jsonl\.gz$/);
  if (!path) throw new Error("oracle-cards dump missing");
  const map = emptyOracleNameMap();
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    ingestOracleRecord(map, JSON.parse(line));
  }
  return map;
}
