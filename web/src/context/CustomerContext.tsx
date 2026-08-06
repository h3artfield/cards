"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Customer } from "@/lib/types";

interface CustomerContextValue {
  customer: Customer | null;
  canViewOrderHistory: boolean;
  setCustomer: (customer: Customer | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const CustomerContext = createContext<CustomerContextValue>({
  customer: null,
  canViewOrderHistory: true,
  setCustomer: () => {},
  refresh: async () => {},
  logout: async () => {},
  loading: true,
});

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [canViewOrderHistory, setCanViewOrderHistory] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/customers/me", { credentials: "include" });
      if (!res.ok) {
        setCustomerState(null);
        setCanViewOrderHistory(true);
        return;
      }
      const data = await res.json();
      setCustomerState(data.customer ?? null);
      setCanViewOrderHistory(data.canViewOrderHistory !== false);
    } catch {
      setCustomerState(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const setCustomer = (c: Customer | null) => {
    setCustomerState(c);
  };

  const logout = useCallback(async () => {
    await fetch("/api/customers/logout", {
      method: "POST",
      credentials: "include",
    });
    setCustomerState(null);
    setCanViewOrderHistory(true);
  }, []);

  return (
    <CustomerContext.Provider
      value={{
        customer,
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
