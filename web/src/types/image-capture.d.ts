interface PointOfInterest {
  x: number;
  y: number;
}

interface MediaTrackConstraintSetAdvanced {
  focusMode?: string;
  focusDistance?: number;
  pointsOfInterest?: PointOfInterest[];
  zoom?: number;
}

interface MediaTrackConstraintSet {
  focusMode?: ConstrainDOMString;
  focusDistance?: ConstrainDouble;
  pointsOfInterest?: ConstrainPointOfInterest;
  advanced?: MediaTrackConstraintSetAdvanced[];
}

type ConstrainPointOfInterest = PointOfInterest | PointOfInterest[];

interface PhotoSettings {
  imageWidth?: number;
  imageHeight?: number;
  fillLightMode?: "auto" | "off";
}

declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  takePhoto(photoSettings?: PhotoSettings): Promise<Blob>;
}
