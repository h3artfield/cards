import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { assertMechanicalSpaceReadOnly } from "@/lib/mechanical-space/safety";
import { readJsonIfExists } from "@/lib/mechanical-space/artifact-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertMechanicalSpaceReadOnly("api-overview");
    return jsonOk({
      version: "phase-rps-mechanical-v1",
      route: "http://localhost:3000/experimental/mechanical-space",
      safety: {
        productionFirestoreWrites: "NONE",
        allowProductionInteractionWrites: false,
      },
      discovery: readJsonIfExists("architecture-discovery.json"),
      snapshot: readJsonIfExists("semantic-oracle-snapshot-v1", "manifest.json"),
      snapshotValidation: readJsonIfExists("semantic-oracle-snapshot-v1", "validation.json"),
      spellbook: readJsonIfExists("spellbook-reference-normalization-v1", "manifest.json"),
      identity: readJsonIfExists("oracle-identity-mapping-v1", "summary.json"),
      parity: readJsonIfExists("mechanical-graph-parity-v1", "report.json"),
      supervision: readJsonIfExists("mechanical-supervision-v1", "manifest.json"),
      ml: readJsonIfExists("mechanical-feature-ml-v1", "report.json"),
      reconstruction: readJsonIfExists("mechanical-holdout-reconstruction-v1", "report.json"),
      candidates: readJsonIfExists("mechanical-novel-candidates-v1", "report.json"),
      neuralOracle: readJsonIfExists("oracle-neural-semantic-space-v1", "manifest.json"),
      representationComparison: readJsonIfExists("representation-comparison-v1", "report.json"),
      graphEmbedding: readJsonIfExists("mechanical-graph-embedding-v1", "manifest.json"),
      alignment: readJsonIfExists("mechanical-alignment-v1", "regularized-report.json"),
      phaseNext: readJsonIfExists("phase-next-report-v1.json"),
      directions: readJsonIfExists("mechanical-directions-v1", "report.json"),
      directionsV2: readJsonIfExists("mechanical-directions-v2", "report.json"),
      ontologyPrecision: readJsonIfExists("mechanical-ontology-precision-v2-report.json"),
      directionsV21: readJsonIfExists("mechanical-directions-v21", "report.json"),
      ontologyV21: readJsonIfExists("mechanical-ontology-v21-report.json"),
      pressureK: readJsonIfExists("mechanical-pressure-k-v1-report.json"),
      pressureKLock: readJsonIfExists("mechanical-pressure-k-v1", "IMMUTABLE.json"),
      deckProfiles: readJsonIfExists("deck-mechanical-profiles-v1-report.json"),
      deckProfilesLock: readJsonIfExists("deck-mechanical-profiles-v1", "IMMUTABLE.json"),
      deckPressure: readJsonIfExists("deck-pressure-v1-report.json"),
      pressureKV11: readJsonIfExists("mechanical-pressure-k-v11-report.json"),
      pressureKV12: readJsonIfExists("mechanical-pressure-k-v12-report.json"),
      pressureKV13: readJsonIfExists("mechanical-pressure-k-v13-report.json"),
      pressureKV14: readJsonIfExists("mechanical-pressure-k-v14-report.json"),
      pressureKV15: readJsonIfExists("mechanical-pressure-k-v15-report.json"),
      ontologyV22: readJsonIfExists("mechanical-ontology-v22-report.json"),
      deckProfilesV2: readJsonIfExists("deck-mechanical-profiles-v2-report.json"),
      pressureKV2: readJsonIfExists("mechanical-pressure-k-v2-report.json"),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
