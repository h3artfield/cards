import { mkdirSync, writeFileSync } from "node:fs";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { assertMechanicalSpaceReadOnly, assertNoProductionInteractionWrites } from "@/lib/mechanical-space/safety";
import { mechanicalSpacePath } from "@/lib/mechanical-space/artifact-paths";
import type { CandidateReview } from "@/lib/mechanical-space/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMechanicalSpaceReadOnly("api-review");
    const body = (await request.json()) as Partial<CandidateReview>;
    if (!body.candidateId || !body.decision || !body.reason) {
      return jsonError("candidateId, decision, and reason required", 400);
    }
    const review: CandidateReview = {
      candidateId: body.candidateId,
      decision: body.decision,
      reason: body.reason,
      reviewedAt: new Date().toISOString(),
    };
    try {
      assertNoProductionInteractionWrites("local-review-persist");
    } catch {
      // Expected: production writes are blocked. Persist locally only.
    }
    const dir = mechanicalSpacePath("local-reviews");
    mkdirSync(dir, { recursive: true });
    const path = mechanicalSpacePath("local-reviews", `${review.candidateId.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`);
    writeFileSync(path, `${JSON.stringify({ ...review, productionWrites: false }, null, 2)}\n`);
    return jsonOk({ saved: "local", path, review });
  } catch (err) {
    return handleRouteError(err);
  }
}
