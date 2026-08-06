import type { CardConditionReport, ScannedCard, VisionResult } from "../types";
import { hasBackImage } from "../card-image-utils";
import { isGradedSlab, slabLabel } from "./slab-pricing";

interface GradingResponse {
  ok: boolean;
  grading: {
    centering: number;
    corners: number;
    edges: number;
    surface: number;
    estimatedGrade: string;
    gradeRange?: string;
    centeringCap?: number;
    compositeScore?: number;
    disclaimer?: string;
    front?: {
      centering?: { ratios?: { leftRight?: string; topBottom?: string } };
    };
    back?: {
      centering?: { ratios?: { leftRight?: string; topBottom?: string } };
    };
  };
}

/** Extract raw base64 payload from a data: URL for the grading service. */
function dataUrlToBase64(url: string): string | null {
  const match = /^data:[^;]+;base64,([\s\S]+)$/i.exec(url.trim());
  return match?.[1] ?? null;
}

function gradingRequestBody(card: ScannedCard): Record<string, string> {
  const frontB64 = dataUrlToBase64(card.frontImageUrl);
  const backB64 = dataUrlToBase64(card.backImageUrl);
  if (frontB64 && backB64) {
    return { frontBase64: frontB64, backBase64: backB64 };
  }
  return { frontUrl: card.frontImageUrl, backUrl: card.backImageUrl };
}

export async function gradeCardCondition(
  card: ScannedCard,
): Promise<CardConditionReport> {
  if (isGradedSlab(card)) {
    const vision = card.visionJson as VisionResult | undefined;
    const company = vision?.slabCompany ?? card.slabCompany ?? "";
    const grade = vision?.slabGrade ?? card.slabGrade ?? "";
    const label = slabLabel(card) ?? `${company} ${grade}`.trim();
    return {
      centering: 0,
      corners: 0,
      edges: 0,
      surface: 0,
      estimatedGrade: label,
      disclaimer:
        "Certified slab — pre-grade uses the label grade; OpenCV raw analysis is skipped.",
      gradedAt: new Date().toISOString(),
      serviceAvailable: true,
      slabCertified: true,
      certifiedSlabCompany: company,
      certifiedSlabGrade: grade,
    };
  }

  if (!hasBackImage(card.backImageUrl)) {
    return unavailableReport(
      "Condition grading skipped — no back photo provided.",
    );
  }

  const baseUrl =
    process.env.GRADING_SERVICE_URL?.trim() ?? "http://localhost:8001";

  try {
    const res = await fetch(`${baseUrl}/grade-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gradingRequestBody(card)),
    });

    if (!res.ok) {
      const err = await res.text();
      return unavailableReport(
        `Grading service error (${res.status}): ${err.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as GradingResponse;
    const g = data.grading;

    return {
      centering: g.centering,
      corners: g.corners,
      edges: g.edges,
      surface: g.surface,
      estimatedGrade: g.estimatedGrade,
      gradeRange: g.gradeRange,
      centeringCap: g.centeringCap,
      compositeScore: g.compositeScore,
      frontCentering: g.front?.centering?.ratios
        ? {
            leftRight: g.front.centering.ratios.leftRight ?? "—",
            topBottom: g.front.centering.ratios.topBottom ?? "—",
          }
        : undefined,
      backCentering: g.back?.centering?.ratios
        ? {
            leftRight: g.back.centering.ratios.leftRight ?? "—",
            topBottom: g.back.centering.ratios.topBottom ?? "—",
          }
        : undefined,
      disclaimer:
        g.disclaimer ??
        "OpenCV pre-grade estimate — not a professional certification.",
      gradedAt: new Date().toISOString(),
      serviceAvailable: true,
      raw: g as unknown as Record<string, unknown>,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return unavailableReport(
      `Grading service unavailable at ${baseUrl}. Start: cd services/grading-service && uvicorn main:app --port 8001 (${msg})`,
    );
  }
}

function unavailableReport(note: string): CardConditionReport {
  return {
    centering: 0,
    corners: 0,
    edges: 0,
    surface: 0,
    estimatedGrade: "—",
    disclaimer: note,
    gradedAt: new Date().toISOString(),
    serviceAvailable: false,
  };
}
