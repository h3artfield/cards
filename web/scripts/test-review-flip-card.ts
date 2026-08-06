/**
 * Directive — 3D flip card review UI state machine.
 * Run: npm run test:review-flip-card
 */
import type { CardBackMode, ReviewFlipFace } from "../src/components/review-flip-card/types";

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

type State = { face: ReviewFlipFace; backMode: CardBackMode | null };

function flipToReason(s: State): State {
  return { face: "back", backMode: "reason" };
}

function flipToReview(s: State): State {
  return { face: "back", backMode: "review" };
}

function flipToFront(): State {
  return { face: "front", backMode: null };
}

function run() {
  console.log("Review flip card — state machine\n");

  let s: State = { face: "front", backMode: null };
  assert(s.face === "front" && s.backMode === null, "starts on front");

  s = flipToReason(s);
  assert(s.face === "back" && s.backMode === "reason", "Reason flips to reason back");

  s = flipToFront();
  assert(s.face === "front" && s.backMode === null, "Back to summary clears mode");

  s = flipToReview(s);
  assert(s.backMode === "review", "Review card sets review mode");

  s = flipToReason({ face: "back", backMode: "review" });
  assert(s.backMode === "reason", "Reason overrides review mode on back");

  s = flipToFront();
  s = flipToReview(s);
  s = flipToReview(s);
  assert(s.backMode === "review", "Review mode is idempotent");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
