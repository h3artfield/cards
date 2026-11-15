import { isStorageBucketMissingError, resolveStorageBucket } from "../storage/card-images";
import type { TokenCardV1 } from "./design-v1";
import type { TokenReferenceV1 } from "./types-v1";

/**
 * Token art and print files live in Cloud Storage with no public download
 * token. They are only reachable through our asset routes, which check that
 * the caller owns the file (or is staff at the store), so one customer's art
 * cannot be fetched by guessing another's path.
 */
export function tokenAssetPrefixV1(storeId: string, customerId: string): string {
  return `tokenCreator/${storeId}/${customerId}/`;
}

/** Drops asset references that point outside this customer's own files. */
export function restrictTokenCardAssetsV1(card: TokenCardV1, storeId: string, customerId: string): TokenCardV1 {
  const prefix = tokenAssetPrefixV1(storeId, customerId);
  const own = (path: string | null | undefined) => Boolean(path && path.startsWith(prefix) && !path.includes(".."));
  let out = card;
  if (out.panelArt && !own(out.panelArt.path)) out = { ...out, panelArt: null };
  if (out.symbol?.icon === "upload" && !own(out.symbol.path)) out = { ...out, symbol: null };
  return out;
}

export function tokenUploadPrefixV1(storeId: string, customerId: string): string {
  return `${tokenAssetPrefixV1(storeId, customerId)}uploads/`;
}

/** A reference image is only accepted when it is one of this customer's own uploads. */
export function sanitizeTokenReferenceV1(raw: unknown, storeId: string, customerId: string): TokenReferenceV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { path?: unknown; use?: unknown };
  if (typeof r.path !== "string" || r.path.includes("..") || !r.path.startsWith(tokenUploadPrefixV1(storeId, customerId))) {
    return null;
  }
  return { path: r.path, use: typeof r.use === "string" ? r.use.slice(0, 600) : "" };
}

const UPLOAD_TYPES: Array<{ type: string; ext: string; magic: number[]; at?: number }> = [
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { type: "image/webp", ext: "webp", magic: [0x57, 0x45, 0x42, 0x50], at: 8 },
];

/** The image type from the file's own bytes, never from its name or the browser's claim. */
export function sniffTokenUploadTypeV1(bytes: Buffer): { type: string; ext: string } | null {
  const hit = UPLOAD_TYPES.find((t) => t.magic.every((b, i) => bytes[(t.at ?? 0) + i] === b));
  return hit ? { type: hit.type, ext: hit.ext } : null;
}

export async function saveTokenAssetV1(path: string, bytes: Buffer, contentType: string): Promise<void> {
  const bucket = await resolveStorageBucket();
  if (!bucket) throw new Error("Cloud Storage is not configured for token art.");
  try {
    await bucket.file(path).save(bytes, {
      resumable: false,
      metadata: { contentType, cacheControl: "private, max-age=31536000, immutable" },
    });
  } catch (err) {
    if (isStorageBucketMissingError(err)) {
      throw new Error("Firebase Storage is not set up yet, so token art cannot be saved.");
    }
    throw err;
  }
}

export async function readTokenAssetV1(path: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const bucket = await resolveStorageBucket();
  if (!bucket) return null;
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [[bytes], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return { bytes, contentType: (meta.contentType as string | undefined) ?? "image/png" };
}

/** The URL a signed-in customer's browser loads an asset from. */
export function customerTokenAssetUrlV1(slug: string, path: string): string {
  return `/api/store/${encodeURIComponent(slug)}/tokens/asset?path=${encodeURIComponent(path)}`;
}

export function adminTokenAssetUrlV1(path: string, download = false): string {
  return `/api/admin/token-orders/asset?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG header, or null when the bytes are not a PNG. */
export function pngDimensionsV1(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
