export const COS_V1_SCORE_VERSION = "COMMANDER_OPTIMIZATION_SCORE_V1" as const;

export const COS_V1_EXPECTED_SHA = {
  formula: "10c4e3ab09d393a98b7921343379c6cc436fed30d01189e805ba98dc1d79882f",
  schema: "76f24597ed59578b1d8b8e941cdd896b58deb3c633f668c99e8e63fbbe28490c",
  model: "5f51e063a848508a1663201cbc7b8d3539872bd37ff8115fc8ed82d86343c9a9",
  reference: "b728a42fe81de3ab0abb7488761c95f460a0d0c48cf4d29b144a7f12b4b7d8ab",
} as const;

export const COS_V1_SPELLBOOK_FINGERPRINT_SHA =
  "172f0e83b8f8db6dfb16ee0b8894a199ea27062ea752daad61de1e90a274cfd1";

export const COS_V1_FEATURE_EXTRACTION_VERSION =
  "cos-v1-extract-rc8-regex-catalog-points-spellbook-detector-v1";

export const COS_V1_MIN_COMMANDER_UNIQUE = 30;

export const COS_V1_DEP = ["NONE", "COMMANDER_INDEPENDENT", "MIXED", "COMMANDER_DEPENDENT"] as const;

export const COS_V1_TERM_BUCKETS = [
  "WIN_THE_GAME",
  "OPPONENT_LOSES_THE_GAME",
  "DRAW_THE_GAME",
  "INFINITE_DAMAGE",
  "INFINITE_LIFELOSS",
  "INFINITE_MILL",
  "EXILE_LIBRARIES",
  "LIFE_TOTAL_MANIPULATION",
] as const;

export const COS_V1_ENAB_BUCKETS = [
  "MANA",
  "DRAW",
  "TOKENS",
  "ETB",
  "LTB",
  "COUNTERS",
  "STORM",
  "UNTAP",
  "SELF_MILL",
  "CASTS",
  "LANDFALL",
  "MAGECRAFT",
  "SACRIFICE",
  "OTHER_ENABLING",
] as const;

export const COS_V1_ZONE_KEYS = ["B", "H", "G", "E", "L", "C"] as const;
