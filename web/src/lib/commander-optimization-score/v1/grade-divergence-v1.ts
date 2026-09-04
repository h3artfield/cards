/**
 * The Head Professor letter grade and Build Optimization are produced by
 * separate systems from separate inputs, and the report shows them side by
 * side with nothing explaining how both can be true at once. A Fynn build was
 * presented as "A-" directly above "Build Optimization 1st percentile", which
 * reads as the report contradicting itself.
 *
 * They answer different questions. The letter is a judgement about whether
 * this is the right deck for this commander at the requested bracket. Build
 * Optimization is the percentile of this 99's measured construction against
 * observed reference builds. A deck can be the right build for its bracket and
 * still rank low against a reference containing far more optimized lists.
 *
 * This note is shown only when the two diverge far enough that a reader would
 * otherwise have to guess which one to believe.
 */

/** Grades at or above this are "the Professor endorses this build". */
const STRONG_GRADE = /^[AB]/i;
/** Grades at or below this are "the Professor does not endorse this build". */
const WEAK_GRADE = /^[DF]/i;

const LOW_PERCENTILE = 25;
const HIGH_PERCENTILE = 75;

export function cosGradeDivergenceNoteV1(args: {
  displayLetter: string | null | undefined;
  buildOptimization: number | null | undefined;
}): string | null {
  const letter = args.displayLetter?.trim();
  const bo = args.buildOptimization;
  if (!letter || bo == null || !Number.isFinite(bo)) return null;

  if (STRONG_GRADE.test(letter) && bo < LOW_PERCENTILE) {
    return `The ${letter} and this percentile are not in conflict: they answer different questions. The grade is the Professor's judgement of whether this is the right deck for this commander at the requested bracket. Build Optimization ranks this 99's measured construction against observed reference builds, many of which are tuned well past this bracket. A deck built correctly for its bracket can grade well and still rank low here.`;
  }

  if (WEAK_GRADE.test(letter) && bo > HIGH_PERCENTILE) {
    return `The ${letter} and this percentile are not in conflict: they answer different questions. Build Optimization says this 99's construction resembles strong reference builds. The grade says it is not the deck the Professor would recommend for this commander at the requested bracket — usually a plan or bracket-fit problem rather than a card-quality one.`;
  }

  return null;
}
