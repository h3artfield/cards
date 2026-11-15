import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  downloadFile,
  ensureDir,
  fetchJson,
  fileMeta,
  incomingRoot,
  sha256File,
  snapshotRoot,
  writeJson,
} from "./lib";

type BulkRow = {
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  download_uri?: string;
  compressed_size?: number;
};

type DeckListRow = {
  name?: string;
  code?: string;
  fileName?: string;
  type?: string;
  releaseDate?: string;
};

export async function fetchPublicDumps(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const incoming = incomingRoot();
  const scryDir = ensureDir(join(snap, "scryfall"));
  const mtgDir = ensureDir(join(snap, "mtgjson"));
  const incomingScry = ensureDir(join(incoming, "scryfall"));
  const incomingMtg = ensureDir(join(incoming, "mtgjson"));

  const bulk = await fetchJson<{ data?: BulkRow[] }>("https://api.scryfall.com/bulk-data");
  if (!bulk.json?.data) throw new Error(`Scryfall bulk-data failed (${bulk.status})`);
  writeJson(join(scryDir, "bulk-data.json"), bulk.json);
  writeJson(join(incomingScry, "bulk-data.json"), bulk.json);

  const wanted = ["oracle_cards", "oracle_tags"] as const;
  const scryfallFiles: Record<string, unknown> = {};
  for (const type of wanted) {
    const row = bulk.json.data.find((d) => d.type === type);
    if (!row) throw new Error(`missing bulk type ${type}`);
    const url = row.jsonl_download_uri ?? row.download_uri;
    if (!url) throw new Error(`no download uri for ${type}`);
    const name = url.split("/").pop() ?? `${type}.jsonl.gz`;
    const dest = join(scryDir, name);
    console.log(`scryfall ${type} ${url}`);
    scryfallFiles[type] = {
      updatedAt: row.updated_at,
      url,
      advertisedCompressedSize: row.compressed_size ?? null,
      ...(await downloadFile(url, dest)),
      dest: dest.replace(/\\/g, "/"),
    };
  }

  const deckListUrl = "https://mtgjson.com/api/v5/DeckList.json";
  const deckListDest = join(mtgDir, "DeckList.json");
  console.log(`mtgjson DeckList ${deckListUrl}`);
  const deckListMeta = await downloadFile(deckListUrl, deckListDest);

  const zipUrl = "https://mtgjson.com/api/v5/AllDeckFiles.zip";
  const zipDest = join(mtgDir, "AllDeckFiles.zip");
  console.log(`mtgjson AllDeckFiles ${zipUrl}`);
  const zipMeta = await downloadFile(zipUrl, zipDest);

  const extractDir = ensureDir(join(mtgDir, "AllDeckFiles"));
  extractZip(zipDest, extractDir);
  const commanderIndex = indexCommanderDecks(deckListDest, extractDir);
  writeJson(join(mtgDir, "commander-deck-index.json"), commanderIndex);

  const report = {
    scryfall: scryfallFiles,
    mtgjson: {
      deckList: { url: deckListUrl, ...deckListMeta, dest: deckListDest.replace(/\\/g, "/") },
      allDeckFiles: {
        url: zipUrl,
        ...zipMeta,
        dest: zipDest.replace(/\\/g, "/"),
        extractedDir: extractDir.replace(/\\/g, "/"),
        extractedFileCount: commanderIndex.extractedFileCount,
      },
      commanderIndex: {
        dest: join(mtgDir, "commander-deck-index.json").replace(/\\/g, "/"),
        sha256: sha256File(join(mtgDir, "commander-deck-index.json")),
        commanderDecks: commanderIndex.commanderDecks.length,
        officialPreconsLast3Years: commanderIndex.officialPreconsLast3Years.length,
      },
    },
    copiedIncoming: {
      deckList: existsSync(join(incomingMtg, "DeckList.json"))
        ? fileMeta(join(incomingMtg, "DeckList.json"))
        : null,
    },
  };
  writeJson(join(scryDir, "hashes.json"), scryfallFiles);
  writeJson(join(mtgDir, "hashes.json"), report.mtgjson);
  return report;
}

function extractZip(zipPath: string, destDir: string): void {
  ensureDir(destDir);
  if (process.platform === "win32") {
    execFileSync("tar.exe", ["-xf", zipPath, "-C", destDir], { stdio: "inherit" });
    return;
  }
  execFileSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
}

function indexCommanderDecks(deckListPath: string, extractDir: string) {
  const raw = JSON.parse(readFileSync(deckListPath, "utf8")) as {
    meta?: { date?: string; version?: string };
    data?: DeckListRow[];
  };
  const cutoff = "2023-09-25";
  const files = new Map<string, string>();
  walkFiles(extractDir, files);
  const commanderDecks = [];
  for (const row of raw.data ?? []) {
    const type = (row.type ?? "").toLowerCase();
    if (!type.includes("commander")) continue;
    const fileName = row.fileName ?? "";
    const extracted =
      files.get(`${fileName}.json`) ??
      files.get(fileName) ??
      [...files.entries()].find(([name]) => name.startsWith(fileName))?.[1] ??
      null;
    commanderDecks.push({
      name: row.name ?? fileName,
      code: row.code ?? null,
      fileName,
      type: row.type ?? null,
      releaseDate: row.releaseDate ?? null,
      extractedPath: extracted,
      sha256: extracted && existsSync(extracted) ? sha256File(extracted) : null,
    });
  }
  const officialPreconsLast3Years = commanderDecks.filter(
    (d) => d.releaseDate && d.releaseDate >= cutoff,
  );
  return {
    meta: raw.meta ?? null,
    extractedFileCount: files.size,
    commanderDecks,
    officialPreconsLast3Years,
    note: "B2 comparison set is official precons from the last ~3 years that later measure B2. This index is the candidate pool, not the measured field.",
  };
}

function walkFiles(dir: string, out: Map<string, string>): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.set(name, full);
  }
}
