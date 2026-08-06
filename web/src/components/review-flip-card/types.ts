export type CardBackMode = "reason" | "review";

export type ReviewFlipFace = "front" | "back";

export type ReviewFlipControls = {
  face: ReviewFlipFace;
  backMode: CardBackMode | null;
  flipToReason: () => void;
  flipToReview: () => void;
  flipToFront: () => void;
  reducedMotion: boolean;
  use2D: boolean;
};
