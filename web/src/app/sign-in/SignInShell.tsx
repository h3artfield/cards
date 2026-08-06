"use client";

import { CustomerAuthShell } from "@/components/CustomerAuthShell";

export function SignInShell({ children }: { children: React.ReactNode }) {
  return <CustomerAuthShell>{children}</CustomerAuthShell>;
}
