import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  decodeHtml,
  downloadFile,
  ensureDir,
  fetchJson,
  fetchText,
  incomingRoot,
  jsonLdBlocks,
  sha256File,
  snapshotRoot,
  writeJson,
} from "./lib";

type RankedRow = {
  rank: number | null;
  name: string;
  url: string;
  winRatePct: number | null;
  games: number | null;
  extra: Record<string, string | number | null>;
};

export async function fetchPlaygroupTables(): Promise<Record<string, unknown>> {
  const snap = ensureDir(join(snapshotRoot(), "playgroup"));
  const rawDir = ensureDir(join(snap, "raw"));
  const incoming = ensureDir(join(incomingRoot(), "playgroup"));

  const pages = [
    { key: "precons", url: "https://playgroup.gg/commander/precons", file: "precons.html" },
    { key: "commanders", url: "https://playgroup.gg/commanders/tier-list", file: "commanders-tier-list.html" },
    { key: "staples", url: "https://playgroup.gg/commander/staples", file: "staples.html" },
    { key: "cardsIndex", url: "https://playgroup.gg/cards", file: "cards.html" },
    { key: "about", url: "https://playgroup.gg/about", file: "about.html" },
    { key: "tierS", url: "https://playgroup.gg/commanders/tier-list-rows?tier=S&time_window=30-days", file: "commanders-tier-S.html" },
    { key: "tierA", url: "https://playgroup.gg/commanders/tier-list-rows?tier=A&time_window=30-days", file: "commanders-tier-A.html" },
    { key: "tierB", url: "https://playgroup.gg/commanders/tier-list-rows?tier=B&time_window=30-days", file: "commanders-tier-B.html" },
    { key: "tierC", url: "https://playgroup.gg/commanders/tier-list-rows?tier=C&time_window=30-days", file: "commanders-tier-C.html" },
    { key: "tierD", url: "https://playgroup.gg/commanders/tier-list-rows?tier=D&time_window=30-days", file: "commanders-tier-D.html" },
  ] as const;

  const pageMeta: Record<string, unknown> = {};
  for (const page of pages) {
    const dest = join(rawDir, page.file);
    const incomingDest = join(incoming, page.file);
    if (existsSync(incomingDest) && !existsSync(dest)) copyFileSync(incomingDest, dest);
    const force = page.key.startsWith("tier");
    if (!existsSync(dest) || force) {
      console.log(`playgroup GET ${page.url}`);
      await downloadFile(page.url, dest);
    }
    pageMeta[page.key] = {
      url: page.url,
      dest: dest.replace(/\\/g, "/"),
      sha256: sha256File(dest),
    };
  }

  const apiProbe = await probePlaygroupApi();
  writeJson(join(snap, "api-probe.json"), apiProbe);

  const preconHtml = require("node:fs").readFileSync(join(rawDir, "precons.html"), "utf8") as string;
  const commanderHtml = ["commanders-tier-list.html", "commanders-tier-S.html", "commanders-tier-A.html", "commanders-tier-B.html", "commanders-tier-C.html", "commanders-tier-D.html"]
    .map((file) => (existsSync(join(rawDir, file)) ? require("node:fs").readFileSync(join(rawDir, file), "utf8") : ""))
    .join("\n");
  const staplesHtml = require("node:fs").readFileSync(join(rawDir, "staples.html"), "utf8") as string;
  const cardsHtml = require("node:fs").readFileSync(join(rawDir, "cards.html"), "utf8") as string;

  const preconTable = parsePreconTable(preconHtml);
  const commanderTable = parseCommanderTable(commanderHtml);
  const staplesTable = parseStaplesTable(staplesHtml);
  const cardsDataset = datasetFromLd(cardsHtml);

  writeJson(join(snap, "precon-table.json"), preconTable);
  writeJson(join(snap, "commander-table.json"), commanderTable);
  writeJson(join(snap, "card-staples-table.json"), staplesTable);
  const apiCommanders = await fetchJson<Array<Record<string, unknown>>>("https://playgroup.gg/api/public/v1/commanders");
  if (apiCommanders.status === 200 && Array.isArray(apiCommanders.json)) {
    const apiDir = ensureDir(join(snap, "api"));
    require("node:fs").writeFileSync(join(apiDir, "commanders-public-v1.json"), apiCommanders.text);
    writeJson(join(snap, "commander-table-api.json"), {
      source: "https://playgroup.gg/api/public/v1/commanders",
      license: "CC-BY 4.0",
      n: apiCommanders.json.length,
      window: "api-lifetime-or-long-window",
      replacesHtmlParse: true,
      ranked: apiCommanders.json
        .map((row) => ({
          name: String(row.name ?? ""),
          id: row.id ?? null,
          scryfallId: row.scryfall_id ?? null,
          winRatePct:
            typeof row.game_played_count === "number" && row.game_played_count > 0 && typeof row.game_win_count === "number"
              ? (100 * row.game_win_count) / row.game_played_count
              : null,
          games: typeof row.game_played_count === "number" ? row.game_played_count : null,
          pilots: row.pilot_count ?? null,
          extra: { elo: row.global_elo ?? null },
        }))
        .filter((r) => r.name)
        .sort((a, b) => (b.games ?? 0) - (a.games ?? 0)),
    });
  }
  writeJson(join(snap, "card-atlas-index-note.json"), {
    dataset: cardsDataset,
    bulkEndpoint: null,
    api: "/api/v2/card_search is typeahead only (name, slug, has_live_data). It does not return lift, inclusion, or cast-turn stats.",
    decision:
      "Do not fetch 8,811 card pages. The published card-strength ranking is the staples table (CC-BY 4.0). A full Live atlas export is still needed from Playgroup if we want every card's lift.",
  });
  writeJson(join(snap, "export-request.json"), {
    to: "Playgroup.gg",
    asked: "one dated JSON/CSV export of precon, commander, and card-atlas tables instead of page fetches",
    found: {
      publicRestDocs: "Playgroup Live key-gated (games/decks/players), not research tables",
      publicBulkJson: false,
      usedInstead: "three published CC-BY 4.0 list pages + about + cards index (5 GETs)",
    },
    stillWanted: [
      "full card-atlas lift / inclusion / cast-turn for every Live-tracked card",
      "commander win rates with oracle IDs",
      "precon stock lists keyed to MTGJSON/Scryfall oracle IDs",
    ],
  });

  const attribution = [
    "Playgroup.gg data used under CC-BY 4.0.",
    "Cite: https://playgroup.gg/about",
    `Precon tier list: https://playgroup.gg/commander/precons (${preconTable.dateModified ?? "undated"})`,
    `Commander tier list: https://playgroup.gg/commanders/tier-list (${commanderTable.dateModified ?? "undated"})`,
    `Staples / card-strength: https://playgroup.gg/commander/staples (${staplesTable.dateModified ?? "undated"})`,
    "Card Atlas aggregates are published under the same license; the public site does not offer a bulk JSON export.",
  ].join("\n");
  require("node:fs").writeFileSync(join(snap, "ATTRIBUTION.txt"), `${attribution}\n`);

  return {
    pages: pageMeta,
    apiProbe,
    precon: { n: preconTable.ranked.length, listed: preconTable.listed.length, dateModified: preconTable.dateModified },
    commanders: { n: commanderTable.ranked.length, dateModified: commanderTable.dateModified },
    staples: { n: staplesTable.cards.length, dateModified: staplesTable.dateModified },
    cardAtlas: cardsDataset,
  };
}

async function probePlaygroupApi(): Promise<Record<string, unknown>> {
  const paths = [
    "/api/v2/card_search?q=sol&per_page=2",
    "/api/v2/cards",
    "/api/v2/precons",
    "/api/v2/staples",
    "/api/v2/commanders",
    "/docs",
    "/api",
  ];
  const out: Record<string, unknown> = {};
  for (const path of paths) {
    const hit = await fetchJson<unknown>(`https://playgroup.gg${path}`).catch((err: Error) => ({
      status: 0,
      json: null,
      text: String(err),
    }));
    out[path] = { status: hit.status, snippet: hit.text.slice(0, 180) };
    await new Promise((r) => setTimeout(r, 150));
  }
  const live = await fetchText("https://playgroup.gg/playgroup-live/for-communities");
  out.liveDocs = { status: live.status, note: "Playgroup Live REST API is key-gated for games/decks/players, not the research tables." };
  return out;
}

function datasetFromLd(html: string): Record<string, unknown> | null {
  for (const block of jsonLdBlocks(html)) {
    if (block && typeof block === "object" && (block as { "@type"?: string })["@type"] === "Dataset") {
      return block as Record<string, unknown>;
    }
  }
  return null;
}

function parsePreconTable(html: string) {
  const dataset = datasetFromLd(html);
  const ranked: RankedRow[] = [];
  const seen = new Set<string>();
  for (const cells of desktopRows(html)) {
    const href = cells.join(" ").match(/href="(\/sets\/[^"]+\/precons\/[^"]+)"/);
    const name = cells.join(" ").match(/href="\/sets\/[^"]+\/precons\/[^"]+"[^>]*>([^<]+)</);
    if (!href || !name) continue;
    const url = `https://playgroup.gg${href[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const wr = cells[2]?.match(/(\d+(?:\.\d+)?)%/);
    const games = cells[3]?.match(/([\d,]+)/);
    const gc = cells.join(" ").match(/(\d+)\s+GC/);
    const tier = cells[1]?.match(/>([SABCD])<\/span>/);
    ranked.push({
      rank: Number(stripTags(cells[0] ?? "").trim()) || ranked.length + 1,
      name: decodeHtml(name[1] ?? ""),
      url,
      winRatePct: wr ? Number(wr[1]) : null,
      games: games ? Number(games[1].replace(/,/g, "")) : null,
      extra: {
        gameChangers: gc ? Number(gc[1]) : null,
        tier: tier?.[1] ?? null,
        commander: preconCommander(cells[5] ?? cells.join(" ")),
        set: preconSet(cells[5] ?? cells.join(" ")),
      },
    });
  }
  const listed: Array<{ name: string; url: string }> = [];
  for (const block of jsonLdBlocks(html)) {
    if (!block || typeof block !== "object") continue;
    const rec = block as { "@type"?: string; name?: string; itemListElement?: Array<{ name?: string; url?: string }> };
    if (rec["@type"] === "ItemList" && rec.name?.includes("All Commander Precons")) {
      for (const item of rec.itemListElement ?? []) {
        if (item.name && item.url) listed.push({ name: item.name, url: item.url });
      }
    }
  }
  return {
    source: "https://playgroup.gg/commander/precons",
    license: "CC-BY 4.0",
    dateModified: (dataset as { dateModified?: string } | null)?.dateModified ?? null,
    dataset,
    ranked,
    listed,
    parseNote: "Desktop table rows only (mobile duplicate dropped). JSON-LD listed directory is the full set catalog.",
  };
}

function parseCommanderTable(html: string) {
  const dataset = datasetFromLd(html);
  const ranked: RankedRow[] = [];
  const seen = new Set<string>();
  for (const cells of tableRows(html)) {
    const href = cells.join(" ").match(/href="(\/commanders\/[^"]+)"/);
    const name = cells.join(" ").match(/href="\/commanders\/[^"]+"[^>]*>([^<]+)</);
    if (!href || !name) continue;
    const url = `https://playgroup.gg${href[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const wrCell = cells.find((c) => /\d+(?:\.\d+)?%/.test(c)) ?? "";
    const wr = wrCell.match(/(\d+(?:\.\d+)?)%/);
    const gamesCell = cells.find((c, i) => i > 2 && /^\s*[\d,]+\s*$/.test(stripTags(c))) ?? "";
    const games = stripTags(gamesCell).match(/([\d,]+)/);
    const trend = cells.join(" ").match(/([+-]\d+(?:\.\d+)?)%/);
    const tier = cells.join(" ").match(/>([SABCD])<\/span>/);
    const rankCell = cells.find((c) => /^\s*\d+\s*$/.test(stripTags(c)));
    ranked.push({
      rank: rankCell ? Number(stripTags(rankCell).trim()) : ranked.length + 1,
      name: decodeHtml(name[1] ?? ""),
      url,
      winRatePct: wr ? Number(wr[1]) : null,
      games: games ? Number(games[1].replace(/,/g, "")) : null,
      extra: {
        tier: tier?.[1] ?? null,
        trendPct: trend ? Number(trend[1]) : null,
      },
    });
  }
  const mobileRe =
    /href="(\/commanders\/[^"]+)"[^>]*>([^<]+)<\/a>[\s\S]{0,220}?(\d+(?:\.\d+)?)%\s*<\/span>[\s\S]{0,140}?([\d,]+)\s+games/g;
  let mobile: RegExpExecArray | null;
  while ((mobile = mobileRe.exec(html))) {
    const url = `https://playgroup.gg${mobile[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    ranked.push({
      rank: ranked.length + 1,
      name: decodeHtml(mobile[2] ?? ""),
      url,
      winRatePct: Number(mobile[3]),
      games: Number((mobile[4] ?? "0").replace(/,/g, "")),
      extra: {},
    });
  }
  return {
    source: "https://playgroup.gg/commanders/tier-list",
    license: "CC-BY 4.0",
    dateModified: (dataset as { dateModified?: string } | null)?.dateModified ?? null,
    window: "last 30 days",
    dataset,
    ranked,
    parseNote: "Desktop table rows only. JSON-LD lists names/URLs without win rates.",
  };
}

function parseStaplesTable(html: string) {
  const dataset = datasetFromLd(html);
  const cards: RankedRow[] = [];
  const seen = new Set<string>();
  for (const cells of tableRows(html)) {
    const href = cells.join(" ").match(/href="(\/cards\/[^"?#]+)"/);
    const name =
      cells.join(" ").match(/alt='([^']+)'/) ??
      cells.join(" ").match(/>([A-Za-z][^<]{0,80})<\/span>/);
    if (!href || !name) continue;
    const url = `https://playgroup.gg${href[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const lift = cells.join(" ").match(/([+-]?\d+(?:\.\d+)?)\s*pp/);
    const games = (cells[4] ?? "").match(/([\d,]+)/);
    const pilots = (cells[5] ?? "").match(/([\d,]+)/);
    cards.push({
      rank: Number(stripTags(cells[0] ?? "").trim()) || cards.length + 1,
      name: decodeHtml(name[1] ?? ""),
      url,
      winRatePct: null,
      games: games ? Number(games[1].replace(/,/g, "")) : null,
      extra: {
        liftPp: lift ? Number(lift[1]) : null,
        pilots: pilots ? Number(pilots[1].replace(/,/g, "")) : null,
      },
    });
  }
  return {
    source: "https://playgroup.gg/commander/staples",
    license: "CC-BY 4.0",
    dateModified: (dataset as { dateModified?: string } | null)?.dateModified ?? null,
    dataset,
    cards,
    note: "Published card-strength ranking (commander-matched win-rate lift, 95% lower bound). Not the full 8,811-card Live atlas — that needs one Playgroup export.",
  };
}

function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const cells = [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1] ?? "");
    if (cells.length >= 3) rows.push(cells);
  }
  return rows;
}

function desktopRows(html: string): string[][] {
  const chunks = html.split(/<div class='overflow-x-auto hidden md:block'>/);
  const rows: string[][] = [];
  for (const chunk of chunks.slice(1)) {
    rows.push(...tableRows(chunk.split("</table>")[0] ?? ""));
  }
  return rows;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function preconCommander(cell: string): string | null {
  const text = stripTags(cell);
  const m = text.match(/·\s+(.+)$/);
  return m ? decodeHtml(m[1]).trim() : null;
}

function preconSet(cell: string): string | null {
  const m = cell.match(/href="\/sets\/[^"\/]+"[^>]*>([^<]+)</);
  return m ? decodeHtml(m[1] ?? "") : null;
}
