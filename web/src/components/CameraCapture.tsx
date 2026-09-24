"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "./Button";
import {
  attachStreamToVideo,
  buildVideoConstraints,
  insecureContextHint,
  isMobileDevice,
  isPlayInterrupted,
  isSecureCameraContext,
  listVideoInputs,
  logCameraError,
  parseCameraError,
  type CameraErrorInfo,
} from "@/lib/camera/utils";
import {
  captureHighResPhoto,
  maximizeVideoTrackResolution,
} from "@/lib/camera/capture-photo";
import { compressDataUrlForStorage } from "@/lib/camera/compress-image";
import {
  applyCardTextFocus,
  focusAtTap,
} from "@/lib/camera/focus";
import {
  analyzeFrameRegion,
  CAPTURE_INSTRUCTION,
  captureModeLabel,
  frameMotion,
  LOW_QUALITY_WARNING,
  overlayBorderClass,
  overlayHintClass,
  OVERLAY_ASPECT,
  OVERLAY_HEIGHT_PCT,
  overlayRectInFrame,
  STABILITY,
  type CaptureMode,
  type FrameAnalysisResult,
  type QualityColor,
} from "@/lib/camera/frame-analysis";

function PhotoProcessingScreen({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-4 py-10">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
        aria-hidden
      />
      <p className="text-center text-sm font-medium text-gray-800">{label}</p>
      <p className="text-center text-xs text-gray-500">
        Please wait — do not tap again.
      </p>
    </div>
  );
}

interface CameraCaptureProps {
  label: string;
  side: "front" | "back";
  captureMode: CaptureMode;
  onCapture: (dataUrl: string) => void;
  onRetake?: () => void;
  previewUrl?: string | null;
}

export function CameraCapture({
  label,
  side,
  captureMode,
  onCapture,
  onRetake,
  previewUrl,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startGenerationRef = useRef(0);
  const selectedDeviceIdRef = useRef("");
  const prevGrayRef = useRef<Float32Array | null>(null);
  const greenSinceRef = useRef<number | null>(null);
  const streamStartRef = useRef<number>(0);
  const autoCapturedRef = useRef(false);
  const analysisRef = useRef<FrameAnalysisResult | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoFocusRef = useRef(0);
  const captureInProgressRef = useRef(false);

  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [captured, setCaptured] = useState<string | null>(previewUrl ?? null);
  const [processing, setProcessing] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [streamReady, setStreamReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [overlayColor, setOverlayColor] = useState<QualityColor>("red");
  const [feedback, setFeedback] = useState<string[]>(["Align card in outline"]);
  const [readyStable, setReadyStable] = useState(false);
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);
  const [focusing, setFocusing] = useState(false);

  const mode: CaptureMode = captureMode === "graded" ? "graded" : "raw";
  const aspect = OVERLAY_ASPECT[mode];
  const heightPct = OVERLAY_HEIGHT_PCT[mode];
  const mobile = isMobileDevice();
  const stableMs = mobile ? STABILITY.stableMsMobile : STABILITY.stableMs;
  const motionThreshold = mobile
    ? STABILITY.motionThresholdMobile
    : STABILITY.motionThreshold;

  const handleFocusTap = useCallback(
    async (clientX: number, clientY: number) => {
      const track = streamRef.current?.getVideoTracks()[0];
      const container = videoContainerRef.current;
      if (!track || !container || !streamReady) return;
      setFocusing(true);
      try {
        await focusAtTap(track, clientX, clientY, container);
      } finally {
        setFocusing(false);
      }
    },
    [streamReady],
  );

  const handleFocusText = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !streamReady) return;
    setFocusing(true);
    try {
      await applyCardTextFocus(track);
    } finally {
      setFocusing(false);
    }
  }, [streamReady]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setStreamReady(false);
    greenSinceRef.current = null;
    prevGrayRef.current = null;
    autoCapturedRef.current = false;
    setReadyStable(false);
  }, []);

  const refreshCameras = useCallback(async () => {
    try {
      const inputs = await listVideoInputs();
      setCameras(inputs);
      if (!selectedDeviceIdRef.current && inputs[0]?.deviceId) {
        selectedDeviceIdRef.current = inputs[0].deviceId;
        setSelectedDeviceId(inputs[0].deviceId);
      }
    } catch (err) {
      logCameraError(err, "enumerateDevices");
    }
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!isSecureCameraContext()) {
        const info: CameraErrorInfo = {
          name: "InsecureContext",
          message: "Camera API requires a secure context (HTTPS)",
          hint: insecureContextHint(),
        };
        setCameraError(info);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        const info: CameraErrorInfo = {
          name: "NotSupportedError",
          message: "navigator.mediaDevices.getUserMedia is not available",
          hint: isSecureCameraContext()
            ? "Use a modern browser with camera support."
            : insecureContextHint(),
        };
        setCameraError(info);
        console.error("[camera]", info);
        return;
      }

      const generation = ++startGenerationRef.current;
      setStarting(true);
      setCameraError(null);
      setCaptureWarning(null);
      stopStream();

      const isStale = () => generation !== startGenerationRef.current;

      try {
        const constraints: MediaStreamConstraints = {
          video: buildVideoConstraints(
            deviceId || selectedDeviceIdRef.current || undefined,
          ),
          audio: false,
        };

        const media = await navigator.mediaDevices.getUserMedia(constraints);
        if (isStale()) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = media;

        const track = media.getVideoTracks()[0];
        if (track) {
          await maximizeVideoTrackResolution(track);
          await applyCardTextFocus(track);
        }

        const video = videoRef.current;
        if (!video || !video.isConnected) {
          media.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          throw new DOMException("Video element not mounted", "InvalidStateError");
        }

        await attachStreamToVideo(video, media);
        if (isStale()) return;

        setStreamReady(true);
        streamStartRef.current = Date.now();
        await refreshCameras();
      } catch (err) {
        if (isStale()) return;

        if (isPlayInterrupted(err)) {
          console.warn("[camera] play interrupted, retrying once", {
            context: "startCamera",
          });
          const video = videoRef.current;
          const media = streamRef.current;
          if (video && media && video.isConnected) {
            try {
              await attachStreamToVideo(video, media);
              if (!isStale()) {
                setStreamReady(true);
                streamStartRef.current = Date.now();
                const retryTrack = media.getVideoTracks()[0];
                if (retryTrack) await applyCardTextFocus(retryTrack);
                await refreshCameras();
                return;
              }
            } catch (retryErr) {
              if (isStale()) return;
              err = retryErr;
            }
          }
        }

        const info = logCameraError(err, "startCamera");
        setCameraError(info);
        setStreamReady(false);
      } finally {
        if (!isStale()) {
          setStarting(false);
        }
      }
    },
    [refreshCameras, stopStream],
  );

  const performCapture = useCallback(
    async (options: { force?: boolean; auto?: boolean } = {}) => {
      const video = videoRef.current;
      if (!video || !streamReady || captureInProgressRef.current) return;

      const analysis = analysisRef.current;
      const isGreenReady =
        analysis != null &&
        greenSinceRef.current != null &&
        Date.now() - greenSinceRef.current >= stableMs &&
        (analysis.color === "green" ||
          (mobile &&
            analysis.alignmentPass &&
            analysis.color === "yellow"));

      if (options.auto) {
        if (!isGreenReady) return;
        setCaptureWarning(null);
      } else if (!options.force && !isGreenReady) {
        setCaptureWarning(LOW_QUALITY_WARNING);
        return;
      } else if (options.force && !isGreenReady) {
        setCaptureWarning(LOW_QUALITY_WARNING);
      } else {
        setCaptureWarning(null);
      }

      captureInProgressRef.current = true;
      setProcessing(true);

      try {
        const raw = await captureHighResPhoto(
          video,
          streamRef.current,
          0.95,
        );
        const dataUrl = await compressDataUrlForStorage(raw);
        setCaptured(dataUrl);
        stopStream();
        onCapture(dataUrl);
      } catch (err) {
        logCameraError(err, "performCapture");
        setCameraError(parseCameraError(err));
      } finally {
        captureInProgressRef.current = false;
        setProcessing(false);
      }
    },
    [mobile, onCapture, stopStream, streamReady, stableMs],
  );

  useEffect(() => {
    if (previewUrl || captured) return;
    if (mobile) return;
    if (!isSecureCameraContext()) {
      setCameraError({
        name: "InsecureContext",
        message: "Camera API requires a secure context (HTTPS)",
        hint: insecureContextHint(),
      });
      return;
    }

    const timer = window.setTimeout(() => {
      void startCamera();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      startGenerationRef.current += 1;
      stopStream();
    };
    // Mount-only startup on desktop. Phones use the native camera app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!streamReady || captured || mobile) return;

    const analysisCanvas = analysisCanvasRef.current;
    const video = videoRef.current;
    if (!analysisCanvas || !video) return;

    const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const intervalMs = 1000 / STABILITY.analysisFps;
    let cancelled = false;

    const tick = () => {
      if (cancelled || !video.videoWidth || !video.videoHeight) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const overlay = overlayRectInFrame(vw, vh, mode);

      const scale = 240 / overlay.width;
      const aw = Math.round(overlay.width * scale);
      const ah = Math.round(overlay.height * scale);
      analysisCanvas.width = aw;
      analysisCanvas.height = ah;

      ctx.drawImage(
        video,
        overlay.x,
        overlay.y,
        overlay.width,
        overlay.height,
        0,
        0,
        aw,
        ah,
      );

      const imageData = ctx.getImageData(0, 0, aw, ah);
      let result = analyzeFrameRegion(imageData, mode, { mobile });

      const gray = new Float32Array(aw * ah);
      for (let i = 0; i < aw * ah; i++) {
        const o = i * 4;
        gray[i] =
          0.299 * imageData.data[o]! +
          0.587 * imageData.data[o + 1]! +
          0.114 * imageData.data[o + 2]!;
      }

      const motion = frameMotion(prevGrayRef.current, gray);
      prevGrayRef.current = gray;
      result = {
        ...result,
        scores: { ...result.scores, motion },
      };

      const now = Date.now();
      const warmedUp = now - streamStartRef.current >= STABILITY.warmupMs;
      const motionOk =
        !warmedUp || motion < motionThreshold;

      const readyColor =
        result.color === "green" ||
        (mobile && result.alignmentPass && result.color === "yellow");

      if (!readyColor || !motionOk) {
        greenSinceRef.current = null;
        setReadyStable(false);
        if (!motionOk && readyColor) {
          result = {
            ...result,
            color: result.color === "green" ? "yellow" : result.color,
            messages: [
              "Hold card still",
              ...result.messages.filter((m) => m !== "Hold card still"),
            ],
          };
        }
      } else if (greenSinceRef.current == null) {
        greenSinceRef.current = now;
        setReadyStable(false);
      } else if (now - greenSinceRef.current >= stableMs) {
        setReadyStable(true);
        if (!autoCapturedRef.current) {
          autoCapturedRef.current = true;
          void performCapture({ auto: true });
        }
      } else {
        setReadyStable(false);
      }

      analysisRef.current = result;
      const displayColor =
        mobile && result.alignmentPass && result.color === "yellow"
          ? "green"
          : result.color;
      setOverlayColor(displayColor);

      const messages = [...result.messages];
      if (mobile && result.scores.sharpness < 20) {
        messages.unshift("Tap card text to focus");
      }
      setFeedback(messages.slice(0, 2));

      if (
        mobile &&
        result.scores.sharpness < 14 &&
        Date.now() - lastAutoFocusRef.current > 2500
      ) {
        lastAutoFocusRef.current = Date.now();
        const track = streamRef.current?.getVideoTracks()[0];
        if (track) void applyCardTextFocus(track);
      }
    };

    const id = window.setInterval(tick, intervalMs);
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [streamReady, captured, mode, mobile, motionThreshold, performCapture, stableMs]);

  const handleRetake = () => {
    captureInProgressRef.current = false;
    setProcessing(false);
    setCaptured(null);
    setCaptureWarning(null);
    setCameraError(null);
    onRetake?.();
    if (!mobile) {
      void startCamera(selectedDeviceIdRef.current || undefined);
    }
  };

  const handleUpload = (file: File) => {
    if (captureInProgressRef.current) return;
    captureInProgressRef.current = true;
    setProcessing(true);
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const raw = reader.result as string;
          const dataUrl = await compressDataUrlForStorage(raw);
          setCaptured(dataUrl);
          stopStream();
          onCapture(dataUrl);
        } catch (err) {
          const info = logCameraError(err, "compressUpload");
          setCameraError(info);
        } finally {
          captureInProgressRef.current = false;
          setProcessing(false);
        }
      })();
    };
    reader.onerror = () => {
      captureInProgressRef.current = false;
      setProcessing(false);
      const info = logCameraError(reader.error, "FileReader");
      setCameraError(info);
    };
    reader.readAsDataURL(file);
  };

  const takePhotoLabel =
    side === "front" ? "Take front photo" : "Take back photo";
  const uploadLabel =
    side === "front" ? "Upload Front Image" : "Upload Back Image";
  const insecureContext = cameraError?.name === "InsecureContext";
  const showLiveCamera = isSecureCameraContext() && !insecureContext;

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
        e.target.value = "";
      }}
    />
  );

  const processingLabel =
    side === "front" ? "Processing front photo…" : "Processing back photo…";

  if (processing) {
    return <PhotoProcessingScreen label={processingLabel} />;
  }

  if (mobile && !captured && !previewUrl) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center gap-4 px-1">
        <p className="text-center text-sm font-medium text-gray-800">{label}</p>
        <p className="text-center text-xs text-gray-500">
          Use your phone camera for a sharp, in-focus photo.
        </p>

        {cameraError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-semibold">{cameraError.hint}</p>
          </div>
        )}

        <Button
          fullWidth
          disabled={processing}
          onClick={() => fileInputRef.current?.click()}
        >
          {takePhotoLabel}
        </Button>

        {fileInput}
      </div>
    );
  }

  if (captured || previewUrl) {
    return (
      <div className="space-y-4">
        <img
          src={captured ?? previewUrl ?? ""}
          alt="Captured card"
          className="w-full rounded-xl border border-gray-200"
        />
        <Button variant="secondary" fullWidth onClick={handleRetake}>
          Retake
        </Button>
      </div>
    );
  }

  const captureControls = (
    <>
      {showLiveCamera && cameras.length > 1 && (
        <label className="block text-sm">
          <span className="sr-only">Camera</span>
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              const id = e.target.value;
              selectedDeviceIdRef.current = id;
              setSelectedDeviceId(id);
              void startCamera(id);
            }}
            className={
              mobile
                ? "w-full rounded-lg border-0 bg-white/15 px-2 py-1.5 text-xs text-white"
                : "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            }
          >
            {cameras.map((cam, i) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cam.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {showLiveCamera && (
        <>
          {mobile && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => void handleFocusText()}
              disabled={!streamReady || starting || focusing}
            >
              {focusing ? "Focusing…" : "Focus card text"}
            </Button>
          )}
          <Button
            fullWidth
            onClick={() => void performCapture({ force: mobile || !readyStable })}
            disabled={!streamReady || starting || focusing || processing}
          >
            {processing
              ? "Processing…"
              : readyStable
                ? "Capture now"
                : "Capture photo"}
          </Button>
        </>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={
          mobile
            ? "w-full text-center text-xs text-white/80 underline-offset-2 hover:underline"
            : "hidden"
        }
      >
        Upload instead
      </button>

      {!mobile && (
        <Button fullWidth onClick={() => fileInputRef.current?.click()}>
          {uploadLabel}
        </Button>
      )}

      {showLiveCamera && !mobile && (
        <Button
          variant="secondary"
          fullWidth
          onClick={() =>
            void startCamera(selectedDeviceIdRef.current || undefined)
          }
          disabled={starting}
        >
          Try camera again
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-indigo-50 px-3 py-2 text-center text-xs text-indigo-900">
        <p className="font-medium">{captureModeLabel(mode)} mode</p>
        <p className="mt-1">{CAPTURE_INSTRUCTION}</p>
        {!isMobileDevice() && (
          <p className="mt-1 text-indigo-700">
            Desktop webcam: move the card closer until it fills the outline.
          </p>
        )}
      </div>

      <p className="text-center text-sm text-gray-600">{label}</p>

      {cameraError && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            insecureContext
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-semibold">{cameraError.hint}</p>
          {!insecureContext && (
            <p className="mt-2 font-mono text-xs">
              <span className="font-semibold">{cameraError.name}</span>
              {": "}
              {cameraError.message}
            </p>
          )}
        </div>
      )}

      {showLiveCamera ? (
        <div
          ref={videoContainerRef}
          className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black"
          onPointerUp={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            void handleFocusTap(e.clientX, e.clientY);
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {(!streamReady || starting) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
              {starting ? "Starting camera…" : "Waiting for camera…"}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`rounded-lg border-4 transition-colors duration-300 ${overlayBorderClass(overlayColor)}`}
              style={{
                height: `${heightPct * 100}%`,
                aspectRatio: `${aspect}`,
                maxHeight: "100%",
                maxWidth: "90%",
              }}
            />
          </div>

          <div
            className={`pointer-events-none absolute bottom-3 left-1/2 max-w-[92%] -translate-x-1/2 rounded-lg px-3 py-2 text-center text-xs font-medium ${overlayHintClass(overlayColor)}`}
          >
            {readyStable
              ? "Ready — hold steady…"
              : focusing
                ? "Focusing…"
                : feedback.join(" · ")}
          </div>
        </div>
      ) : (
        <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center text-sm text-gray-600">
          <p>Live preview unavailable over HTTP on your phone.</p>
          <p className="font-medium text-gray-800">
            Use the button below to take a photo with your camera.
          </p>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={analysisCanvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />

      {captureWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {captureWarning}
        </div>
      )}

      {captureControls}
    </div>
  );
}
