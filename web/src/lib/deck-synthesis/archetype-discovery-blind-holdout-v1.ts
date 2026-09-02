/**
 * Blind archetype-discovery holdout v1 — DEVELOPMENT / DIAGNOSTIC SET.
 *
 * Originally frozen before Phase 5.2 algorithm repairs.
 * Relabeled after Phase 5.2 diagnostics: SPENT for repair tuning — NOT final unbiased evidence.
 * Future unbiased gate: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V2 (sealed until Phase 5.3 freeze).
 *
 * DEV regression set: ARCHETYPE_DISCOVERY_BENCHMARK_V1 (28 commanders).
 */
import { createHash } from "node:crypto";

export type ArchetypeDiscoveryBlindCase = {
  id: string;
  category:
    | "narrow_single_plan"
    | "multiple_legitimate_plans"
    | "tribal_type"
    | "spells"
    | "graveyard"
    | "artifacts_enchantments"
    | "combat"
    | "lands"
    | "combo_engines"
    | "broad_value"
    | "partner_background"
    | "unusual_mechanical";
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

/** Frozen 40-commander blind v1 — development/diagnostic (membership frozen; name typos may be corrected). */
export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1: ArchetypeDiscoveryBlindCase[] = [
  { id: "blind-ghave", category: "multiple_legitimate_plans", commanders: ["Ghave, Guru of Spores"], bracket: 3 },
  { id: "blind-gitrog", category: "graveyard", commanders: ["The Gitrog Monster"], bracket: 3 },
  { id: "blind-azusa", category: "lands", commanders: ["Azusa, Lost but Seeking"], bracket: 2 },
  { id: "blind-najeela", category: "combat", commanders: ["Najeela, the Blade-Blossom"], bracket: 4 },
  { id: "blind-winota", category: "combat", commanders: ["Winota, Joiner of Forces"], bracket: 3 },
  { id: "blind-kess", category: "spells", commanders: ["Kess, Dissident Mage"], bracket: 3 },
  { id: "blind-breya", category: "artifacts_enchantments", commanders: ["Breya, Etherium Shaper"], bracket: 3 },
  { id: "blind-animar", category: "combo_engines", commanders: ["Animar, Soul of Elements"], bracket: 4 },
  { id: "blind-marath", category: "multiple_legitimate_plans", commanders: ["Marath, Will of the Wild"], bracket: 3 },
  { id: "blind-heliod", category: "combo_engines", commanders: ["Heliod, Sun-Crowned"], bracket: 3 },
  { id: "blind-purphoros", category: "narrow_single_plan", commanders: ["Purphoros, God of the Forge"], bracket: 3 },
  { id: "blind-rhys", category: "tribal_type", commanders: ["Rhys the Redeemed"], bracket: 3 },
  { id: "blind-shalai", category: "tribal_type", commanders: ["Shalai, Voice of Plenty"], bracket: 3 },
  { id: "blind-selvala", category: "lands", commanders: ["Selvala, Heart of the Wilds"], bracket: 3 },
  { id: "blind-chatterfang", category: "multiple_legitimate_plans", commanders: ["Chatterfang, Squirrel General"], bracket: 3 },
  { id: "blind-esika", category: "tribal_type", commanders: ["Esika, God of the Tree"], bracket: 3 },
  { id: "blind-golos", category: "broad_value", commanders: ["Golos, Tireless Pilgrim"], bracket: 3 },
  { id: "blind-nivmizzet", category: "spells", commanders: ["Niv-Mizzet, Parun"], bracket: 3 },
  { id: "blind-mizzix", category: "spells", commanders: ["Mizzix of the Izmagnus"], bracket: 3 },
  { id: "blind-locust", category: "multiple_legitimate_plans", commanders: ["The Locust God"], bracket: 3 },
  { id: "blind-neheb", category: "combat", commanders: ["Neheb, the Eternal"], bracket: 3 },
  { id: "blind-kaalia", category: "combat", commanders: ["Kaalia of the Vast"], bracket: 3 },
  { id: "blind-captain-sisay", category: "tribal_type", commanders: ["Captain Sisay"], bracket: 4 },
  { id: "blind-rafiq", category: "combat", commanders: ["Rafiq of the Many"], bracket: 3 },
  { id: "blind-sefris", category: "graveyard", commanders: ["Sefris of the Hidden Ways"], bracket: 3 },
  { id: "blind-hogaak", category: "graveyard", commanders: ["Hogaak, Arisen Necropolis"], bracket: 4 },
  { id: "blind-tergrid", category: "artifacts_enchantments", commanders: ["Tergrid, God of Fright"], bracket: 3 },
  { id: "blind-magda", category: "artifacts_enchantments", commanders: ["Magda, Brazen Outlaw"], bracket: 3 },
  { id: "blind-ishai", category: "spells", commanders: ["Ishai, Ojutai Dragonspeaker"], bracket: 3 },
  { id: "blind-kykar", category: "spells", commanders: ["Kykar, Wind's Fury"], bracket: 3 },
  { id: "blind-elsha", category: "artifacts_enchantments", commanders: ["Elsha of the Infinite"], bracket: 3 },
  { id: "blind-tasigur", category: "graveyard", commanders: ["Tasigur, the Golden Fang"], bracket: 3 },
  { id: "blind-yarok", category: "multiple_legitimate_plans", commanders: ["Yarok, the Desecrated"], bracket: 3 },
  { id: "blind-aesi", category: "lands", commanders: ["Aesi, Tyrant of Gyre Strait"], bracket: 3 },
  { id: "blind-tivit", category: "combo_engines", commanders: ["Tivit, Seller of Secrets"], bracket: 4 },
  { id: "blind-rocco", category: "broad_value", commanders: ["Rocco, Cabaretti Caterer"], bracket: 3 },
  { id: "blind-toxrill", category: "narrow_single_plan", commanders: ["Toxrill, the Corrosive"], bracket: 3 },
  { id: "blind-zinnia", category: "artifacts_enchantments", commanders: ["Zinnia, Valley's Voice"], bracket: 3 },
  { id: "blind-alela", category: "artifacts_enchantments", commanders: ["Alela, Artful Provocateur"], bracket: 3 },
  {
    id: "blind-ikra-toggo",
    category: "partner_background",
    commanders: ["Ikra Shidiqi, the Usurper", "Toggo, Goblin Weaponsmith"],
    bracket: 3,
  },
];

export const ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_VERSION = "archetype-discovery-blind-holdout-v1";

/** v1 is spent for Phase 5.3 repair diagnostics — not unbiased generalization evidence. */
export const ARCHETYPE_DISCOVERY_BLIND_V1_STATUS = "DEVELOPMENT_DIAGNOSTIC_SPENT" as const;

export function blindHoldoutSetHash(): string {
  return createHash("sha256").update(JSON.stringify(ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1)).digest("hex");
}

export function blindHoldoutCategoryComposition(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V1) {
    out[c.category] = (out[c.category] ?? 0) + 1;
  }
  return out;
}
