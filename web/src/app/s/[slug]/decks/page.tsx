"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { MyDecksApp } from "@/components/professor/MyDecksApp";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";
import { RequireCustomerForDeckBuild } from "@/components/store-inventory/RequireCustomerForDeckBuild";

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
    <RequireCustomerForDeckBuild slug={slug} returnPath={`/s/${slug}/decks`}>
      <MyDecksApp slug={slug} />
    </RequireCustomerForDeckBuild>
  );
}

export default function MyDecksPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}
