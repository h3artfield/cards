/**
 * Deterministic Phase 5 benchmark — structural QA, not popularity.
 */
export type ArchetypeDiscoveryBenchmarkCase = {
  id: string;
  category:
    | "single_plan"
    | "multi_archetype"
    | "broad_value"
    | "hybrid"
    | "partner"
    | "background"
    | "incidental_audit";
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

export const ARCHETYPE_DISCOVERY_BENCHMARK_V1: ArchetypeDiscoveryBenchmarkCase[] = [
  { id: "single-graveyard-meren", category: "single_plan", commanders: ["Meren of Clan Nel Toth"], bracket: 3 },
  { id: "single-tokens-krenko", category: "single_plan", commanders: ["Krenko, Mob Boss"], bracket: 3 },
  { id: "single-spells-talrand", category: "single_plan", commanders: ["Talrand, Sky Summoner"], bracket: 3 },
  { id: "single-aristocrats-teysa", category: "single_plan", commanders: ["Teysa Karlov"], bracket: 3 },
  { id: "single-enchantress-sythis", category: "single_plan", commanders: ["Sythis, Harvest's Hand"], bracket: 2 },
  { id: "single-mill-bruvac", category: "single_plan", commanders: ["Bruvac the Grandiloquent"], bracket: 3 },
  { id: "single-landfall-omnath", category: "single_plan", commanders: ["Omnath, Locus of Rage"], bracket: 3 },
  { id: "single-voltron-lightpaws", category: "single_plan", commanders: ["Light-Paws, Emperor's Voice"], bracket: 2 },
  { id: "single-elves-lathril", category: "single_plan", commanders: ["Lathril, Blade of the Elves"], bracket: 3 },
  { id: "single-zombie-wilhelt", category: "single_plan", commanders: ["Wilhelt, the Rotcleaver"], bracket: 3 },
  { id: "multi-korvold", category: "multi_archetype", commanders: ["Korvold, Fae-Cursed King"], bracket: 4 },
  { id: "multi-atraxa", category: "multi_archetype", commanders: ["Atraxa, Praetors' Voice"], bracket: 3 },
  { id: "multi-muldrotha", category: "multi_archetype", commanders: ["Muldrotha, the Gravetide"], bracket: 3 },
  { id: "multi-edgar", category: "multi_archetype", commanders: ["Edgar Markov"], bracket: 3 },
  { id: "multi-kenrith", category: "multi_archetype", commanders: ["Kenrith, the Returned King"], bracket: 4 },
  { id: "multi-narset", category: "multi_archetype", commanders: ["Narset, Enlightened Exile"], bracket: 3 },
  { id: "broad-chulane", category: "broad_value", commanders: ["Chulane, Teller of Tales"], bracket: 3 },
  { id: "broad-jodah", category: "broad_value", commanders: ["Jodah, the Unifier"], bracket: 3 },
  { id: "broad-sisay", category: "broad_value", commanders: ["Sisay, Weatherlight Captain"], bracket: 4 },
  { id: "hybrid-kinnan", category: "hybrid", commanders: ["Kinnan, Bonder Prodigy"], bracket: 4 },
  { id: "hybrid-prosper", category: "hybrid", commanders: ["Prosper, Tome-Bound"], bracket: 3 },
  { id: "partner-thrasios-tymna", category: "partner", commanders: ["Thrasios, Triton Hero", "Tymna the Weaver"], bracket: 4 },
  { id: "partner-krark-sakashima", category: "partner", commanders: ["Krark, the Thumbless", "Sakashima of a Thousand Faces"], bracket: 4 },
  { id: "incidental-urza", category: "incidental_audit", commanders: ["Urza, Lord High Artificer"], bracket: 4, notes: "Should not surface token archetype from incidental text." },
  { id: "incidental-jeleva", category: "incidental_audit", commanders: ["Jeleva, Nephalia's Scourge"], bracket: 3, notes: "Spell-focused — incidental mechanics should not dominate." },
  { id: "incidental-zada", category: "incidental_audit", commanders: ["Zada, Hedron Grinder"], bracket: 3, notes: "Narrow spell plan — avoid false broad archetypes." },
  { id: "stax-augustin", category: "single_plan", commanders: ["Grand Arbiter Augustin IV"], bracket: 3 },
  { id: "yuriko-ninja", category: "single_plan", commanders: ["Yuriko, the Tiger's Shadow"], bracket: 4 },
];

export const ARCHETYPE_DISCOVERY_BENCHMARK_VERSION = "archetype-discovery-benchmark-v1";
