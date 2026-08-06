import { existsSync } from "fs";
import { join, extname } from "path";
import { getAdminStorage, getProjectId } from "../firebase/admin";
import { MTG_RAG_GCS_PREFIX } from "./constants";

export function resolveMtgRagBucket(): string | null {
  const explicit = process.env.MTG_RAG_BUCKET?.trim();
  if (explicit) return explicit;

  const firebaseBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (firebaseBucket) return firebaseBucket;

  const projectId = getProjectId();
  if (projectId) return `${projectId}.firebasestorage.app`;
  return null;
}

function contentTypeForFilename(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case ".jsonl":
      return "application/x-ndjson";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export interface MtgRagUploadResult {
  bucket: string;
  objectPath: string;
  gsUri: string;
  byteCount: number;
}

export async function uploadMtgRagFile(input: {
  localPath: string;
  filename: string;
  gcsSubdir: string;
}): Promise<MtgRagUploadResult> {
  const bucketName = resolveMtgRagBucket();
  if (!bucketName) {
    throw new Error(
      "MTG RAG bucket not configured. Set MTG_RAG_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.",
    );
  }

  const storage = getAdminStorage();
  if (!storage) {
    throw new Error("Firebase Storage unavailable for MTG RAG upload.");
  }

  if (!existsSync(input.localPath)) {
    throw new Error(`Local file not found: ${input.localPath}`);
  }

  const objectPath = `${MTG_RAG_GCS_PREFIX}/${input.gcsSubdir}/${input.filename}`;
  const bucket = storage.bucket(bucketName);
  const [file] = await bucket.upload(input.localPath, {
    destination: objectPath,
    metadata: {
      contentType: contentTypeForFilename(input.filename),
      metadata: {
        originalFilename: input.filename,
      },
    },
  });

  const [metadata] = await file.getMetadata();
  const byteCount = Number(metadata.size ?? 0);

  return {
    bucket: bucketName,
    objectPath,
    gsUri: `gs://${bucketName}/${objectPath}`,
    byteCount,
  };
}

export function buildMtgRagGsUri(bucket: string, gcsSubdir: string, filename: string): string {
  return `gs://${bucket}/${MTG_RAG_GCS_PREFIX}/${gcsSubdir}/${filename}`;
}

export function joinSourcesDir(baseDir: string, filename: string): string {
  return join(baseDir, filename);
}
