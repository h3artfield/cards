"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CatalogCoverageAdjudicationApp } from "@/components/catalog-coverage/CatalogCoverageAdjudicationApp";

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
      Loading semantic adjudication…
    </div>
  );
}

function PageContent() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-red-400">
        Store not found
      </div>
    );
  }
  return <CatalogCoverageAdjudicationApp slug={slug} />;
}

export default function CatalogCoverageAdjudicationPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <PageContent />
    </Suspense>
  );
}
