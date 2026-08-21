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
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
