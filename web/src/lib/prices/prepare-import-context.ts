import { parseCsvText, rowToNormalizedRecord, normalizedRowToProductFields } from "./pricecharting-csv-parser";
import { inferCategoryFromPcRow } from "./identity-key";
import {
  createScryfallSetResolver,
  loadScryfallSetIndex,
  type ScryfallSetResolver,
} from "./scryfall-set-resolver";
import { preloadPlstOrigins } from "./plst-origin-lookup";
import type { IdentityInferenceContext } from "./identity-key";

export async function prepareMtgImportContext(
  fileText: string,
  options?: { preloadPlst?: boolean },
): Promise<IdentityInferenceContext> {
  console.log("Loading Scryfall set index…");
  const nameIndex = await loadScryfallSetIndex();
  const resolver = createScryfallSetResolver(nameIndex);
  console.log(`  ${nameIndex.size} set name entries indexed`);

  const context: IdentityInferenceContext = {
    scryfallSetResolver: resolver,
    plstOriginByNumber: new Map(),
  };

  if (options?.preloadPlst !== false) {
    const listNumbers = extractListCollectorNumbers(fileText);
    if (listNumbers.length > 0) {
      console.log(`Preloading ${listNumbers.length} The List origin lookups from Scryfall…`);
      const origins = await preloadPlstOrigins(listNumbers);
      context.plstOriginByNumber = origins;
      console.log(`  resolved ${origins.size} List origins`);
    }
  }

  return context;
}

function extractListCollectorNumbers(fileText: string): string[] {
  const nums = new Set<string>();
  for (const row of parseCsvText(fileText)) {
    const raw = rowToNormalizedRecord(row);
    const fields = normalizedRowToProductFields(raw);
    if (!fields) continue;
    if (!/the list/i.test(fields.consoleName ?? "")) continue;
    const m = fields.productName.match(/#(\d{1,4})\b/);
    if (m?.[1]) nums.add(m[1]);
  }
  return [...nums];
}

export async function prepareCategoryImportContext(
  category: string,
  fileText: string,
  options?: { preloadPlst?: boolean },
): Promise<IdentityInferenceContext | undefined> {
  if (category === "mtg" || category === "all") {
    return prepareMtgImportContext(fileText, options);
  }
  return undefined;
}

export { createScryfallSetResolver, loadScryfallSetIndex, type ScryfallSetResolver };
