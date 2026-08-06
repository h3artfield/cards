"use client";

import { useEffect, useState } from "react";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { flyerDisplayLoginPath, flyerDisplayShowPath } from "@/lib/store-slug";

export default function DisplayLoginPage() {
  const [formKey, setFormKey] = useState("manual");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoLogin, setAutoLogin] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const nextEmail = sp.get("email")?.trim() ?? "";
    const nextPassword = sp.get("password") ?? "";
    if (nextEmail || nextPassword) {
      window.history.replaceState({}, "", flyerDisplayLoginPath());
      setEmail(nextEmail);
      setPassword(nextPassword);
      setAutoLogin(Boolean(nextEmail && nextPassword));
      setFormKey("autologin");
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <AdminLoginForm
        key={formKey}
        expectedRole="store"
        title="Event flyer display"
        subtitle="Sign in with your store email and password to run the in-store flyer slideshow on this screen."
        redirectTo={flyerDisplayShowPath()}
        allowInactiveSubscription
        hardRedirect
        useDisplayToken
        defaultEmail={email}
        defaultPassword={password}
        autoLogin={autoLogin}
      />
    </div>
  );
}
