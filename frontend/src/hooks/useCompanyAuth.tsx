'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { companyGetMe, COMPANY_TOKEN_KEY } from '@/lib/api';
import type { CompanyProfile } from '@/types';

interface CompanyAuthContextType {
  token: string | null;
  company: CompanyProfile | null;
  // True only while the initial localStorage-token -> /companies/me check is
  // in flight. Pages that need to redirect unauthenticated visitors (e.g.
  // /account, /checkout) should wait for this before deciding.
  loading: boolean;
  isAuthenticated: boolean;
  setSession: (token: string, company: CompanyProfile) => void;
  logout: () => void;
  // Re-fetches /companies/me — call after an action that changes the
  // company's own profile (none yet, but addresses/orders pages may want a
  // credit-terms refresh later).
  refresh: () => Promise<void>;
}

const CompanyAuthContext = createContext<CompanyAuthContextType | null>(null);

export function CompanyAuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem(COMPANY_TOKEN_KEY);
    setTokenState(null);
    setCompany(null);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(COMPANY_TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    setTokenState(saved);
    companyGetMe(saved)
      .then((c) => setCompany(c))
      .catch(() => clearSession())
      .finally(() => setLoading(false));
    // Only run once on mount — this hydrates from whatever's in
    // localStorage; setSession/logout below manage state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSession = useCallback((t: string, c: CompanyProfile) => {
    localStorage.setItem(COMPANY_TOKEN_KEY, t);
    setTokenState(t);
    setCompany(c);
  }, []);

  const logout = useCallback(() => clearSession(), [clearSession]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setCompany(await companyGetMe(token));
    } catch {
      clearSession();
    }
  }, [token, clearSession]);

  return (
    <CompanyAuthContext
      value={{
        token,
        company,
        loading,
        isAuthenticated: !!token && !!company,
        setSession,
        logout,
        refresh,
      }}
    >
      {children}
    </CompanyAuthContext>
  );
}

export function useCompanyAuth() {
  const ctx = useContext(CompanyAuthContext);
  if (!ctx) throw new Error('useCompanyAuth must be used within CompanyAuthProvider');
  return ctx;
}
