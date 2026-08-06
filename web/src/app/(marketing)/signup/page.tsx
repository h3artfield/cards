"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export function StoreSignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    if (form.get("terms") !== "on") {
      setError("Please agree to the terms to continue.");
      setLoading(false);
      return;
    }

    const payload = {
      storeName: String(form.get("storeName") ?? ""),
      ownerName: String(form.get("ownerName") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      address: String(form.get("address") ?? ""),
      website: String(form.get("website") ?? "") || undefined,
      password: String(form.get("password") ?? ""),
      storeSlug: String(form.get("storeSlug") ?? "") || undefined,
    };

    try {
      const res = await fetch("/api/store/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError("Checkout could not be started.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm disabled:bg-slate-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium">Store name</span>
        <input name="storeName" required disabled={loading} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Owner / contact name</span>
        <input name="ownerName" required disabled={loading} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={loading}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Phone</span>
        <input name="phone" type="tel" required disabled={loading} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Store address</span>
        <textarea name="address" required disabled={loading} rows={2} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Website or social link (optional)</span>
        <input name="website" type="url" disabled={loading} className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Custom store URL slug (optional)</span>
        <input
          name="storeSlug"
          placeholder="my-card-shop"
          disabled={loading}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-slate-500">
          Customer link will be /s/your-slug
        </span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={loading}
          className={inputClass}
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input name="terms" type="checkbox" required disabled={loading} className="mt-1" />
        <span>
          I agree to the service terms and understand this is a $100/month subscription after
          checkout.
        </span>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {loading ? "Starting checkout…" : "Sign up your store — $100/month"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-violet-700 hover:underline">
          Store login
        </Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold text-slate-900">Sign up your store</h1>
        <p className="mt-2 text-slate-600">
          Create your Card Scanner 9000 account and start your $100/month subscription.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <StoreSignupForm />
        </div>
      </div>
    </MarketingShell>
  );
}
