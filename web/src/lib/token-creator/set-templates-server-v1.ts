import file from "./set-templates-v1.json";
import type { TokenSetTemplateV1, TokenSetTemplatesFileV1 } from "./set-templates-v1";

/** Regenerate with `npm run token-sets:build`. */
const byCode = new Map((file as TokenSetTemplatesFileV1).sets.map((s) => [s.code, s]));

export function tokenSetTemplateByCodeV1(code: string): TokenSetTemplateV1 | null {
  return byCode.get(code) ?? null;
}
