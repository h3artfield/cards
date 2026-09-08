"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CustomerDeckNavV1 } from "@/components/professor/CustomerDeckNavV1";
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
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <CustomerDeckNavV1 slug={slug} />
          <div className="professor-mtg-chamber__inner mt-4 overflow-hidden">
            <ProfessorDeckEditorPanel slug={slug} deckId={deckId} />
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
