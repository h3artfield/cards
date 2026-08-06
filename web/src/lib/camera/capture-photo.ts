/** Request the highest resolution the device camera supports. */
export async function maximizeVideoTrackResolution(
  track: MediaStreamTrack,
): Promise<void> {
  const caps = track.getCapabilities?.();
  if (!caps?.width?.max) return;

  const width = caps.width.max;
  const height = caps.height?.max ?? Math.round(width * 0.75);

  try {
    await track.applyConstraints({
      width: { ideal: width },
      height: { ideal: height },
    });
  } catch {
    try {
      await track.applyConstraints({
        width: { ideal: Math.min(width, 3840) },
        height: { ideal: Math.min(height, 2160) },
      });
    } catch {
      // Keep whatever the browser negotiated.
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function canvasCapture(
  video: HTMLVideoElement,
  quality: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Prefer native full-resolution still capture when the browser supports it. */
export async function captureHighResPhoto(
  video: HTMLVideoElement,
  stream: MediaStream | null,
  quality = 0.95,
): Promise<string> {
  const track = stream?.getVideoTracks()[0];
  if (track && typeof ImageCapture !== "undefined") {
    try {
      const { refocusForCapture } = await import("./focus");
      await refocusForCapture(track);

      const caps = track.getCapabilities?.();
      const imageCapture = new ImageCapture(track);
      const photoSettings: PhotoSettings = {};
      if (caps?.width?.max) {
        photoSettings.imageWidth = caps.width.max;
      }
      if (caps?.height?.max) {
        photoSettings.imageHeight = caps.height.max;
      }
      const blob = await imageCapture.takePhoto(photoSettings);
      return blobToDataUrl(blob);
    } catch {
      // Fall back to canvas capture from the live video frame.
    }
  }

  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("Camera not ready for capture");
  }

  return canvasCapture(video, quality);
}

export function formatCaptureSize(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(`${img.naturalWidth}×${img.naturalHeight}`);
    };
    img.onerror = () => resolve("unknown");
    img.src = dataUrl;
  });
}
