export const HOW_COS_WORKS_PATH = "/how-cos-works";

export function howCosWorksPath(storeSlug?: string | null): string {
  if (!storeSlug) return HOW_COS_WORKS_PATH;
  return `/s/${storeSlug}/inventory/professor/how-cos-works`;
}
