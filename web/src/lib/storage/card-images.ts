import { v4 as uuidv4 } from "uuid";
import { getAdminStorage, getProjectId, isAdminConfigured } from "../firebase/admin";
import type { ScannedCard } from "../types";
import { hasBackImage } from "../card-image-utils";

/** Firestore document limit is 1,048,576 bytes — leave room for other card fields. */
export const FIRESTORE_DOCUMENT_LIMIT = 1_048_576;
export const FIRESTORE_INLINE_IMAGE_MAX = 380_000;

let resolvedBucketName: string | null | undefined;

export function isDataUrl(url: string): boolean {
  return url.startsWith("data:");
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return {
    mime: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

function bucketCandidates(): string[] {
  const projectId = getProjectId();
  const fromEnv = [
    process.env.FIREBASE_STORAGE_BUCKET,
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ].filter(Boolean) as string[];

  const defaults = projectId
    ? [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`]
    : [];

  return [...new Set([...fromEnv, ...defaults])];
}

export async function resolveStorageBucket() {
  const storage = getAdminStorage();
  if (!storage) return null;

  if (resolvedBucketName) {
    return storage.bucket(resolvedBucketName);
  }

  for (const name of bucketCandidates()) {
    try {
      const bucket = storage.bucket(name);
      const fromEnv =
        name === process.env.FIREBASE_STORAGE_BUCKET ||
        name === process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      if (fromEnv) {
        resolvedBucketName = name;
        return bucket;
      }
      const [exists] = await bucket.exists();
      if (exists) {
        resolvedBucketName = name;
        return bucket;
      }
    } catch {
      // Try the next candidate.
    }
  }

  resolvedBucketName = null;
  return null;
}

export function isStorageBucketMissingError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  return (
    message.includes("The specified bucket does not exist") ||
    message.includes("Firebase Storage bucket not found") ||
    message.includes('"reason":"notFound"') ||
    message.includes("bucket does not exist")
  );
}

function assertInlineDocumentSize(card: ScannedCard): void {
  const inlineBytes =
    (isDataUrl(card.frontImageUrl) ? card.frontImageUrl.length : 0) +
    (isDataUrl(card.backImageUrl) ? card.backImageUrl.length : 0) +
    JSON.stringify({
      id: card.id,
      orderId: card.orderId,
      itemType: card.itemType,
      status: card.status,
    }).length;

  if (inlineBytes > FIRESTORE_DOCUMENT_LIMIT - 8_000) {
    throw new Error(
      "Photos are too large to save. Use Take Photo — the app compresses them automatically.",
    );
  }
}

export async function uploadCardImage(
  orderId: string,
  cardId: string,
  side: "front" | "back",
  dataUrl: string,
): Promise<string> {
  const bucket = await resolveStorageBucket();
  if (!bucket) {
    throw new Error("Firebase Storage bucket not found");
  }

  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = `orders/${orderId}/${cardId}/${side}.${ext}`;
  const token = uuidv4();

  await bucket.file(path).save(buffer, {
    metadata: {
      contentType: mime,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encoded = encodeURIComponent(path);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
}

async function persistImageUrl(
  orderId: string,
  cardId: string,
  side: "front" | "back",
  url: string,
): Promise<string> {
  if (!isDataUrl(url)) return url;

  if (url.length > FIRESTORE_INLINE_IMAGE_MAX) {
    throw new Error(
      "Image is too large to save. Retake with the Take Photo button.",
    );
  }

  if (!isAdminConfigured()) {
    return url;
  }

  try {
    return await uploadCardImage(orderId, cardId, side, url);
  } catch (err) {
    if (isStorageBucketMissingError(err) && url.length <= FIRESTORE_INLINE_IMAGE_MAX) {
      console.warn(
        "[storage] Bucket missing — saving compressed image inline in Firestore.",
      );
      return url;
    }
    throw err;
  }
}

export async function persistCardImages(card: ScannedCard): Promise<ScannedCard> {
  const frontImageUrl = await persistImageUrl(
    card.orderId,
    card.id,
    "front",
    card.frontImageUrl,
  );
  const backImageUrl = hasBackImage(card.backImageUrl)
    ? await persistImageUrl(card.orderId, card.id, "back", card.backImageUrl)
    : "";

  const persisted = { ...card, frontImageUrl, backImageUrl };
  if (isDataUrl(persisted.frontImageUrl) || isDataUrl(persisted.backImageUrl)) {
    assertInlineDocumentSize(persisted);
  }
  return persisted;
}
