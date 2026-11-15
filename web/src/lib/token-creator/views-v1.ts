import { customerTokenAssetUrlV1 } from "./assets-v1";
import type { TokenDesignV1, TokenGenerationV1, TokenStyleModeV1, TokenVersionV1 } from "./types-v1";

/** What the browser is sent: no storage paths, only our own asset URLs. */
export type TokenVersionViewV1 = {
  versionId: string;
  generationId: string;
  slotIndex: number;
  artUrl: string;
  width: number;
  height: number;
  card: TokenVersionV1["card"];
  styleId: string | null;
  blendStyleId: string | null;
  blendWeight: number | null;
  model: string;
  createdAt: string;
};

export type TokenGenerationViewV1 = {
  generationId: string;
  status: TokenGenerationV1["status"];
  prompt: string;
  styleId: string | null;
  blendStyleId: string | null;
  styleMode: TokenStyleModeV1;
  model: string;
  createdAt: string;
  slots: Array<{
    slotIndex: number;
    status: TokenGenerationV1["slots"][number]["status"];
    error: string | null;
    versionId: string | null;
    history: string[];
    styleId: string | null;
    blendStyleId: string | null;
  }>;
};

export function versionViewV1(slug: string, v: TokenVersionV1): TokenVersionViewV1 {
  return {
    versionId: v.versionId,
    generationId: v.generationId,
    slotIndex: v.slotIndex,
    artUrl: customerTokenAssetUrlV1(slug, v.artworkPath),
    width: v.artworkWidth,
    height: v.artworkHeight,
    card: v.card,
    styleId: v.styleId,
    blendStyleId: v.blendStyleId ?? null,
    blendWeight: v.blendStyleId ? v.blendWeight ?? null : null,
    model: v.model,
    createdAt: v.createdAt,
  };
}

export function generationViewV1(g: TokenGenerationV1): TokenGenerationViewV1 {
  return {
    generationId: g.generationId,
    status: g.status,
    prompt: g.prompt,
    styleId: g.styleId,
    blendStyleId: g.blendStyleId ?? null,
    styleMode: g.styleMode ?? "single",
    model: g.model,
    createdAt: g.createdAt,
    slots: g.slots.map((s) => ({
      slotIndex: s.slotIndex,
      status: s.status,
      error: s.error,
      versionId: s.versionId,
      history: s.history,
      styleId: s.styleId,
      blendStyleId: s.blendStyleId ?? null,
    })),
  };
}

export type TokenDesignViewV1 = Omit<TokenDesignV1, "customerId" | "storeId">;

export function designViewV1(d: TokenDesignV1): TokenDesignViewV1 {
  const rest: Partial<TokenDesignV1> = { ...d };
  delete rest.customerId;
  delete rest.storeId;
  return rest as TokenDesignViewV1;
}
