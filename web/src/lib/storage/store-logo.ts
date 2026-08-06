import { v4 as uuidv4 } from "uuid";
import { isAdminConfigured } from "../firebase/admin";
import {
  isDataUrl,
  isStorageBucketMissingError,
  resolveStorageBucket,
} from "./card-images";
import { LOGO_INLINE_MAX_BYTES } from "../camera/logo-limits";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid logo image data URL");
  }
  return {
    mime: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

async function uploadStoreLogo(dataUrl: string): Promise<string> {
  const bucket = await resolveStorageBucket();
  if (!bucket) {
    throw new Error("Firebase Storage bucket not found");
  }

  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = mime.includes("png") ? "png" : "jpg";
  const path = `store/logo.${ext}`;
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

/** Upload logo to Storage when available; otherwise keep a compressed inline data URL. */
export async function persistStoreLogo(url: string): Promise<string> {
  if (!url) return "";
  if (!isDataUrl(url)) return url;

  if (url.length > LOGO_INLINE_MAX_BYTES) {
    throw new Error("Logo is too large. Use a smaller image.");
  }

  if (!isAdminConfigured()) return url;

  try {
    return await uploadStoreLogo(url);
  } catch (err) {
    if (isStorageBucketMissingError(err)) {
      console.warn(
        "[storage] Bucket missing — saving store logo inline in Firestore.",
      );
      return url;
    }
    throw err;
  }
}
