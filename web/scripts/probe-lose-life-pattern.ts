const evidence = "Target opponent loses half their life";
const pattern =
  /\b(?:Target opponent |Each opponent |Each player |You |Target player |That player )?loses? (?:half (?:their |your )?life|\d+|up to \d+|X) life\b|\bloses? life equal to\b/i;
console.log("match", pattern.test(evidence));

import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";
const oracle =
  "Spree (Choose one or more additional costs.)\n+ {1} — Target opponent sacrifices half the creatures they control of their choice, rounded up.\n+ {2} — Target opponent discards half the cards in their hand, rounded up.\n+ {2} — Target opponent loses half their life, rounded up.";
console.log("infer", inferSupportedPrimitiveFromEvidence(oracle, evidence));
