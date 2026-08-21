import { resolve } from "node:path";

export const MECHANICAL_SPACE_DIR = resolve(process.cwd(), "data/milestones/mechanical-space");

export const MECHANICAL_SPACE_ARTIFACTS = {
  discovery: "architecture-discovery.json",
  snapshotDir: "semantic-oracle-snapshot-v1",
  snapshotManifest: "semantic-oracle-snapshot-v1/manifest.json",
  snapshotVectors: "semantic-oracle-snapshot-v1/vectors.f32",
  snapshotIndex: "semantic-oracle-snapshot-v1/index.jsonl",
  snapshotValidation: "semantic-oracle-snapshot-v1/validation.json",
  spellbookDir: "spellbook-reference-normalization-v1",
  identityDir: "oracle-identity-mapping-v1",
  parityDir: "mechanical-graph-parity-v1",
  supervisionDir: "mechanical-supervision-v1",
  mlDir: "mechanical-feature-ml-v1",
  reconstructionDir: "mechanical-holdout-reconstruction-v1",
  candidatesDir: "mechanical-novel-candidates-v1",
  reviewsDir: "local-reviews",
} as const;

export function mechanicalSpacePath(...parts: string[]): string {
  return resolve(MECHANICAL_SPACE_DIR, ...parts);
}
