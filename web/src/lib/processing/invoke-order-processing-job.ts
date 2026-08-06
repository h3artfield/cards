import { v4 as uuidv4 } from "uuid";
import type { BuybackOrder } from "../types";
import {
  getCardProcessingPipelineMode,
  getCloudRunRegion,
  getOrderProcessingJobName,
  getOrderProcessingWorker,
} from "./processing-config";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

async function getGoogleAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function invokeOrderProcessingJob(input: {
  orderId: string;
  attemptId: string;
}): Promise<{ executionName?: string; invoked: boolean }> {
  const project =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!project) {
    console.error("[order job] missing FIREBASE_PROJECT_ID");
    return { invoked: false };
  }

  const region = getCloudRunRegion();
  const jobName = getOrderProcessingJobName();
  const token = await getGoogleAccessToken();
  if (!token) {
    console.error("[order job] no metadata token — cannot invoke Cloud Run Job");
    return { invoked: false };
  }

  const url = `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${jobName}:run`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            args: [
              "--order-id",
              input.orderId,
              "--attempt-id",
              input.attemptId,
            ],
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[order job] invoke failed", res.status, body.slice(0, 300));
    return { invoked: false };
  }

  const data = (await res.json()) as { name?: string };
  return { invoked: true, executionName: data.name };
}

export function newProcessingAttemptId(): string {
  return uuidv4();
}

export function newProcessingJobId(order: BuybackOrder): string {
  return order.processingJobId ?? uuidv4();
}

export async function dispatchOrderProcessing(
  orderId: string,
  attemptId: string,
): Promise<"cloud_run_job" | "after"> {
  const worker = getOrderProcessingWorker();
  if (worker === "cloud_run_job") {
    const result = await invokeOrderProcessingJob({ orderId, attemptId });
    if (result.invoked) return "cloud_run_job";
    console.warn(
      "[order job] Cloud Run Job invoke failed — falling back to after()",
    );
  }
  return "after";
}

export function logProcessingConfig(): void {
  console.log("[order processing config]", {
    worker: getOrderProcessingWorker(),
    pipeline: getCardProcessingPipelineMode(),
    job: getOrderProcessingJobName(),
    region: getCloudRunRegion(),
  });
}
