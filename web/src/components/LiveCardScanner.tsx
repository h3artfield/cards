"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import {
  attachStreamToVideo,
  buildVideoConstraints,
  insecureContextHint,
  isPlayInterrupted,
  isSecureCameraContext,
  listVideoInputs,
  logCameraError,
  type CameraErrorInfo,
} from "@/lib/camera/utils";
import {
  applyCardTextFocus,
  applyTrackZoom,
  focusAtTap,
  getTrackZoomRange,
} from "@/lib/camera/focus";
import { OVERLAY_ASPECT, OVERLAY_HEIGHT_PCT } from "@/lib/camera/frame-analysis";
import {
  analyzeCardFrame,
  visibleGuideRectInVideo,
} from "@/lib/camera/card-detector";
import {
  dHashAlignedCandidatesFromGray,
  grayFromRgba,
  hamming64,
} from "@/lib/scan-index/dhash";
import {
  computeBrowserDinoV3Hash,
  getDinoV3Backend,
  preloadBrowserDinoV3,
} from "@/lib/scan-index/dinov3-browser";
import {
  matchCluster,
  matchScanIndexDinoV3,
} from "@/lib/scan-index/match";
import {
  appendRuntimeIndexedCard,
  loadBrowserScanIndex,
} from "@/lib/scan-index/client-store";
import {
  SCAN_INDEX_GAMES,
  type ScanIndexCard,
  type ScanIndexGame,
} from "@/lib/scan-index/types";
import { PrintingPickerSheet } from "./PrintingPickerSheet";
import type { PrintingSearchOption } from "@/app/api/scan-index/printings/route";

export type LiveScannerGameMode = "all" | ScanIndexGame | "other";

export type LiveScanMatchPayload = {
  card?: ScanIndexCard;
  game: Exclude<LiveScannerGameMode, "all">;
  frontImageUrl: string;
  matchDistance?: number;
};

interface LiveCardScannerProps {
  onCardDetected: (payload: LiveScanMatchPayload) => void | Promise<void>;
  onCardPrintingSwitched?: (card: ScanIndexCard) => void | Promise<void>;
  onIdentifyFallbackPhoto?: (frontImageUrl: string) => Promise<ScanIndexCard | null>;
  autoAdd?: boolean;
  defaultGame?: LiveScannerGameMode;
  headerRight?: React.ReactNode;
}

const GAME_TABS: Array<{ id: LiveScannerGameMode; label: string }> = [
  { id: "all", label: "All TCG" },
  { id: "magic", label: "Magic" },
  { id: "pokemon", label: "Pokémon" },
  { id: "other", label: "Sports / Other" },
];

const ZOOM_PRESETS = [1, 1.4, 2] as const;

function playScanBeep() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(18);
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.085);
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 150);
  } catch {
    // Ignore audio context restrictions
  }
}

function captureVisibleGuideJpeg(
  video: HTMLVideoElement,
  container: HTMLElement | null,
  maxWidth = 720,
  quality = 0.88,
): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera frame not ready");
  const cw = container?.clientWidth || vw;
  const ch = container?.clientHeight || vh;
  const rect = visibleGuideRectInVideo(vw, vh, cw, ch, "raw");

  const targetW = Math.min(maxWidth, Math.max(400, Math.round(rect.width)));
  const targetH = Math.round(targetW / OVERLAY_ASPECT.raw);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(
    video,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    targetW,
    targetH,
  );
  return canvas.toDataURL("image/jpeg", quality);
}

function catalogSourceToGame(source: ScanIndexCard["catalogSource"]): ScanIndexGame {
  if (source === "pokemon_tcg") return "pokemon";
  return "magic";
}

async function identifyCardViaServer(
  frontImageUrl: string,
  gameHint: LiveScannerGameMode,
): Promise<{
  card: Omit<ScanIndexCard, "hash" | "vHash">;
  cluster: Array<Omit<ScanIndexCard, "hash" | "vHash">>;
} | null> {
  try {
    const res = await fetch("/api/scan-index/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frontImageUrl, gameHint }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      matched?: boolean;
      card?: Omit<ScanIndexCard, "hash" | "vHash">;
      cluster?: Array<Omit<ScanIndexCard, "hash" | "vHash">>;
    };
    if (!data.matched || !data.card) return null;
    return {
      card: data.card,
      cluster: data.cluster?.length ? data.cluster : [data.card],
    };
  } catch {
    return null;
  }
}

export function LiveCardScanner({
  onCardDetected,
  onCardPrintingSwitched,
  onIdentifyFallbackPhoto,
  autoAdd = true,
  defaultGame = "all",
  headerRight,
}: LiveCardScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startGenRef = useRef(0);
  const selectedDeviceIdRef = useRef("");
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const [gameMode, setGameMode] = useState<LiveScannerGameMode>(defaultGame);
  const [autoScanEnabled, setAutoScanEnabled] = useState(autoAdd);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [streamReady, setStreamReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);

  const [zoomSupported, setZoomSupported] = useState(false);
  const [activeZoom, setActiveZoom] = useState<number>(1.4);

  const [indexCards, setIndexCards] = useState<ScanIndexCard[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(true);

  const [lockedHit, setLockedHit] = useState<{
    card: ScanIndexCard;
    cluster: ScanIndexCard[];
    distance: number;
    frontImageUrl: string;
  } | null>(null);
  const [clusterIdx, setClusterIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [cardInFrame, setCardInFrame] = useState(false);
  const [identifyingLive, setIdentifyingLive] = useState(false);
  const [dinoReady, setDinoReady] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Point camera at card");

  // Temporal stability & cooldown refs
  const prevGrayRef = useRef<Uint8Array | null>(null);
  const steadyFramesRef = useRef(0);
  const remoteIdentifyInFlightRef = useRef(false);
  const lastEvaluatedHashRef = useRef<bigint | null>(null);
  const lastAutoAddedCatalogIdRef = useRef<string | null>(null);
  const lastAutoAddedHashRef = useRef<bigint | null>(null);
  const lastAutoAddedTimeRef = useRef<number>(0);

  // Preload DINOv3 ViT-S/16 ONNX neural backbone in the browser
  useEffect(() => {
    let cancelled = false;
    void preloadBrowserDinoV3().then((pipe) => {
      if (!cancelled && pipe) {
        setDinoReady(getDinoV3Backend() ?? "wasm");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load scan index packs into memory (and cache in IndexedDB)
  useEffect(() => {
    let cancelled = false;
    if (gameMode === "other") {
      setIndexCards([]);
      setLoadingIndex(false);
      setStatusMessage("Hold card steady in frame or tap Snap Card");
      return;
    }

    setLoadingIndex(true);
    const gamesToLoad: ScanIndexGame[] =
      gameMode === "all" ? [...SCAN_INDEX_GAMES] : [gameMode];

    Promise.all(gamesToLoad.map((g) => loadBrowserScanIndex(g).catch(() => [])))
      .then((lists) => {
        if (cancelled) return;
        const merged = lists.flat();
        setIndexCards(merged);
        setStatusMessage("Hold card steady inside frame");
      })
      .finally(() => {
        if (!cancelled) setLoadingIndex(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gameMode]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamReady(false);
  }, []);

  const refreshCameras = useCallback(async (activeStream?: MediaStream | null) => {
    try {
      const inputs = await listVideoInputs();
      setCameras(inputs);
      const currentTrackDeviceId = activeStream
        ?.getVideoTracks()[0]
        ?.getSettings?.().deviceId;
      if (currentTrackDeviceId) {
        setSelectedDeviceId(currentTrackDeviceId);
      }
    } catch (err) {
      logCameraError(err, "enumerateDevices");
    }
  }, []);

  const handleZoomSelect = useCallback(async (factor: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setActiveZoom(factor);
    await applyTrackZoom(track, factor);
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!isSecureCameraContext()) {
        setCameraError({
          name: "InsecureContext",
          message: "Camera API requires HTTPS or localhost",
          hint: insecureContextHint(),
        });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError({
          name: "NotSupportedError",
          message: "Camera streaming not supported in this browser",
          hint: "Use Chrome, Safari, or Samsung Internet over HTTPS.",
        });
        return;
      }

      const gen = ++startGenRef.current;
      setStarting(true);
      setCameraError(null);
      stopStream();

      const isStale = () => gen !== startGenRef.current;

      try {
        // Only pass explicit deviceId when the user chose a specific camera from the dropdown!
        // Passing inputs[0].deviceId on Samsung phones often selects the ultra-wide lens instead of main rear camera.
        const media = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraints(deviceId || undefined),
          audio: false,
        });
        if (isStale()) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = media;
        const track = media.getVideoTracks()[0];
        if (track) {
          await applyCardTextFocus(track);
          const zoomRange = getTrackZoomRange(track);
          setZoomSupported(Boolean(zoomRange && zoomRange.max >= 1.3));
          if (zoomRange?.current) {
            setActiveZoom(Math.round(zoomRange.current * 10) / 10);
          }
        }
        const video = videoRef.current;
        if (!video) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        await attachStreamToVideo(video, media);
        if (isStale()) return;
        setStreamReady(true);
        await refreshCameras(media);
      } catch (err) {
        if (isStale()) return;
        if (isPlayInterrupted(err) && videoRef.current && streamRef.current) {
          try {
            await attachStreamToVideo(videoRef.current, streamRef.current);
            if (!isStale()) {
              setStreamReady(true);
              await refreshCameras(streamRef.current);
              return;
            }
          } catch (retryErr) {
            err = retryErr;
          }
        }
        setCameraError(logCameraError(err, "startLiveScanner"));
        setStreamReady(false);
      } finally {
        if (!isStale()) setStarting(false);
      }
    },
    [refreshCameras, stopStream],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      startGenRef.current += 1;
      stopStream();
    };
  }, [startCamera, stopStream]);

  const triggerCardAdd = useCallback(
    async (
      card: ScanIndexCard | undefined,
      frontImageUrl: string,
      distance?: number,
    ) => {
      playScanBeep();
      setFlashSuccess(true);
      window.setTimeout(() => setFlashSuccess(false), 320);

      const resolvedGame: Exclude<LiveScannerGameMode, "all"> = card
        ? catalogSourceToGame(card.catalogSource)
        : gameMode === "all"
          ? "other"
          : gameMode;

      await onCardDetected({
        card,
        game: resolvedGame,
        frontImageUrl,
        matchDistance: distance,
      });
    },
    [gameMode, onCardDetected],
  );

  // High-precision recognition loop:
  // - Never guesses a card from a fragile 64/128-bit pixel brightness hash!
  // - Watches at 20 FPS for a sharp, stationary card inside the guide box.
  // - As soon as the card is steady for 3 frames (~160ms):
  //   1. Checks 384-bit DINOv3 neural embedding (only accepts high-confidence neural matches <= 62 bit distance).
  //   2. Otherwise immediately runs `gpt-5.4-mini` + 2x Title/Collector-Strip zoom via `/api/scan-index/identify`
  //      to read the exact printed Card Name + Set Code + Collector Number.
  useEffect(() => {
    if (!streamReady) return;

    const video = videoRef.current;
    const canvas = scanCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const SCAN_W = 120;
    const SCAN_H = 168;
    canvas.width = SCAN_W;
    canvas.height = SCAN_H;

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      if (cancelled || !video.videoWidth || !video.videoHeight) return;

      const container = videoContainerRef.current;
      const guideRect = visibleGuideRectInVideo(
        video.videoWidth,
        video.videoHeight,
        container?.clientWidth || video.videoWidth,
        container?.clientHeight || video.videoHeight,
        "raw",
      );

      ctx.drawImage(
        video,
        guideRect.x,
        guideRect.y,
        guideRect.width,
        guideRect.height,
        0,
        0,
        SCAN_W,
        SCAN_H,
      );

      const img = ctx.getImageData(0, 0, SCAN_W, SCAN_H);
      const gray = grayFromRgba(img.data, SCAN_W, SCAN_H);
      const metrics = analyzeCardFrame(gray, SCAN_W, SCAN_H, prevGrayRef.current);
      prevGrayRef.current = gray;

      setCardInFrame(metrics.hasCard);

      const candidates = dHashAlignedCandidatesFromGray(
        gray,
        SCAN_W,
        SCAN_H,
        metrics.detectedBounds,
      );
      const primaryH = candidates[0]?.hHash ?? BigInt(0);
      const primaryV = candidates[0]?.vHash ?? BigInt(0);

      // Clear cooldown when card is removed or replaced with a different card
      if (
        lastAutoAddedHashRef.current != null &&
        (!metrics.hasCard || hamming64(primaryH, lastAutoAddedHashRef.current) > 14)
      ) {
        lastAutoAddedCatalogIdRef.current = null;
        lastAutoAddedHashRef.current = null;
        lastEvaluatedHashRef.current = null;
      }

      if (!metrics.isStableAndSharp) {
        steadyFramesRef.current = 0;
        return;
      }

      steadyFramesRef.current += 1;

      const alreadyEvaluatedThisScene =
        lastEvaluatedHashRef.current != null &&
        hamming64(primaryH, lastEvaluatedHashRef.current) <= 9;

      if (
        steadyFramesRef.current >= 3 &&
        !remoteIdentifyInFlightRef.current &&
        !alreadyEvaluatedThisScene
      ) {
        remoteIdentifyInFlightRef.current = true;
        lastEvaluatedHashRef.current = primaryH;
        setIdentifyingLive(true);

        void (async () => {
          try {
            const verifyJpeg = captureVisibleGuideJpeg(
              video,
              videoContainerRef.current,
              640,
              0.88,
            );
            const fullSaveJpeg = captureVisibleGuideJpeg(
              video,
              videoContainerRef.current,
              760,
              0.88,
            );

            // 1. Check ultra-strict 384-bit DINOv3 neural match (only for same-session / exact artwork hits)
            const dinoVec = await computeBrowserDinoV3Hash(verifyJpeg);
            if (dinoVec && gameMode !== "other" && indexCards.length > 0) {
              const dinoMatch = matchScanIndexDinoV3(dinoVec, indexCards, 60);
              const topDino = dinoMatch.hits[0];
              if (
                topDino &&
                topDino.distance <= 56 &&
                dinoMatch.margin >= 14 &&
                !cancelled
              ) {
                setLockedHit({
                  card: topDino.card,
                  cluster: matchCluster(dinoMatch.hits, 6).map((c) => c.card),
                  distance: topDino.distance,
                  frontImageUrl: fullSaveJpeg,
                });
                setStatusMessage(`Matched ${topDino.card.name}`);
                const now = Date.now();
                const isDifferentCard =
                  lastAutoAddedCatalogIdRef.current !== topDino.card.catalogId;
                const cooldownElapsed =
                  now - lastAutoAddedTimeRef.current > 1200;
                if (autoScanEnabled && isDifferentCard && cooldownElapsed) {
                  lastAutoAddedCatalogIdRef.current = topDino.card.catalogId;
                  lastAutoAddedHashRef.current = primaryH;
                  lastAutoAddedTimeRef.current = now;
                  await triggerCardAdd(
                    topDino.card,
                    fullSaveJpeg,
                    topDino.distance,
                  );
                }
                return;
              }
            }

            // 2. Run frontier Vision OCR + 2x Title/Collector-Strip zoom for exact printing match
            const customIdentified = onIdentifyFallbackPhoto
              ? await onIdentifyFallbackPhoto(verifyJpeg)
              : null;
            const serverRes = customIdentified
              ? { card: customIdentified, cluster: [customIdentified] }
              : await identifyCardViaServer(verifyJpeg, gameMode);

            if (serverRes && !cancelled) {
              const runtimeCard: ScanIndexCard = {
                ...serverRes.card,
                hash: primaryH,
                vHash: primaryV,
                ...(dinoVec ? { dinoHash: dinoVec } : {}),
              };
              const runtimeCluster: ScanIndexCard[] = serverRes.cluster.map(
                (c, idx) =>
                  idx === 0
                    ? runtimeCard
                    : { ...c, hash: primaryH, vHash: primaryV },
              );
              const g = catalogSourceToGame(runtimeCard.catalogSource);
              appendRuntimeIndexedCard(g, runtimeCard);
              setIndexCards((prev) => [runtimeCard, ...prev]);

              setClusterIdx(0);
              setLockedHit({
                card: runtimeCard,
                cluster: runtimeCluster,
                distance: 0,
                frontImageUrl: fullSaveJpeg,
              });
              setStatusMessage(`Matched ${runtimeCard.name}`);

              const now = Date.now();
              const isDifferentCard =
                lastAutoAddedCatalogIdRef.current !== runtimeCard.catalogId;
              const cooldownElapsed = now - lastAutoAddedTimeRef.current > 1200;

              if (autoScanEnabled && isDifferentCard && cooldownElapsed) {
                lastAutoAddedCatalogIdRef.current = runtimeCard.catalogId;
                lastAutoAddedHashRef.current = primaryH;
                lastAutoAddedTimeRef.current = now;
                await triggerCardAdd(runtimeCard, fullSaveJpeg, 0);
              }
            } else if (!cancelled) {
              setStatusMessage("Hold card steady & tap card to focus");
            }
          } finally {
            remoteIdentifyInFlightRef.current = false;
            if (!cancelled) setIdentifyingLive(false);
          }
        })();
      }
    }, 55);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    autoScanEnabled,
    gameMode,
    indexCards,
    onIdentifyFallbackPhoto,
    streamReady,
    triggerCardAdd,
  ]);

  const handleManualSnap = async () => {
    const video = videoRef.current;
    if (!video || !streamReady || snapBusy) return;
    setSnapBusy(true);
    try {
      const frontImageUrl = captureVisibleGuideJpeg(
        video,
        videoContainerRef.current,
        760,
        0.9,
      );
      setStatusMessage("Identifying card…");
      const customId = onIdentifyFallbackPhoto
        ? await onIdentifyFallbackPhoto(frontImageUrl)
        : null;
      const serverRes = customId
        ? { card: customId, cluster: [customId] }
        : await identifyCardViaServer(frontImageUrl, gameMode);

      if (serverRes) {
        const dinoVec = await computeBrowserDinoV3Hash(frontImageUrl);
        const enriched: ScanIndexCard = {
          ...serverRes.card,
          hash: BigInt(0),
          ...(dinoVec ? { dinoHash: dinoVec } : {}),
        };
        const enrichedCluster: ScanIndexCard[] = serverRes.cluster.map((c, i) =>
          i === 0 ? enriched : { ...c, hash: BigInt(0) },
        );
        setClusterIdx(0);
        setLockedHit({
          card: enriched,
          cluster: enrichedCluster,
          distance: 0,
          frontImageUrl,
        });
        await triggerCardAdd(enriched, frontImageUrl, 0);
        setStatusMessage(`Matched ${enriched.name}`);
        return;
      }

      await triggerCardAdd(undefined, frontImageUrl);
      setStatusMessage("Card captured — queued for processing");
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Could not capture frame",
      );
    } finally {
      setSnapBusy(false);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl) {
        void (async () => {
          setSnapBusy(true);
          try {
            const serverRes = await identifyCardViaServer(dataUrl, gameMode);
            if (serverRes) {
              const card: ScanIndexCard = {
                ...serverRes.card,
                hash: BigInt(0),
              };
              const cluster: ScanIndexCard[] = serverRes.cluster.map((c, i) =>
                i === 0 ? card : { ...c, hash: BigInt(0) },
              );
              setClusterIdx(0);
              setLockedHit({
                card,
                cluster,
                distance: 0,
                frontImageUrl: dataUrl,
              });
              await triggerCardAdd(card, dataUrl, 0);
            } else {
              await triggerCardAdd(undefined, dataUrl);
            }
          } finally {
            setSnapBusy(false);
          }
        })();
      }
    };
    reader.readAsDataURL(file);
  };

  const shownCard =
    lockedHit?.cluster[clusterIdx] ?? lockedHit?.card ?? null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-neutral-950 text-white">
      {/* Top Bar: Game selector + Auto-Add toggle */}
      <div className="z-20 flex flex-col gap-2 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-3 pt-2.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                identifyingLive
                  ? "animate-ping bg-amber-400"
                  : cardInFrame
                    ? "bg-emerald-400"
                    : "bg-neutral-500"
              }`}
            />
            <span className="text-xs font-medium text-neutral-200">
              {identifyingLive
                ? "Reading card printing…"
                : loadingIndex
                  ? "Loading card database…"
                  : statusMessage}
            </span>
            {dinoReady && (
              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300 ring-1 ring-indigo-500/40">
                DINOv3 {dinoReady}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoScanEnabled((v) => !v)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                autoScanEnabled
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {autoScanEnabled ? "⚡ Auto-Add ON" : "Auto-Add OFF"}
            </button>
            {headerRight}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {GAME_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setGameMode(tab.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  gameMode === tab.id
                    ? "bg-indigo-600 text-white"
                    : "bg-white/10 text-neutral-300 hover:bg-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {zoomSupported && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-black/60 p-0.5 ring-1 ring-white/15">
              {ZOOM_PRESETS.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => void handleZoomSelect(z)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${
                    Math.abs(activeZoom - z) < 0.15
                      ? "bg-amber-400 text-neutral-950"
                      : "text-neutral-300 hover:text-white"
                  }`}
                >
                  {z}×
                </button>
              ))}
            </div>
          )}
        </div>

        {cameras.length > 1 && (
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              const id = e.target.value;
              selectedDeviceIdRef.current = id;
              setSelectedDeviceId(id);
              void startCamera(id);
            }}
            className="w-full rounded-lg border border-white/15 bg-black/60 px-2.5 py-1 text-xs text-white"
          >
            {cameras.map((cam, i) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cam.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Live Camera Viewfinder */}
      <div
        ref={videoContainerRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-black"
        onPointerUp={(e) => {
          const track = streamRef.current?.getVideoTracks()[0];
          const container = videoContainerRef.current;
          if (track && container && streamReady) {
            void focusAtTap(track, e.clientX, e.clientY, container);
          }
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {(!streamReady || starting) && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-sm text-neutral-300">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            <span>{starting ? "Starting live scanner…" : "Waiting for camera…"}</span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/95 p-6 text-center">
            <p className="text-sm font-semibold text-amber-300">
              {cameraError.hint}
            </p>
            <p className="text-xs text-neutral-400">{cameraError.message}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => void startCamera(selectedDeviceIdRef.current || undefined)}
              >
                Retry Camera
              </Button>
              <Button onClick={() => fileInputRef.current?.click()}>
                Take / Upload Photo
              </Button>
            </div>
          </div>
        )}

        {/* Card Alignment Guide Box */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`rounded-xl border-2 transition-all duration-150 ${
              flashSuccess
                ? "scale-[1.02] border-emerald-400 shadow-[0_0_32px_rgba(52,211,153,0.85)]"
                : identifyingLive
                  ? "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.55)]"
                  : cardInFrame
                    ? "border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.55)]"
                    : "border-white/55"
            }`}
            style={{
              height: `${OVERLAY_HEIGHT_PCT.raw * 100}%`,
              aspectRatio: `${OVERLAY_ASPECT.raw}`,
              maxHeight: "90%",
              maxWidth: "85%",
            }}
          />
        </div>

        {/* ManaBox-style Instant Floating Recognition Overlay */}
        <div className="absolute inset-x-3 bottom-3 z-20 flex flex-col gap-2">
          {shownCard && lockedHit ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-neutral-900/95 p-3 shadow-xl backdrop-blur-md">
              {shownCard.imageUrl || lockedHit.frontImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shownCard.imageUrl ?? lockedHit.frontImageUrl}
                  alt={shownCard.name}
                  className="h-14 w-10 shrink-0 rounded object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                    Matched
                  </span>
                  {lockedHit.cluster.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx = (clusterIdx + 1) % lockedHit.cluster.length;
                        setClusterIdx(nextIdx);
                        const nextPrinting = lockedHit.cluster[nextIdx];
                        if (nextPrinting) {
                          void onCardPrintingSwitched?.(nextPrinting);
                        }
                      }}
                      className="text-[11px] font-medium text-indigo-400 underline"
                    >
                      Cycle set ({clusterIdx + 1}/{lockedHit.cluster.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-white/20"
                  >
                    Change Printing
                  </button>
                </div>
                <p className="truncate text-sm font-bold text-white">
                  {shownCard.name}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {[
                    shownCard.setName ?? shownCard.setCode?.toUpperCase(),
                    shownCard.cardNumber && `#${shownCard.cardNumber}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void triggerCardAdd(
                    shownCard,
                    lockedHit.frontImageUrl,
                    lockedHit.distance,
                  )
                }
                className="shrink-0 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-sm font-extrabold text-neutral-950 shadow hover:bg-emerald-400 active:scale-95"
              >
                +1 Add
              </button>
            </div>
          ) : null}

          {/* Instant Manual Snap Bar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!streamReady || snapBusy}
              onClick={() => void handleManualSnap()}
              className="flex-1 rounded-xl bg-indigo-600 py-3 text-center text-sm font-bold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {snapBusy || identifyingLive
                ? "Identifying Card…"
                : "Snap Card (or hold steady in box)"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-white/20 bg-neutral-900/90 px-3 py-3 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
              title="Upload photo"
            >
              Upload
            </button>
          </div>
        </div>
      </div>

      <canvas ref={scanCanvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = "";
        }}
      />

      <PrintingPickerSheet
        open={pickerOpen}
        initialName={shownCard?.name ?? ""}
        initialGame={
          shownCard?.catalogSource === "pokemon_tcg"
            ? "pokemon"
            : shownCard?.catalogSource === "scryfall"
              ? "magic"
              : gameMode === "magic" || gameMode === "pokemon"
                ? gameMode
                : "all"
        }
        currentCatalogId={shownCard?.catalogId}
        onClose={() => setPickerOpen(false)}
        onSelectPrinting={(picked: PrintingSearchOption) => {
          const newCard: ScanIndexCard = {
            ...picked,
            hash: lockedHit?.card.hash ?? BigInt(0),
            vHash: lockedHit?.card.vHash,
            dinoHash: lockedHit?.card.dinoHash,
          };
          setLockedHit((prev) =>
            prev
              ? {
                  ...prev,
                  card: newCard,
                  cluster: [
                    newCard,
                    ...prev.cluster.filter(
                      (c) => c.catalogId !== newCard.catalogId,
                    ),
                  ],
                }
              : null,
          );
          setClusterIdx(0);
          setPickerOpen(false);
          void onCardPrintingSwitched?.(newCard);
        }}
      />
    </div>
  );
}
