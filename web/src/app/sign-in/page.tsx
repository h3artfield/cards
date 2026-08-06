"use client";

import { Suspense } from "react";
import { SignInForm } from "./SignInForm";
import { SignInShell } from "./SignInShell";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <SignInShell>
          <p className="text-center text-sm font-medium text-gray-600">Loading…</p>
        </SignInShell>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
