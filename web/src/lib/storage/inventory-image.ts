import { v4 as uuidv4 } from "uuid";
import { resolveStorageBucket } from "./card-images";
import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "../inventory/image-url";

export { isFirebaseStorageUrl, isTcgplayerCdnUrl };

export async function cacheInventoryImageFromBuffer(input: {
  storeId: string;
  inventoryItemId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const bucket = await resolveStorageBucket();
  if (!bucket) {
    throw new Error("Firebase Storage bucket not found");
  }

  const ext = input.contentType.includes("png") ? "png" : "jpg";
  const path = `stores/${input.storeId}/inventory/${input.inventoryItemId}/cover.${ext}`;
  const token = uuidv4();

  await bucket.file(path).save(input.buffer, {
    metadata: {
      contentType: input.contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encoded = encodeURIComponent(path);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
}
