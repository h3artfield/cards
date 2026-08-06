export function isSecureCameraContext(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext;
}

export function insecureContextHint(): string {
  return "Live camera preview requires HTTPS. Opening the site at http://192.168.x.x blocks the camera on phones. Tap “Upload Front/Back Image” below — that still opens your phone camera — or run npm run dev:tunnel in a second terminal for a free HTTPS link.";
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );
}

export function buildVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const mobile = isMobileDevice();
  const base: MediaTrackConstraints = mobile
    ? {
        width: { ideal: 3840, min: 1920 },
        height: { ideal: 2160, min: 1080 },
      }
    : {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };

  if (deviceId) {
    return { ...base, deviceId: { exact: deviceId } };
  }

  if (mobile) {
    return {
      ...base,
      facingMode: { ideal: "environment" },
      focusMode: { ideal: "continuous" },
    } as MediaTrackConstraints;
  }

  return base;
}

export interface CameraErrorInfo {
  name: string;
  message: string;
  hint: string;
}

const ERROR_HINTS: Record<string, string> = {
  NotAllowedError:
    "Browser or OS blocked camera access. Check site permissions and system privacy settings.",
  NotFoundError: "No camera was found on this device.",
  NotReadableError:
    "Camera is in use by another app or could not be started. Close other apps using the camera.",
  OverconstrainedError:
    "The selected camera or settings are not supported. Try another camera from the list.",
  SecurityError:
    "Camera is blocked by browser policy. Use HTTPS for phone testing; localhost is OK on desktop.",
  AbortError:
    "Camera startup was interrupted (often from a quick remount). Tap “Try camera again.”",
  NotSupportedError:
    "Camera API is unavailable. On phones over http://192.168.x.x, use the upload buttons or an HTTPS URL (npm run dev:tunnel).",
  TypeError:
    "Camera API is unavailable. Use a supported browser and ensure you are not in a restricted iframe.",
  InsecureContext:
    "Live camera preview requires HTTPS. Use the upload buttons below or npm run dev:tunnel for an HTTPS link.",
};

export function parseCameraError(err: unknown): CameraErrorInfo {
  if (err instanceof DOMException || err instanceof Error) {
    return {
      name: err.name || "Error",
      message: err.message || "Unknown camera error",
      hint: ERROR_HINTS[err.name] ?? "An unexpected camera error occurred.",
    };
  }

  return {
    name: "UnknownError",
    message: String(err),
    hint: "An unexpected camera error occurred.",
  };
}

export function logCameraError(err: unknown, context: string): CameraErrorInfo {
  const info = parseCameraError(err);
  const payload: Record<string, unknown> = {
    name: info.name,
    message: info.message,
    hint: info.hint,
    context,
  };

  if (err instanceof DOMException && "constraint" in err) {
    payload.constraint = (err as DOMException & { constraint?: string }).constraint;
  }

  console.error("[camera]", payload);
  return info;
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export async function attachStreamToVideo(
  video: HTMLVideoElement,
  media: MediaStream,
): Promise<void> {
  video.muted = true;
  video.playsInline = true;
  video.srcObject = media;

  const attemptPlay = () => video.play();

  try {
    await attemptPlay();
  } catch (playErr) {
    const isAbort =
      playErr instanceof DOMException && playErr.name === "AbortError";

    if (isAbort && video.srcObject === media && video.isConnected) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (video.srcObject !== media || !video.isConnected) {
        throw playErr;
      }
      try {
        await attemptPlay();
        return;
      } catch (retryErr) {
        logCameraError(retryErr, "video.play(retry)");
        throw retryErr;
      }
    }

    logCameraError(playErr, "video.play()");
    throw playErr;
  }
}

export function isPlayInterrupted(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
