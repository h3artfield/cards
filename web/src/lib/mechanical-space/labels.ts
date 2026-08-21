import type { LabelState } from "./types";

export type FeatureLabelMatrix = {
  oracleIds: string[];
  featureIds: string[];
  /** 1 POSITIVE, -1 NEGATIVE, 0 UNKNOWN. Never treat 0 as negative. */
  states: Int8Array;
};

export function labelIndex(cardCount: number, featureCount: number, cardIdx: number, featureIdx: number): number {
  return cardIdx * featureCount + featureIdx;
}

export function createLabelMatrix(oracleIds: string[], featureIds: string[]): FeatureLabelMatrix {
  return {
    oracleIds,
    featureIds,
    states: new Int8Array(oracleIds.length * featureIds.length),
  };
}

export function setLabel(
  matrix: FeatureLabelMatrix,
  oracleId: string,
  featureId: string,
  state: LabelState,
): void {
  const ci = matrix.oracleIds.indexOf(oracleId);
  const fi = matrix.featureIds.indexOf(featureId);
  if (ci < 0 || fi < 0) return;
  const value = state === "POSITIVE" ? 1 : state === "NEGATIVE" ? -1 : 0;
  matrix.states[labelIndex(matrix.oracleIds.length, matrix.featureIds.length, ci, fi)] = value;
}

export function getLabel(matrix: FeatureLabelMatrix, cardIdx: number, featureIdx: number): LabelState {
  const v = matrix.states[labelIndex(matrix.oracleIds.length, matrix.featureIds.length, cardIdx, featureIdx)];
  if (v > 0) return "POSITIVE";
  if (v < 0) return "NEGATIVE";
  return "UNKNOWN";
}

export function encodeLabelState(state: LabelState): number {
  if (state === "POSITIVE") return 1;
  if (state === "NEGATIVE") return -1;
  return 0;
}

/** Masked target: POSITIVE→1, NEGATIVE→0, UNKNOWN→NaN (loss must ignore NaN). */
export function maskedRegressionTarget(state: LabelState): number {
  if (state === "POSITIVE") return 1;
  if (state === "NEGATIVE") return 0;
  return Number.NaN;
}

export function assertUnknownNotNegative(matrix: FeatureLabelMatrix): void {
  let unknown = 0;
  let positive = 0;
  let negative = 0;
  for (const v of matrix.states) {
    if (v > 0) positive += 1;
    else if (v < 0) negative += 1;
    else unknown += 1;
  }
  if (unknown === 0 && positive > 0 && negative === matrix.states.length - positive) {
    throw new Error("Label matrix looks fully labeled 0/1; UNKNOWN must remain a first-class state");
  }
}

export function countLabelStates(matrix: FeatureLabelMatrix): { positive: number; negative: number; unknown: number } {
  let positive = 0;
  let negative = 0;
  let unknown = 0;
  for (const v of matrix.states) {
    if (v > 0) positive += 1;
    else if (v < 0) negative += 1;
    else unknown += 1;
  }
  return { positive, negative, unknown };
}
