/**
 * Catalog resolutions for dev-cond / dev-opt synthetic fragment cases.
 * Each maps to a real card whose oracle text contains the tested condition/pattern.
 */
import type { GoldSeedHint } from "./gold-relabel-engine";

export interface DevCondOptResolution {
  caseId: string;
  catalogCardName: string;
  seedHint?: GoldSeedHint;
  /** Remove stale conditions/primitives not derivable from catalog. */
  clearStaleConditions?: boolean;
}

export const DEV_COND_OPT_CATALOG_RESOLUTIONS: DevCondOptResolution[] = [
  {
    caseId: "dev-cond-001",
    catalogCardName: "Bleachbone Verge",
    clearStaleConditions: true,
    seedHint: { primitives: [{ actionType: "gain_life", evidenceContains: "gain 3 life" }] },
  },
  {
    caseId: "dev-cond-002",
    catalogCardName: "Stab",
    clearStaleConditions: true,
    seedHint: { primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }] },
  },
  {
    caseId: "dev-cond-003",
    catalogCardName: "Onakke Oathkeeper",
    clearStaleConditions: true,
  },
  {
    caseId: "dev-cond-004",
    catalogCardName: "Emperor Mihail II",
    clearStaleConditions: true,
  },
  {
    caseId: "dev-cond-005",
    catalogCardName: "Tribal Golem",
    clearStaleConditions: true,
  },
  {
    caseId: "dev-cond-006",
    catalogCardName: "Unscrupulous Contractor",
    clearStaleConditions: true,
    seedHint: { primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] },
  },
  {
    caseId: "dev-cond-007",
    catalogCardName: "Keldon Raider",
    clearStaleConditions: true,
  },
  {
    caseId: "dev-cond-008",
    catalogCardName: "Vizier of Deferment",
    clearStaleConditions: true,
    seedHint: { primitives: [{ actionType: "exile", evidenceContains: "exile target creature" }] },
  },
  {
    caseId: "dev-cond-009",
    catalogCardName: "Labyrinth Adversary",
    clearStaleConditions: true,
  },
  {
    caseId: "dev-cond-010",
    catalogCardName: "Nine Lives",
    clearStaleConditions: true,
  },
  {
    caseId: "dev-cond-011",
    catalogCardName: "Snuff Out",
    clearStaleConditions: true,
    seedHint: { primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }] },
  },
  {
    caseId: "dev-cond-012",
    catalogCardName: "Mystic Remora",
    clearStaleConditions: true,
    seedHint: { primitives: [{ actionType: "draw", evidenceContains: "draw a card" }] },
  },
  {
    caseId: "dev-opt-034",
    catalogCardName: "Gifts Ungiven",
    seedHint: { primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  },
  {
    caseId: "dev-opt-037",
    catalogCardName: "Anticipate",
    seedHint: { primitives: [{ actionType: "scry", evidenceContains: "Scry" }] },
  },
];

export function getDevCondOptResolution(caseId: string): DevCondOptResolution | undefined {
  return DEV_COND_OPT_CATALOG_RESOLUTIONS.find((r) => r.caseId === caseId);
}
