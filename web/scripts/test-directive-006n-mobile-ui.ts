/**
 * Directive 006N — mobile-first staff UI label tests.
 * Run: npm run test:directive-006n-mobile-ui
 */
import {
  friendlyReviewStatus,
  friendlyQueueReason,
  friendlyBlocker,
  friendlyPreviewAction,
  formatPriceDiffPercent,
} from "../src/lib/card-flow-v2/v2-staff-labels";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("Directive 006N — staff-friendly labels\n");

assert(
  friendlyReviewStatus("v2_production_price_warning") === "Production price warning",
  "production price warning label",
);
assert(
  friendlyReviewStatus("v2_source_disagreement") === "Source disagreement",
  "source disagreement label",
);
assert(
  friendlyReviewStatus("v2_staff_confirmed_ready") === "Staff-confirmed ready",
  "staff confirmed ready label",
);
assert(
  friendlyQueueReason("v1_possible_wrong_pricecharting_mapping") ===
    "Production price may be wrong",
  "queue production warning reason",
);
assert(
  friendlyBlocker("source_disagreement") === "Source prices disagree",
  "blocker friendly label",
);
assert(
  friendlyPreviewAction("staff_confirmed_preview_ready") === "Ready — low confidence",
  "preview action label",
);
assert(formatPriceDiffPercent(49.99, 7.91) === "-84%", "Ravenous diff percent");

console.log(`\n006N mobile UI: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
