import type { FunctionalRoleScore, TagDerivedProfileV0 } from "./types";

/** Current tag-derived profile schema — not the finished functional system. */
export const TAG_DERIVED_PROFILE_VERSION = "tag-derived-v0" as const;

/** Scryfall oracle tag slugs → functional role dimensions. */
export const ORACLE_TAG_ROLE_MAP: Record<string, string[]> = {
  ramp: ["ramp"],
  "mana-acceleration": ["ramp"],
  "mana-doubler": ["ramp"],
  draw: ["card_advantage"],
  "card-draw": ["card_advantage"],
  cantrip: ["card_advantage"],
  removal: ["spot_removal"],
  "destroy-creature": ["spot_removal"],
  "destroy-artifact": ["spot_removal"],
  "destroy-enchantment": ["spot_removal"],
  "mass-removal": ["board_wipe"],
  "board-wipe": ["board_wipe"],
  counterspell: ["countermagic"],
  counter: ["countermagic"],
  protection: ["protection"],
  hexproof: ["protection"],
  recursion: ["recursion"],
  reanimation: ["recursion"],
  "mass-reanimation": ["recursion"],
  tutor: ["tutor"],
  token: ["token_enabler"],
  "token-generation": ["token_enabler"],
  sacrifice: ["sacrifice_outlet"],
  mill: ["graveyard_enabler"],
  discard: ["graveyard_enabler"],
  lifegain: ["finisher"],
  "extra-combat": ["finisher"],
};

const KEYWORD_ROLE_MAP: Record<string, string[]> = {
  Flash: ["countermagic"],
  Flying: ["finisher"],
  Trample: ["finisher"],
  Lifelink: ["finisher"],
};

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Lightweight deterministic profile from oracle tags and keywords (v0 only). */
export function deriveTagDerivedProfileV0(input: {
  oracleTags?: string[];
  keywords?: string[];
}): TagDerivedProfileV0 {
  const roles = new Map<string, FunctionalRoleScore>();

  function addRole(role: string, evidence: string, method: FunctionalRoleScore["derivationMethod"]) {
    const existing = roles.get(role);
    if (existing) {
      existing.score = Math.min(1, existing.score + 0.15);
      existing.evidence.push(evidence);
      return;
    }
    roles.set(role, {
      score: 0.85,
      confidence: 0.9,
      derivationMethod: method,
      evidence: [evidence],
    });
  }

  for (const rawTag of input.oracleTags ?? []) {
    const tag = normalizeTag(rawTag);
    for (const role of ORACLE_TAG_ROLE_MAP[tag] ?? []) {
      addRole(role, `oracle_tag:${tag}`, "oracle_tags");
    }
  }

  for (const keyword of input.keywords ?? []) {
    for (const role of KEYWORD_ROLE_MAP[keyword] ?? []) {
      addRole(role, `keyword:${keyword}`, "keywords");
    }
  }

  return {
    profileVersion: TAG_DERIVED_PROFILE_VERSION,
    roles: Object.fromEntries(roles),
  };
}

/** @deprecated Use deriveTagDerivedProfileV0 */
export function deriveFunctionalProfile(input: {
  oracleTags?: string[];
  keywords?: string[];
}): Record<string, FunctionalRoleScore> {
  return deriveTagDerivedProfileV0(input).roles;
}
