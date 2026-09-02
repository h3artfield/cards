import type { Metadata } from "next";
import { HowCosWorksContent } from "@/components/professor/HowCosWorksContent";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";

export const metadata: Metadata = {
  title: "How COS Scores Your Commander Deck",
  description:
    "Two numbers: how strong the deck is, and how well the 99 is optimized. Competitive Strength and Build Optimization from COS.",
};

export default function HowCosWorksPage() {
  return (
    <ProfessorMtgPageShell>
      <HowCosWorksContent gradeHref="/stores" />
    </ProfessorMtgPageShell>
  );
}
