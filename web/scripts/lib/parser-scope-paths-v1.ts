/** Parser blob closure scope — shared by freeze manifests and provenance remediation. */
export const PARSER_BLOB_SCOPE_PATHS = [
  "src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  "src/lib/deck-builder/golden-catalog/oracle-span-role-classifier.ts",
  "src/lib/deck-builder/golden-catalog/oracle-compound-clause-segmentation.ts",
  "src/lib/deck-builder/golden-catalog/oracle-modal-option-parse.ts",
  "src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-ability-segmentation.ts",
  "scripts/oracle-action-semantic-matcher.ts",
  "scripts/oracle-action-unified-matcher.ts",
  "scripts/lib/gold-policy-validator-v1.ts",
  "scripts/lib/rc5-regression-scoring-v1.ts",
  "scripts/lib/reminder-derived-leakage-v1.ts",
] as const;

export const RC6_EXECUTED_PARSER_BLOB_CLOSURE =
  "832b601cfe332b25b38df359935cef96148dfd69bf729a08dfac47bbebb3d113";

export const RC6_EXECUTED_GOLD_POLICY_VALIDATOR_HASH =
  "d83e85406341d5df39ddfe77a9c1c4ab6339b3a36f4f213d07160d31ca0ec008";
