import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { checkLicense, type LicenseState, type LicenseStatus } from "../repositories/licenseRepository";
import { isDevelopment } from "../lib/config";
import { logger } from "../lib/logger";

const TAG = "license";

const LICENSE_CACHE_KEY = "@wifizone/license_token";

export type LicenseGate = {
  status: "checking" | "ok" | "expired" | "suspended" | "unreachable";
  state: LicenseState;
  details?: LicenseStatus["details"];
};

interface LicenseContextValue {
  gate: LicenseGate;
  refresh: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue | undefined>(undefined);

/**
 * Court-circuite la vérification en développement local pour ne pas bloquer
 * l'interface sur une configuration non renseignée. En pilote/production,
 * la vérification est réelle.
 */
export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<LicenseGate>({ status: "checking", state: "unknown" });
  const checkingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      // En développement sans URL configurée, on autorise le travail local.
      // Ce n'est PAS un contournement : la décision finale reste côté serveur
      // dans les builds pilote/prod.
      if (isDevelopment()) {
        setGate({ status: "ok", state: "valid" });
        return;
      }

      const status: LicenseStatus = await checkLicense();

      switch (status.state) {
        case "valid":
          setGate({ status: "ok", state: "valid", details: status.details });
          break;
        case "expired":
          setGate({ status: "expired", state: "expired", details: status.details });
          break;
        case "suspended":
        case "revoked":
          setGate({ status: "suspended", state: status.state, details: status.details });
          break;
        case "unreachable":
          // Serveur injoignable → on essaie de réutiliser un jeton signé valide.
          const cached = await loadCachedStatus();
          if (cached && cached.status === "ok") {
            setGate(cached);
          } else {
            setGate({ status: "unreachable", state: "unreachable" });
          }
          break;
        default:
          setGate({ status: "unreachable", state: "unknown" });
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ gate, refresh }), [gate, refresh]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

async function loadCachedStatus(): Promise<LicenseGate | null> {
  try {
    const raw = await AsyncStorage.getItem(LICENSE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LicenseGate;
    const expiresAt = (parsed as { exp?: number }).exp ?? 0;
    if (Date.now() / 1000 < expiresAt) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
