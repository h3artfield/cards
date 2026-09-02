import { redirect } from "next/navigation";
import { isProfessorSolDirectedGuiEnabled } from "@/lib/deck-synthesis/professor-sol-directed-gui-flag-v1-1-1";
import { ProfessorSolDirectedBuildPageClient } from "@/components/professor/ProfessorSolDirectedBuildPageClient";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ buildId?: string; sessionId?: string; start?: string }>;
};

export default async function ProfessorBrewBuildPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { buildId, sessionId, start } = await searchParams;

  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070a] text-red-400">
        Store not found
      </div>
    );
  }

  if (!isProfessorSolDirectedGuiEnabled()) {
    const legacyParams = new URLSearchParams();
    if (sessionId) legacyParams.set("sessionId", sessionId);
    const qs = legacyParams.toString();
    redirect(`/s/${slug}/inventory/professor/build/legacy${qs ? `?${qs}` : ""}`);
  }

  if (!buildId && start !== "1") {
    redirect(`/s/${slug}/inventory/professor`);
  }

  return <ProfessorSolDirectedBuildPageClient slug={slug} />;
}
