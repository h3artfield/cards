/**
 * Feature flag — Sol-directed Professor GUI integration (staging rollback).
 */
export const PROFESSOR_SOL_DIRECTED_GUI_FLAG_V1_1_1_VERSION =
  "professor-sol-directed-gui-flag-v1-1-1";

export function isProfessorSolDirectedGuiEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED === "true";
}

/** Client-side mirror — set NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED=true in staging. */
export function isProfessorSolDirectedGuiEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED === "true";
}
