/**
 * Per-family clause-native promotion control — toggled by eval scripts, not production default.
 */
export type PromotedNativeFamily = "granted_ability_quote" | "search_put_shuffle_chain";

let promotedFamilies: PromotedNativeFamily[] = [];

export function setRC3PromotedFamilies(families: PromotedNativeFamily[]): void {
  promotedFamilies = [...families];
}

export function getRC3PromotedFamilies(): PromotedNativeFamily[] {
  return [...promotedFamilies];
}

export function clearRC3PromotedFamilies(): void {
  promotedFamilies = [];
}
