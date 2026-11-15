import {
  DINOV3_MODEL_ID,
  poolDinoV3Features,
  quantizeDinoV3ToBinary384,
  type Binary384,
} from "./dinov3-embed";

type FeatureExtractorFn = (
  input: string,
  options?: Record<string, unknown>,
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

let extractorPromise: Promise<FeatureExtractorFn | null> | null = null;
let loadedBackend: "webgpu" | "wasm" | null = null;

async function hasWebGpu(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
  if (!gpu?.requestAdapter) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

export function getDinoV3Backend(): "webgpu" | "wasm" | null {
  return loadedBackend;
}

export function preloadBrowserDinoV3(): Promise<FeatureExtractorFn | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      const useGpu = await hasWebGpu();
      if (useGpu) {
        try {
          const pipe = (await pipeline("image-feature-extraction", DINOV3_MODEL_ID, {
            device: "webgpu",
            dtype: "q4",
          })) as unknown as FeatureExtractorFn;
          loadedBackend = "webgpu";
          return pipe;
        } catch {
          // Fall back to q8 WASM if WebGPU shader compilation fails on older mobile GPU
        }
      }

      const pipe = (await pipeline("image-feature-extraction", DINOV3_MODEL_ID, {
        device: "wasm",
        dtype: "q8",
      })) as unknown as FeatureExtractorFn;
      loadedBackend = "wasm";
      return pipe;
    } catch (err) {
      console.warn("[dinov3-browser] Failed to load DINOv3 ONNX:", err);
      return null;
    }
  })();

  return extractorPromise;
}

export async function computeBrowserDinoV3Hash(
  imageDataUrl: string,
): Promise<Binary384 | null> {
  const extractor = await preloadBrowserDinoV3();
  if (!extractor) return null;

  try {
    const tensor = await extractor(imageDataUrl);
    if (!tensor?.data || !tensor?.dims) return null;
    const vec = poolDinoV3Features(tensor.data, tensor.dims);
    return quantizeDinoV3ToBinary384(vec);
  } catch {
    return null;
  }
}
