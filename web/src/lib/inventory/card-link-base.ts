import { getConfiguredAppUrl } from "../app-url";

/**
 * The origin printed into QR labels and Shopify barcodes. It must be the
 * store's final public domain before labels are printed: a label's QR and
 * the barcode POS matches it against have to stay identical forever.
 */
export function cardLinkBaseUrlV1(): string {
  return (process.env.CARD_LINK_BASE_URL?.trim() || getConfiguredAppUrl()).replace(/\/+$/, "");
}
