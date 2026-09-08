"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href={`/s/${slug}/decks`} className="professor-mtg-link text-xs">
              ← My decks
            </Link>
            <Link href={`/s/${slug}`} className="professor-mtg-link text-xs">
              Dashboard
            </Link>
          </div>
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
