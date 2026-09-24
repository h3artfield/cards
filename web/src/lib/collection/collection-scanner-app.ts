export const COLLECTION_SCANNER_SCHEME = "cards9k";

export function collectionScannerAppHref(slug: string): string {
  return `${COLLECTION_SCANNER_SCHEME}://scan?store=${encodeURIComponent(slug)}`;
}
