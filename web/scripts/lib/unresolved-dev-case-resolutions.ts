/**
 * Catalog-backed resolutions for development cases excluded from v11.
 * Maps synthetic fragment / multiface test IDs to real catalogOracleCards records.
 */
import type { GoldSeedHint } from "./gold-relabel-engine";

export interface DevCaseCatalogResolution {
  caseId: string;
  catalogCardName: string;
  /** Which face/component the case exercises within the catalog card. */
  faceIndex?: number;
  faceName?: string;
  componentType?: "front" | "back" | "aftermath" | "left" | "right";
  /** Legacy cardFace hint for evidence corpus selection. */
  cardFace?: string;
  /** Optional seed hints carried from prior synthetic gold intent. */
  seedHint?: GoldSeedHint;
}

export interface PermanentlyExcludedDevCase {
  caseId: string;
  reason: string;
  category: "synthetic_fragment" | "no_catalog_representative" | "layout_not_in_catalog";
}

/** Cases resolved to real catalog cards — gold relabeled from catalog oracle text. */
export const RESOLVED_DEV_CASE_CATALOG_MAP: DevCaseCatalogResolution[] = [
  { caseId: "eval-0110", catalogCardName: "Drogskol Reaver", seedHint: { primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0115", catalogCardName: "Spell Contortion", seedHint: { primitives: [{ actionType: "counter", evidenceContains: "Counter target spell unless" }] } },
  { caseId: "eval-0117", catalogCardName: "My Precious // Allure of Power", cardFace: "back", faceIndex: 1, componentType: "back", seedHint: { face: "back", primitives: [{ actionType: "draw", evidenceContains: "draw two cards" }] } },
  { caseId: "eval-0119", catalogCardName: "Ignacio of Myra's Marvels", seedHint: { primitives: [{ actionType: "create_token", evidenceContains: "Treasure token" }] } },
  { caseId: "eval-0146", catalogCardName: "Merfolk Coralsmith", seedHint: { primitives: [{ actionType: "scry", evidenceContains: "Scry 2" }] } },
  { caseId: "eval-0155", catalogCardName: "Natural Affinity", seedHint: { structure: { abilityTypes: ["spell_effect"] } } },
  { caseId: "eval-0166", catalogCardName: "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge", cardFace: "front", faceIndex: 0, componentType: "front", seedHint: { face: "front", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0167", catalogCardName: "Tovolar's Huntmaster // Tovolar's Packleader", cardFace: "back", faceIndex: 1, componentType: "back", seedHint: { face: "back", primitives: [{ actionType: "create_token", evidenceContains: "Wolf creature token" }] } },
  { caseId: "eval-0199", catalogCardName: "Combat Thresher", seedHint: { primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0200", catalogCardName: "Goring Warplow", seedHint: { forbidden: ["draw", "destroy"] } },
  { caseId: "eval-0201", catalogCardName: "Pollywog Symbiote", seedHint: { primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0202", catalogCardName: "Porcuparrot" },
  { caseId: "eval-0203", catalogCardName: "Sorcerer Class", seedHint: { primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0263", catalogCardName: "Grand Entryway // Elegant Rotunda", cardFace: "front", faceIndex: 0, componentType: "front", seedHint: { face: "front", primitives: [{ actionType: "create_token", evidenceContains: "create a 1/1" }] } },
  { caseId: "eval-0264", catalogCardName: "Glassworks // Shattered Yard", cardFace: "front", faceIndex: 0, componentType: "front", seedHint: { face: "front", primitives: [{ actionType: "deal_damage", evidenceContains: "deals 4 damage" }] } },
  { caseId: "eval-0265", catalogCardName: "Tovolar's Huntmaster // Tovolar's Packleader" },
  { caseId: "eval-0266", catalogCardName: "Suspicious Stowaway // Seafaring Werewolf", seedHint: { face: "front", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0269", catalogCardName: "Beck // Call" },
  { caseId: "eval-0270", catalogCardName: "Overwhelmed Archivist // Archive Haunt", cardFace: "back", faceIndex: 1, componentType: "back", seedHint: { face: "back", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0272", catalogCardName: "Wolfkin Outcast // Wedding Crasher", seedHint: { primitives: [{ actionType: "draw", evidenceContains: "dies, draw a card" }] } },
  { caseId: "eval-0273", catalogCardName: "Lunarch Veteran // Luminous Phantom", cardFace: "back", faceIndex: 1, componentType: "back", seedHint: { face: "back", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] } },
  { caseId: "eval-0274", catalogCardName: "Covert Cutpurse // Covetous Geist", cardFace: "front", faceIndex: 0, componentType: "front", seedHint: { face: "front", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }] } },
  { caseId: "eval-0276", catalogCardName: "Invasion of Ulgrotha // Grandmother Ravi Sengir", cardFace: "front", faceIndex: 0, componentType: "front", seedHint: { face: "front", primitives: [{ actionType: "deal_damage", evidenceContains: "deals 3 damage" }] } },
  { caseId: "eval-0277", catalogCardName: "Invasion of Fiora // Marchesa, Resolute Monarch", seedHint: { face: "front", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact", cardFace: "front" }] } },
  { caseId: "eval-0278", catalogCardName: "Invasion of Segovia // Caetus, Sea Tyrant of Segovia", seedHint: { face: "back", primitives: [{ actionType: "create_token", evidenceContains: "create two 1/1", cardFace: "back" }] } },
  { caseId: "eval-0282", catalogCardName: "Oft-Nabbed Goat", cardFace: "back", seedHint: { face: "back", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }] } },
  { caseId: "eval-0285", catalogCardName: "Forensic Gadgeteer", seedHint: { forbidden: ["draw", "destroy"] } },
];

/** Cases with no catalog representative — permanently excluded from active benchmark. */
export const PERMANENTLY_EXCLUDED_DEV_CASES: PermanentlyExcludedDevCase[] = [
  { caseId: "eval-0164", category: "no_catalog_representative", reason: "Synthetic static text (artifact counter maximum) has no catalogOracleCards match." },
  { caseId: "eval-0169", category: "synthetic_fragment", reason: "Synthetic transform-cost fragment; no standalone catalog card." },
  { caseId: "eval-0189", category: "synthetic_fragment", reason: "Synthetic CDA fragment (*+1/+1 per enchantment) has no catalog match." },
  { caseId: "eval-0271", category: "no_catalog_representative", reason: "Synthetic Room text (Study/Sanctuary) does not match any catalog room card." },
  { caseId: "eval-0275", category: "no_catalog_representative", reason: "No catalog disturb card with exile-target-creature on back face." },
  { caseId: "eval-0279", category: "layout_not_in_catalog", reason: "Convert layout (Daybound/convert cost) not present in catalogOracleCards." },
  { caseId: "eval-0280", category: "layout_not_in_catalog", reason: "Convert layout not present in catalogOracleCards." },
  { caseId: "eval-0281", category: "layout_not_in_catalog", reason: "Convert layout not present in catalogOracleCards." },
  { caseId: "eval-0284", category: "no_catalog_representative", reason: "Synthetic transform text (draw-two-instead replacement) has no catalog match." },
];

export const ALL_V11_UNRESOLVED_CASE_IDS = [
  ...RESOLVED_DEV_CASE_CATALOG_MAP.map((r) => r.caseId),
  ...PERMANENTLY_EXCLUDED_DEV_CASES.map((e) => e.caseId),
];

export function getDevCaseResolution(caseId: string): DevCaseCatalogResolution | undefined {
  return RESOLVED_DEV_CASE_CATALOG_MAP.find((r) => r.caseId === caseId);
}

export function isPermanentlyExcludedDevCase(caseId: string): boolean {
  return PERMANENTLY_EXCLUDED_DEV_CASES.some((e) => e.caseId === caseId);
}
