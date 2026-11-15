/**
 * Name → oracle identity for Deck Rating v1.
 *
 * Scryfall's oracle-cards dump contains multiple faces that share a printed
 * name (art-series "Card // Card", tokens, memorabilia). Last-write-wins on
 * `name.split(" // ")[0]` maps Command Tower onto a not_legal reprint pair.
 * Prefer the Commander-legal paper face.
 */
export type OracleNameInfo = {
  oracleId: string;
  name: string;
  typeLine: string;
  text: string;
  commanderLegal: string;
  colorIdentity: string[];
  cmc: number;
  power: number | null;
  edhrecRank: number | null;
};

export type OracleNameMap = {
  byId: Map<string, OracleNameInfo>;
  byName: Map<string, OracleNameInfo>;
};

export function isIndexableOracleFace(typeLine: string, layout?: string): boolean {
  if (/^card(\s|\/\/|$)/i.test(typeLine)) return false;
  if (/\b(token|emblem|art series|memorabilia|sticker)\b/i.test(typeLine)) return false;
  if (layout && /^(token|emblem|art_series|double_faced_token|memorabilia)$/i.test(layout)) return false;
  return true;
}

export function oracleNameKeys(name: string): string[] {
  const n = name.toLowerCase().replace(/\s+\/\s+/g, " // ").trim();
  return [...new Set([n, n.split(" // ")[0]!.trim()].filter(Boolean))];
}

function faceRank(info: OracleNameInfo): number {
  if (info.commanderLegal === "legal") return 4;
  if (info.commanderLegal === "banned") return 3;
  if (info.commanderLegal === "restricted") return 2;
  if (info.commanderLegal === "not_legal") return 1;
  return 0;
}

export function emptyOracleNameMap(): OracleNameMap {
  return { byId: new Map(), byName: new Map() };
}

export function putOracleName(map: OracleNameMap, info: OracleNameInfo): void {
  map.byId.set(info.oracleId, info);
  for (const key of oracleNameKeys(info.name)) {
    const prev = map.byName.get(key);
    if (!prev || faceRank(info) > faceRank(prev)) map.byName.set(key, info);
  }
}

export function ingestOracleRecord(
  map: OracleNameMap,
  rec: {
    oracle_id?: string;
    name?: string;
    type_line?: string;
    oracle_text?: string;
    layout?: string;
    legalities?: { commander?: string };
    color_identity?: string[];
    cmc?: number;
    power?: string | number | null;
    edhrec_rank?: number | null;
  },
): void {
  if (!rec.oracle_id || !rec.name) return;
  if (!isIndexableOracleFace(rec.type_line ?? "", rec.layout)) return;
  putOracleName(map, {
    oracleId: rec.oracle_id,
    name: rec.name,
    typeLine: rec.type_line ?? "",
    text: rec.oracle_text ?? "",
    commanderLegal: rec.legalities?.commander ?? "unknown",
    colorIdentity: rec.color_identity ?? [],
    cmc: Number(rec.cmc ?? 0),
    power: parsePower(rec.power),
    edhrecRank: rec.edhrec_rank ?? null,
  });
}

function parsePower(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function resolveOracleName(map: OracleNameMap, name: string): OracleNameInfo | null {
  const raw = name.replace(/\s+\/\s+/g, " // ").trim();
  const candidates = [raw.toLowerCase(), raw.split(" // ")[0]!.toLowerCase(), raw.split(" // ")[1]?.toLowerCase() ?? ""];
  for (const key of candidates) {
    if (!key) continue;
    const hit = map.byName.get(key.trim());
    if (hit) return hit;
  }
  return null;
}
