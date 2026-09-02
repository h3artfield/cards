import type { Metadata } from "next";
import { HowCosWorksContent } from "@/components/professor/HowCosWorksContent";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";

export const metadata: Metadata = {
  title: "How COS Scores Your Commander Deck",
  description:
    "Two numbers: how strong the deck is, and how well the 99 is optimized. Competitive Strength and Build Optimization from COS.",
};

export default async function StoreHowCosWorksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <ProfessorMtgPageShell>
      <HowCosWorksContent
        backHref={`/s/${slug}/inventory/professor`}
        backLabel="Back to Professor"
        gradeHref={`/s/${slug}/inventory/professor`}
      />
    </ProfessorMtgPageShell>
  );
}
