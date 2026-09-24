/**
 * Persist large Sol-directed build artifacts (Firebase Storage or local fallback).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAdminStorage } from "../firebase/admin";
import { resolveMtgRagBucket } from "../mtg-rag/storage";

export const PROFESSOR_SOL_DIRECTED_BUILD_ARTIFACTS_V1_1_1_VERSION =
  "professor-sol-directed-build-artifacts-v1-1-1";

const ARTIFACT_NAMES = [
  "architect-prompt.json",
  "architect-response.json",
  "retrieval-contract.json",
  "candidate-dictionary.json",
  "requirement-pools.json",
  "land-pool.json",
  "constructor-prompt.json",
  "constructor-response.json",
  "canonicalized-deck.json",
  "identity-resolution-ledger.json",
  "validation.json",
  "critic-response.json",
  "head-professor-prompt.json",
  "head-professor-response.json",
  "proof-chain.json",
] as const;

export type SolDirectedBuildArtifactName = (typeof ARTIFACT_NAMES)[number];

export function solDirectedBuildArtifactPrefix(buildId: string): string {
  return `deck-build-runs/${buildId}`;
}

async function uploadJsonObject(objectPath: string, payload: unknown): Promise<void> {
  const bucketName = resolveMtgRagBucket();
  const storage = getAdminStorage();
  if (!bucketName || !storage) {
    const localDir = join(process.cwd(), ".sol-directed-builds", objectPath.replace(/\//g, "_"));
    mkdirSync(localDir, { recursive: true });
    const filename = objectPath.split("/").pop() ?? "artifact.json";
    writeFileSync(join(localDir, filename), JSON.stringify(payload, null, 2));
    return;
  }
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(JSON.stringify(payload, null, 2), {
    contentType: "application/json",
    metadata: { cacheControl: "private, max-age=0" },
  });
}

export async function persistSolDirectedBuildArtifactsV111(args: {
  buildId: string;
  artifacts: Partial<Record<SolDirectedBuildArtifactName, unknown>>;
}): Promise<{ storagePrefix: string; persisted: string[] }> {
  const prefix = solDirectedBuildArtifactPrefix(args.buildId);
  const persisted: string[] = [];
  for (const [name, payload] of Object.entries(args.artifacts)) {
    if (payload == null) continue;
    const objectPath = `${prefix}/${name}`;
    await uploadJsonObject(objectPath, payload);
    persisted.push(name);
  }
  return { storagePrefix: prefix, persisted };
}

/** Mirror of the local fallback layout used by uploadJsonObject. */
function localArtifactPath(objectPath: string): string {
  const filename = objectPath.split("/").pop() ?? "artifact.json";
  return join(process.cwd(), ".sol-directed-builds", objectPath.replace(/\//g, "_"), filename);
}

/**
 * Reads one persisted artifact back, or null when it is absent.
 *
 * Build results are otherwise held only in process memory, so on any instance
 * that did not run the build — every instance after a deploy or a scale-down —
 * these files are the only surviving copy of the deck.
 */
export async function readSolDirectedBuildArtifactV111(args: {
  buildId: string;
  name: SolDirectedBuildArtifactName;
}): Promise<unknown | null> {
  const objectPath = `${solDirectedBuildArtifactPrefix(args.buildId)}/${args.name}`;
  const bucketName = resolveMtgRagBucket();
  const storage = getAdminStorage();

  if (!bucketName || !storage) {
    try {
      return JSON.parse(readFileSync(localArtifactPath(objectPath), "utf8"));
    } catch {
      return null;
    }
  }

  try {
    const file = storage.bucket(bucketName).file(objectPath);
    const [contents] = await file.download();
    return JSON.parse(contents.toString("utf8"));
  } catch {
    return null;
  }
}

export { ARTIFACT_NAMES };
