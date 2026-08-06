import { v4 as uuidv4 } from "uuid";
import { isAdminConfigured } from "../firebase/admin";
import {
  isDataUrl,
  isStorageBucketMissingError,
  resolveStorageBucket,
} from "./card-images";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid media data URL");
  }
  return {
    mime: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

async function uploadEventFlyer(
  storeId: string,
  eventId: string,
  dataUrl: string,
  orientation: "portrait" | "landscape" = "portrait",
): Promise<string> {
  const bucket = await resolveStorageBucket();
  if (!bucket) {
    throw new Error("Firebase Storage bucket not found");
  }

  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = extFromMime(mime);
  const path = `stores/${storeId}/events/${eventId}/flyer-${orientation}.${ext}`;
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

async function uploadGalleryFlyer(
  storeId: string,
  galleryId: string,
  dataUrl: string,
  orientation: "portrait" | "landscape" = "portrait",
): Promise<string> {
  const bucket = await resolveStorageBucket();
  if (!bucket) {
    throw new Error("Firebase Storage bucket not found");
  }

  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = extFromMime(mime);
  const path = `stores/${storeId}/display-gallery/${galleryId}-${orientation}.${ext}`;
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

/** Upload generated flyer bytes to Storage — Firestore cannot store large base64 images. */
export async function persistEventFlyerImage(
  storeId: string,
  eventId: string,
  imageUrl: string,
  orientation: "portrait" | "landscape" = "portrait",
): Promise<string> {
  if (!imageUrl) return imageUrl;
  if (!isDataUrl(imageUrl)) return imageUrl;

  if (!isAdminConfigured()) {
    throw new Error(
      "Flyer image must be stored in Firebase Storage, but Firebase Admin is not configured.",
    );
  }

  try {
    return await uploadEventFlyer(storeId, eventId, imageUrl, orientation);
  } catch (err) {
    if (isStorageBucketMissingError(err)) {
      throw new Error(
        "Firebase Storage is not set up yet. Enable Storage in the Firebase Console, then try again.",
      );
    }
    throw err;
  }
}

/** Upload a manually added gallery flyer image. */
export async function persistGalleryFlyerImage(
  storeId: string,
  galleryId: string,
  imageUrl: string,
  orientation: "portrait" | "landscape" = "portrait",
): Promise<string> {
  if (!imageUrl) return imageUrl;
  if (!isDataUrl(imageUrl)) return imageUrl;

  if (!isAdminConfigured()) {
    throw new Error(
      "Flyer image must be stored in Firebase Storage, but Firebase Admin is not configured.",
    );
  }

  try {
    return await uploadGalleryFlyer(storeId, galleryId, imageUrl, orientation);
  } catch (err) {
    if (isStorageBucketMissingError(err)) {
      throw new Error(
        "Firebase Storage is not set up yet. Enable Storage in the Firebase Console, then try again.",
      );
    }
    throw err;
  }
}
