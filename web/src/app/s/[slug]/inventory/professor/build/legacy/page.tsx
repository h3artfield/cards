import { redirect } from "next/navigation";
import { isProfessorSolDirectedGuiEnabled } from "@/lib/deck-synthesis/professor-sol-directed-gui-flag-v1-1-1";
import { ProfessorLegacyBrewBuildPageClient } from "@/components/professor/ProfessorLegacyBrewBuildPageClient";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sessionId?: string }>;
};

export default async function ProfessorLegacyBrewBuildPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { sessionId } = await searchParams;

  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07070a] text-red-400">
        Store not found
      </div>
    );
  }

  if (isProfessorSolDirectedGuiEnabled()) {
    redirect(`/s/${slug}/inventory/professor`);
  }

  if (!sessionId) {
    redirect(`/s/${slug}/inventory/professor`);
  }

  return <ProfessorLegacyBrewBuildPageClient slug={slug} />;
}
