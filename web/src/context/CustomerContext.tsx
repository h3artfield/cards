"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Customer } from "@/lib/types";

/** The one store this customer belongs to. */
export interface CustomerHomeStore {
  id: string;
  slug: string;
  storeName: string;
  storeLogoUrl?: string;
}

interface CustomerContextValue {
  customer: Customer | null;
  store: CustomerHomeStore | null;
  canViewOrderHistory: boolean;
  setCustomer: (customer: Customer | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

type CustomerSession = {
  customer: Customer | null;
  store: CustomerHomeStore | null;
  canViewOrderHistory: boolean;
};

const SIGNED_OUT: CustomerSession = {
  customer: null,
  store: null,
  canViewOrderHistory: true,
};

async function fetchCustomerSession(): Promise<CustomerSession> {
  try {
    const res = await fetch("/api/customers/me", { credentials: "include" });
    if (!res.ok) return SIGNED_OUT;
    const data = await res.json();
    return {
      customer: data.customer ?? null,
      store: data.store ?? null,
      canViewOrderHistory: data.canViewOrderHistory !== false,
    };
  } catch {
    return SIGNED_OUT;
  }
}

const CustomerContext = createContext<CustomerContextValue>({
  customer: null,
  store: null,
  canViewOrderHistory: true,
  setCustomer: () => {},
  refresh: async () => {},
  logout: async () => {},
  loading: true,
});

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [store, setStore] = useState<CustomerHomeStore | null>(null);
  const [canViewOrderHistory, setCanViewOrderHistory] = useState(true);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: CustomerSession) => {
    setCustomerState(session.customer);
    setStore(session.store);
    setCanViewOrderHistory(session.canViewOrderHistory);
  }, []);

  const refresh = useCallback(async () => {
    applySession(await fetchCustomerSession());
  }, [applySession]);

  useEffect(() => {
    let active = true;
    fetchCustomerSession()
      .then((session) => {
        if (active) applySession(session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applySession]);

  const setCustomer = (c: Customer | null) => {
    setCustomerState(c);
  };

  const logout = useCallback(async () => {
    await fetch("/api/customers/logout", {
      method: "POST",
      credentials: "include",
    });
    setCustomerState(null);
    setStore(null);
    setCanViewOrderHistory(true);
  }, []);

  return (
    <CustomerContext.Provider
      value={{
        customer,
        store,
        canViewOrderHistory,
        setCustomer,
        refresh,
        logout,
        loading,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  return useContext(CustomerContext);
}
