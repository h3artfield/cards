"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CustomerDeckNavV1 } from "@/components/professor/CustomerDeckNavV1";
import { ProfessorClientErrorBoundary } from "@/components/professor/ProfessorClientErrorBoundary";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";
import { ProfessorDeckEditorPanel } from "@/components/professor/deck-editor/ProfessorDeckEditorPanel";
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
  const { slug, deckId } = useParams<{ slug: string; deckId: string }>();
  if (!slug || !deckId) {
    return (
      <ProfessorMtgPageShell>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-red-400/90">Deck not found</p>
        </div>
      </ProfessorMtgPageShell>
    );
  }

  return (
    <RequireCustomerForDeckBuild slug={slug} returnPath={`/s/${slug}/decks/${deckId}`}>
      <ProfessorMtgPageShell>
        <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6 lg:px-10">
          <CustomerDeckNavV1 slug={slug} />
          <div className="professor-mtg-chamber__inner professor-mtg-chamber__inner--wide professor-mtg-chamber__inner--art mt-4 overflow-hidden">
            <ProfessorClientErrorBoundary
              fallbackTitle="Could not open the editor"
              fallbackBody="The deck was saved. Refresh to try opening it again."
            >
              <ProfessorDeckEditorPanel slug={slug} deckId={deckId} />
            </ProfessorClientErrorBoundary>
          </div>
        </div>
      </ProfessorMtgPageShell>
    </RequireCustomerForDeckBuild>
  );
}

export default function HandDeckPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}
