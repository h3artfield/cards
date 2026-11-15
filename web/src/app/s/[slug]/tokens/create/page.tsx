"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";
import { RequireCustomerForDeckBuild } from "@/components/store-inventory/RequireCustomerForDeckBuild";
import { TokenCreatorAppV1 } from "@/components/token-creator/TokenCreatorAppV1";

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
    <RequireCustomerForDeckBuild slug={slug} returnPath={`/s/${slug}/tokens/create`}>
      <TokenCreatorAppV1 slug={slug} />
    </RequireCustomerForDeckBuild>
  );
}

export default function TokenCreatorPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}
