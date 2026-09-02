"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProfessorBrewSetupApp } from "@/components/professor/ProfessorBrewSetupApp";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";
import { RequireCustomerForDeckBuild } from "@/components/store-inventory/RequireCustomerForDeckBuild";
import { deckBuildReturnPath } from "@/lib/store-inventory/deck-build-auth";

function Loading() {
  return (
    <ProfessorMtgPageShell>
      <div className="flex flex-1 items-center justify-center">
        <p className="professor-mtg-muted text-sm italic">Loading…</p>
      </div>
    </ProfessorMtgPageShell>
  );
}

function Content() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return (
      <ProfessorMtgPageShell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-red-400/90">Store not found</p>
        </div>
      </ProfessorMtgPageShell>
    );
  }
  return (
    <RequireCustomerForDeckBuild
      slug={slug}
      returnPath={deckBuildReturnPath(slug, "professor")}
    >
      <ProfessorBrewSetupApp slug={slug} />
    </RequireCustomerForDeckBuild>
  );
}

export default function ProfessorBrewPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}
