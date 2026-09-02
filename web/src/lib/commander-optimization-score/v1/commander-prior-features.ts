/**
 * Commander-card features for the unseen-commander intercept prior.
 * Uses the same frozen regex families as COS access, plus a few commander-text
 * capability flags. No color-count bonus. No deck-99 features. No outcomes.
 */
import { familiesFromText, type CosV1CatalogPoint } from "./access-features";

export const COS_V1_COMMANDER_PRIOR_FEATURE_NAMES = [
  "manaValue",
  "isCreature",
  "isPlaneswalker",
  "isEnchantment",
  "tutor",
  "draw",
  "ramp",
  "interact",
  "protect",
  "recur",
  "plusOneCounters",
  "tokens",
  "lifegain",
  "sacrifice",
  "combat",
] as const;

export type CosV1CommanderPriorFeatureName = (typeof COS_V1_COMMANDER_PRIOR_FEATURE_NAMES)[number];

const RX_PLUS_ONE = /\+1\/\+1 counter/i;
const RX_TOKEN = /create(?:s|d)? (?:a |two |three |.+ )?.*token/i;
const RX_LIFE = /(?:gain|gains|you gain) (?:.+\s)?life|lifelink|whenever you gain life/i;
const RX_SAC = /sacrific(?:e|es) /i;
const RX_COMBAT = /combat damage|attacking creature|creatures you control get|double strike|first strike/i;

export function commanderPriorFeatureVector(args: {
  oracleIds: string[];
  points: Map<string, CosV1CatalogPoint>;
  texts: Map<string, string>;
}): { x: number[]; covered: number } {
  const ids = [...new Set(args.oracleIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    return { x: COS_V1_COMMANDER_PRIOR_FEATURE_NAMES.map(() => 0), covered: 0 };
  }
  const acc = COS_V1_COMMANDER_PRIOR_FEATURE_NAMES.map(() => 0);
  let covered = 0;
  for (const oid of ids) {
    const pt = args.points.get(oid);
    const text = args.texts.get(oid) ?? "";
    if (pt || text) covered += 1;
    const tl = (pt?.typeLine ?? "").toLowerCase();
    const fam = familiesFromText(text);
    const row: Record<CosV1CommanderPriorFeatureName, number> = {
      manaValue: pt?.manaValue != null && Number.isFinite(pt.manaValue) ? Number(pt.manaValue) : 0,
      isCreature: tl.includes("creature") ? 1 : 0,
      isPlaneswalker: tl.includes("planeswalker") ? 1 : 0,
      isEnchantment: tl.includes("enchantment") ? 1 : 0,
      tutor: fam.has("tutor") ? 1 : 0,
      draw: fam.has("draw") ? 1 : 0,
      ramp: fam.has("ramp") ? 1 : 0,
      interact: fam.has("interact") ? 1 : 0,
      protect: fam.has("protect") ? 1 : 0,
      recur: fam.has("recur") ? 1 : 0,
      plusOneCounters: RX_PLUS_ONE.test(text) ? 1 : 0,
      tokens: RX_TOKEN.test(text) ? 1 : 0,
      lifegain: RX_LIFE.test(text) ? 1 : 0,
      sacrifice: RX_SAC.test(text) ? 1 : 0,
      combat: RX_COMBAT.test(text) ? 1 : 0,
    };
    COS_V1_COMMANDER_PRIOR_FEATURE_NAMES.forEach((name, i) => {
      acc[i] += row[name];
    });
  }
  return { x: acc.map((v) => v / ids.length), covered };
}
