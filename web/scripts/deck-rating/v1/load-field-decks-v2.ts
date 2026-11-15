import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { classifyGoldfishCard, type GoldfishSimCard } from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { resolveOracleName, type OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { snapshotRoot } from "./lib";

export type FieldDeck = {
  id: string;
  band: string;
  commander: string;
  commanderIds: string[];
  oracleIds: string[];
};

export function legalIds(ids: string[], oracle: OracleNameMap): boolean {
  return ids.every((id) => {
    const info = oracle.byId.get(id);
    return !info || (info.commanderLegal !== "banned" && info.commanderLegal !== "not_legal");
  });
}

export function cardsOf(ids: string[], commanderIds: Set<string>, oracle: OracleNameMap): GoldfishSimCard[] {
  const out: GoldfishSimCard[] = [];
  for (const id of ids) {
    const info = oracle.byId.get(id);
    if (!info) continue;
    out.push(
      classifyGoldfishCard({
        oracleId: id,
        name: info.name,
        typeLine: info.typeLine,
        text: info.text,
        cmc: info.cmc,
        power: info.power,
        isCommander: commanderIds.has(id),
      }),
    );
  }
  return out;
}

export async function loadFieldDecks(oracle: OracleNameMap, args?: { b5Sample?: number }): Promise<Record<string, FieldDeck[]>> {
  const snap = snapshotRoot();
  const b5Sample = args?.b5Sample ?? 2000;
  const fields = JSON.parse(readFileSync(join(snap, "fields", "FIELDS.json"), "utf8")) as { b2: { names: string[] } };
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ oracleId?: string | null }>;
    }>;
  };
  const b2Names = new Set(fields.b2.names);
  const bands: Record<string, FieldDeck[]> = { B2: [], B3: [], B4: [], B5: [] };
  for (const d of labels.decks.filter((x) => b2Names.has(x.playgroupName))) {
    const commanderIds = d.commanders.map((c) => c.oracleId).filter((id): id is string => Boolean(id));
    const oracleIds = [...commanderIds, ...d.mainboard.map((c) => c.oracleId).filter((id): id is string => Boolean(id))];
    if (!legalIds(oracleIds, oracle)) continue;
    bands.B2!.push({
      id: d.playgroupName,
      band: "B2",
      commander: d.commanders.map((c) => c.name).filter(Boolean).join(" / ") || "unknown",
      commanderIds,
      oracleIds,
    });
  }
  for (const [band, file] of [
    ["B3", "field-b3.jsonl.gz"],
    ["B4", "field-b4.jsonl.gz"],
  ] as const) {
    const path = join(snap, "archidekt", file);
    if (!existsSync(path)) continue;
    const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { archidektId?: number; commanders?: string[]; oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      if (ids.length < 90 || !legalIds(ids, oracle)) continue;
      const commanderIds = (rec.commanders ?? [])
        .map((n) => resolveOracleName(oracle, n)?.oracleId)
        .filter((id): id is string => Boolean(id));
      bands[band]!.push({
        id: String(rec.archidektId ?? bands[band]!.length),
        band,
        commander: (rec.commanders ?? []).join(" / ") || "unknown",
        commanderIds,
        oracleIds: ids,
      });
    }
  }
  const b5Path = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  if (existsSync(b5Path)) {
    const rl = createInterface({ input: createReadStream(b5Path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { deckHash?: string; commanderOracleIds?: string[]; oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      if (ids.length < 90 || !legalIds(ids, oracle)) continue;
      const commander = (rec.commanderOracleIds ?? [])
        .map((id) => oracle.byId.get(id)?.name)
        .filter(Boolean)
        .join(" / ");
      bands.B5!.push({
        id: rec.deckHash ?? String(bands.B5!.length),
        band: "B5",
        commander: commander || "unknown",
        commanderIds: rec.commanderOracleIds ?? [],
        oracleIds: ids,
      });
    }
  }
  void args;
  return bands;
}

export function b5RefDecks(allB5: FieldDeck[], n = 10): FieldDeck[] {
  const byCmd = new Map<string, FieldDeck[]>();
  for (const row of allB5) {
    const list = byCmd.get(row.commander) ?? [];
    list.push(row);
    byCmd.set(row.commander, list);
  }
  return [...byCmd.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, n)
    .map(([, list]) => list[0]!);
}
