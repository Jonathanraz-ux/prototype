import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { getSupabase } from "../lib/supabase";
import { AuthService } from "../services/auth";
import { setupPushNotifications, deactivatePushToken } from "../services/notifications";
import { logger } from "../lib/logger";
import type { User, RegisterData } from "../types";

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSiteManager: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        setUser(null);
        return;
      }
      const profile = await AuthService.getCurrentUser();
      setUser(profile);
    } catch (e) {
      logger.warn("authctx", "Échec restauration de session", e);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Réagir aux changements d'état d'authentification (connexion/déconnexion
  // depuis un autre point de l'app).
  useEffect(() => {
    const { data: sub } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setIsLoading(false);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.user) {
          AuthService.getCurrentUser().then(setUser);
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Configurer le push après une authentification réussie (non bloquant).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setupPushNotifications().catch(() => {
        // Ne jamais faire échouer le flux d'authentification à cause du push.
      });
    }, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const u = await AuthService.signIn(email, password);
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      const u = await AuthService.signUp(data);
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await deactivatePushToken();
    await AuthService.signOut();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: { firstName?: string; lastName?: string; phone?: string }) => {
      const updated = await AuthService.updateProfile(updates);
      setUser(updated);
    },
    []
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    await AuthService.requestPasswordReset(email);
  }, []);

  const refreshUser = useCallback(async () => {
    const profile = await AuthService.getCurrentUser();
    setUser(profile);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      isAdmin: user?.role === "organization_admin" || user?.role === "super_admin",
      isSiteManager:
        user?.role === "site_manager" ||
        user?.role === "organization_admin" ||
        user?.role === "super_admin",
      login,
      register,
      logout,
      updateProfile,
      requestPasswordReset,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, updateProfile, requestPasswordReset, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
