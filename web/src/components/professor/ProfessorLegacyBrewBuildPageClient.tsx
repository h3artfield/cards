"use client";

import { Suspense } from "react";
import { ProfessorBrewRoomApp } from "@/components/professor/ProfessorBrewRoomApp";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07070a] text-neutral-500">
      Entering the brewing room…
    </div>
  );
}

export function ProfessorLegacyBrewBuildPageClient({ slug }: { slug: string }) {
  return (
    <Suspense fallback={<Loading />}>
      <ProfessorBrewRoomApp slug={slug} />
    </Suspense>
  );
}
