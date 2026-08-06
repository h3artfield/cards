import { parseCollectorNumbersFromTitle } from "../card-flow-v2/market/mtg-pricecharting-match";
import type { ScryfallSetResolver } from "./scryfall-set-resolver";
import type { IdentityKeyFields } from "./identity-key";

export type MtgPcIdentityResult = IdentityKeyFields & {
  exactIdentityMatch: boolean;
  rejectedReason?: string;
  identityMatchReason?: string;
  printingSet?: string;
  originSet?: string;
  originCollectorNumber?: string;
};

export type PlstOriginLookup = (
  collectorNumber: string,
) => Promise<{ originSet?: string; originCollectorNumber?: string } | null>;

function parseTreatment(title: string): string {
  const lower = title.toLowerCase();
  if (/\bserialized\b/.test(lower)) return "serialized";
  if (/\bborderless\b/.test(lower)) return "borderless";
  if (/\bshowcase\b/.test(lower)) return "showcase";
  if (/\bextended art\b/.test(lower)) return "extended_art";
  if (/\bretro frame\b/.test(lower)) return "retro_frame";
  if (/\bemblem\b/.test(lower)) return "emblem";
  return "normal";
}

function parseFinish(title: string): string {
  if (/\bfoil\b/i.test(title) && !/\bnonfoil\b/i.test(title)) return "foil";
  return "nonfoil";
}

function cardNameFromTitle(productName: string): string {
  return productName
    .replace(/\[.*?\]/g, "")
    .replace(/#\d+.*/g, "")
    .trim();
}

function isListPrinting(setCode?: string, consoleName?: string): boolean {
  return setCode === "PLST" || /the list/i.test(consoleName ?? "");
}

export function inferMtgIdentityFromPriceChartingRow(
  input: {
    productName: string;
    consoleName?: string;
    genre?: string;
  },
  resolver: ScryfallSetResolver,
  plstOrigin?: { originSet?: string; originCollectorNumber?: string },
): MtgPcIdentityResult {
  const productName = input.productName.trim();
  const consoleName = input.consoleName?.trim() ?? "";
  const title = `${productName} ${consoleName}`;

  const bracket = productName.match(/\[([^\]]+)\]/);
  const bracketSetName = bracket?.[1];

  const resolved = resolver.resolveSetCode({
    consoleName,
    productName,
    bracketSetName,
  });

  let setCode = resolved.setCode;
  let setName = resolved.setName ?? bracketSetName;

  const nums = parseCollectorNumbersFromTitle(productName);
  const collectorNumber = nums.length === 1 ? nums[0] : nums[0];
  const finish = parseFinish(title);
  const treatment = parseTreatment(title);

  const fields: IdentityKeyFields = {
    category: "mtg",
    setCode,
    setName,
    collectorNumber,
    finish,
    treatment,
    cardName: cardNameFromTitle(productName),
    language: "en",
  };

  if (!setCode || !collectorNumber || nums.length !== 1) {
    return {
      ...fields,
      exactIdentityMatch: false,
      rejectedReason: !setCode
        ? "set_code_unresolved"
        : nums.length !== 1
          ? "ambiguous_collector_number"
          : "collector_number_missing",
    };
  }

  if (isListPrinting(setCode, consoleName)) {
    fields.printingSet = "PLST";
    fields.setCode = "PLST";
    fields.setName = "The List";

    if (plstOrigin?.originSet && plstOrigin.originCollectorNumber) {
      fields.originSet = plstOrigin.originSet.toUpperCase();
      fields.originCollectorNumber = plstOrigin.originCollectorNumber;
      fields.collectorNumber = `${fields.originSet}-${fields.originCollectorNumber}`;
      return { ...fields, exactIdentityMatch: true, identityMatchReason: "plst_with_origin" };
    }
    fields.collectorNumber = collectorNumber;
    return { ...fields, exactIdentityMatch: true, identityMatchReason: "plst_number_only" };
  }

  return {
    ...fields,
    exactIdentityMatch: true,
    identityMatchReason: resolved.matchReason ?? "mtg_set_and_number",
  };
}
