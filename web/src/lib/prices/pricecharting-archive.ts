import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { getAdminStorage } from "../firebase/admin";

export type PriceChartingArchiveResult = {
  bucket: string;
  rawPrefix: string;
  rawPaths: string[];
  reportPath: string;
};

export function resolveArchiveBucket(): string | null {
  const explicit = process.env.PRICECHARTING_ARCHIVE_BUCKET?.trim();
  return explicit || null;
}

export async function uploadRawCsvArchive(input: {
  date: string;
  rawDir: string;
}): Promise<Pick<PriceChartingArchiveResult, "bucket" | "rawPrefix" | "rawPaths">> {
  const bucketName = resolveArchiveBucket();
  if (!bucketName) {
    return { bucket: "", rawPrefix: "", rawPaths: [] };
  }

  const storage = getAdminStorage();
  if (!storage) {
    throw new Error("Firebase Storage unavailable for PriceCharting archive upload");
  }

  const bucket = storage.bucket(bucketName);
  const rawPrefix = `raw/${input.date}`;
  const rawPaths: string[] = [];

  if (existsSync(input.rawDir)) {
    for (const fileName of readdirSync(input.rawDir)) {
      const localPath = join(input.rawDir, fileName);
      const objectPath = `${rawPrefix}/${fileName}`;
      await bucket.upload(localPath, {
        destination: objectPath,
        metadata: { contentType: "text/csv" },
      });
      rawPaths.push(`gs://${bucketName}/${objectPath}`);
    }
  }

  return {
    bucket: bucketName,
    rawPrefix: `gs://${bucketName}/${rawPrefix}/`,
    rawPaths,
  };
}

export async function uploadReportArchive(input: {
  date: string;
  reportLocalPath: string;
}): Promise<string | null> {
  const bucketName = resolveArchiveBucket();
  if (!bucketName) return null;

  const storage = getAdminStorage();
  if (!storage) {
    throw new Error("Firebase Storage unavailable for PriceCharting archive upload");
  }

  const reportObject = `reports/${input.date}-import-report.json`;
  await storage.bucket(bucketName).upload(input.reportLocalPath, {
    destination: reportObject,
    metadata: { contentType: "application/json" },
  });
  return `gs://${bucketName}/${reportObject}`;
}

export async function uploadDailyPriceChartingArchive(input: {
  date: string;
  rawDir: string;
  reportLocalPath: string;
}): Promise<PriceChartingArchiveResult | null> {
  const bucketName = resolveArchiveBucket();
  if (!bucketName) return null;

  const raw = await uploadRawCsvArchive(input);
  const reportPath = await uploadReportArchive({
    date: input.date,
    reportLocalPath: input.reportLocalPath,
  });
  if (!reportPath) return null;

  return {
    bucket: bucketName,
    rawPrefix: raw.rawPrefix,
    rawPaths: raw.rawPaths,
    reportPath,
  };
}
