/**
 * Keeps build-pipeline language out of what a player reads.
 *
 * The Architect, Constructor and Head Professor talk to each other in terms of
 * requirement allocations and packages, and an imported list carries a
 * placeholder win path until something better is known. Both are useful to
 * the pipeline and meaningless on screen.
 */

const PLACEHOLDER_WIN_PATH_V1 = /^preserve the imported\b/i;

const PIPELINE_SENTENCE_V1 =
  /\b(?:allocation|allocated|architect|constructor|requirement realization|slot counts?|package density)\b/i;

/** Win paths worth showing: no placeholders, no trailing stop to double up. */
export function customerWinPathsV1(lines: readonly string[] | undefined): string[] {
  return (lines ?? [])
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, ""))
    .filter((line) => line && !PLACEHOLDER_WIN_PATH_V1.test(line));
}

/** Drops sentences that describe how the deck was assembled rather than how it plays. */
export function customerFacingProseV1(text: string | null | undefined): string {
  if (!text?.trim()) return "";
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !PIPELINE_SENTENCE_V1.test(sentence));
  return (kept.length ? kept : sentences).join(" ");
}

/** The Head Professor's verdict class, in words a player would use. */
export function classificationLabelV1(classification: string | null | undefined): string {
  switch (classification) {
    case "CONSTRUCTION_SUCCESS":
      return "Ready to play";
    case "OPTIONAL_REFINEMENT":
      return "Solid — small tweaks only";
    case "CONSTRUCTION_DEFECT":
      return "Needs work";
    default:
      return "Not graded yet";
  }
}
