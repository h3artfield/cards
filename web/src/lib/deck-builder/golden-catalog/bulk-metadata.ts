import { createHash } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { scryfallFetch } from "../../processing/scryfall-client";
import type { BulkDatasetMetadata, BulkDatasetType } from "./schemas";

const BULK_API = "https://api.scryfall.com/bulk-data";

export function getBulkCacheDir(): string {
  return process.env.SCRYFALL_BULK_CACHE_DIR?.trim()
    || path.join(process.cwd(), ".cache", "scryfall-bulk");
}

export async function fetchAllBulkMetadata(): Promise<BulkDatasetMetadata[]> {
  const res = await scryfallFetch(BULK_API);
  if (!res.ok) throw new Error(`Scryfall bulk-data failed (${res.status})`);
  const body = (await res.json()) as {
    data?: Array<{
      id: string;
      type: string;
      name: string;
      updated_at: string;
      download_uri?: string;
      compressed_size?: number;
      jsonl_download_uri?: string;
    }>;
  };
  return (body.data ?? []).map((entry) => ({
    type: entry.type as BulkDatasetType,
    scryfallId: entry.id,
    name: entry.name,
    updatedAt: entry.updated_at,
    downloadUri: entry.jsonl_download_uri ?? entry.download_uri ?? "",
    compressedSizeBytes: entry.compressed_size ?? 0,
  }));
}

export async function fetchBulkMetadata(
  type: BulkDatasetType,
): Promise<BulkDatasetMetadata | null> {
  const all = await fetchAllBulkMetadata();
  return all.find((d) => d.type === type) ?? null;
}

function cacheFilePath(meta: BulkDatasetMetadata): string {
  const stamp = meta.updatedAt.replace(/[:.]/g, "-");
  const ext = meta.downloadUri.endsWith(".gz") ? ".jsonl.gz" : ".jsonl";
  return path.join(getBulkCacheDir(), `${meta.type}-${stamp}${ext}`);
}

export async function downloadBulkToCache(
  meta: BulkDatasetMetadata,
  input?: { force?: boolean },
): Promise<{ cachePath: string; contentHash: string; sizeBytes: number }> {
  await mkdir(getBulkCacheDir(), { recursive: true });
  const cachePath = cacheFilePath(meta);
  const hashPath = `${cachePath}.sha256`;

  if (!input?.force && existsSync(cachePath) && existsSync(hashPath)) {
    const hash = readFileSync(hashPath, "utf8").trim();
    return { cachePath, contentHash: hash, sizeBytes: statSync(cachePath).size };
  }

  const res = await fetch(meta.downloadUri, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        process.env.SCRYFALL_USER_AGENT ??
        "CardBuyback/1.0 (+https://buyback-web-staging-rrogeqxyea-uc.a.run.app)",
    },
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`Bulk download failed (${res.status}): ${meta.type}`);
  if (!res.body) throw new Error(`Bulk download empty body: ${meta.type}`);

  const nodeStream =
    res.body instanceof Readable
      ? res.body
      : Readable.fromWeb(res.body as import("stream/web").ReadableStream);

  const hash = createHash("sha256");
  await mkdir(path.dirname(cachePath), { recursive: true });
  const fileStream = createWriteStream(cachePath);

  await new Promise<void>((resolve, reject) => {
    nodeStream.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      fileStream.write(chunk);
    });
    nodeStream.on("end", () => {
      fileStream.end();
    });
    nodeStream.on("error", reject);
    fileStream.on("error", reject);
    fileStream.on("finish", resolve);
  });

  const contentHash = hash.digest("hex");
  await writeFile(hashPath, contentHash, "utf8");
  return { cachePath, contentHash, sizeBytes: statSync(cachePath).size };
}

export function shouldSkipBulkImport(input: {
  dataset: BulkDatasetType;
  bulkUpdatedAt: string;
  contentHash: string;
  syncState?: {
    oracleCardsBulkUpdatedAt?: string;
    oracleCardsContentHash?: string;
    defaultCardsBulkUpdatedAt?: string;
    defaultCardsContentHash?: string;
    oracleTagsBulkUpdatedAt?: string;
    oracleTagsContentHash?: string;
  } | null;
}): { skip: boolean; reason?: string } {
  const s = input.syncState;
  if (!s) return { skip: false };

  if (input.dataset === "oracle_cards") {
    if (
      s.oracleCardsBulkUpdatedAt === input.bulkUpdatedAt &&
      s.oracleCardsContentHash === input.contentHash
    ) {
      return { skip: true, reason: "oracle_cards bulk unchanged" };
    }
  }
  if (input.dataset === "default_cards") {
    if (
      s.defaultCardsBulkUpdatedAt === input.bulkUpdatedAt &&
      s.defaultCardsContentHash === input.contentHash
    ) {
      return { skip: true, reason: "default_cards bulk unchanged" };
    }
  }
  if (input.dataset === "oracle_tags") {
    if (
      s.oracleTagsBulkUpdatedAt === input.bulkUpdatedAt &&
      s.oracleTagsContentHash === input.contentHash
    ) {
      return { skip: true, reason: "oracle_tags bulk unchanged" };
    }
  }
  return { skip: false };
}
