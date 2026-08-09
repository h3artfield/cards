/**
 * Per-family clause-native promotion control — toggled by eval scripts, not production default.
 */
export type PromotedNativeFamily =
  | "granted_ability_quote"
  | "search_put_shuffle_chain"
  | "look_reveal_put_chain"
  | "activated_post_colon_effect"
  | "replacement_exile_instead";

/** Families merged into default RC3 output (not shadow-only). */
export const DEFAULT_RC3_PROMOTED_FAMILIES: PromotedNativeFamily[] = [
  "search_put_shuffle_chain",
  "look_reveal_put_chain",
  "activated_post_colon_effect",
  "replacement_exile_instead",
];

let promotedFamilies: PromotedNativeFamily[] = [...DEFAULT_RC3_PROMOTED_FAMILIES];

export function setRC3PromotedFamilies(families: PromotedNativeFamily[]): void {
  promotedFamilies = [...families];
}

export function getRC3PromotedFamilies(): PromotedNativeFamily[] {
  return [...promotedFamilies];
}

export function clearRC3PromotedFamilies(): void {
  promotedFamilies = [];
}

export function resetRC3PromotedFamiliesToDefault(): void {
  promotedFamilies = [...DEFAULT_RC3_PROMOTED_FAMILIES];
}
