"use client";

import { Suspense } from "react";
import { ProfessorSolDirectedBuildApp } from "@/components/professor/ProfessorSolDirectedBuildApp";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";
import { RequireCustomerForDeckBuild } from "@/components/store-inventory/RequireCustomerForDeckBuild";
import { deckBuildReturnPath } from "@/lib/store-inventory/deck-build-auth";

function Loading() {
  return (
    <ProfessorMtgPageShell>
      <div className="flex flex-1 items-center justify-center">
        <p className="professor-mtg-muted text-sm italic">Entering the brewing chamber…</p>
      </div>
    </ProfessorMtgPageShell>
  );
}

export function ProfessorSolDirectedBuildPageClient({ slug }: { slug: string }) {
  return (
    <RequireCustomerForDeckBuild
      slug={slug}
      returnPath={`${deckBuildReturnPath(slug, "professor/build")}?start=1`}
    >
      <Suspense fallback={<Loading />}>
        <ProfessorSolDirectedBuildApp slug={slug} />
      </Suspense>
    </RequireCustomerForDeckBuild>
  );
}
