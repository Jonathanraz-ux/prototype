import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { AuthService } from "../services/auth";
import type { User, RegisterData } from "../types";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  pendingVerification: boolean;
  setPendingVerification: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const restored = await AuthService.restoreSession();
        if (restored) {
          setUser(restored);
        }
      } catch {
        // session restore failed
      } finally {
        setIsLoading(false);
        setInitialized(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const u = await AuthService.login(email, password);
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      const u = await AuthService.register(data);
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await AuthService.logout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    const updated = await AuthService.updateProfile(updates);
    setUser(updated);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await AuthService.requestPasswordReset(email);
  }, []);

  const verifyEmail = useCallback(async (code: string) => {
    await AuthService.verifyEmail(code);
    setPendingVerification(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isLoading || !initialized,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        requestPasswordReset,
        verifyEmail,
        pendingVerification,
        setPendingVerification
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
