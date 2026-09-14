import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Modal, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Sliders,
  Sparkles,
  PowerOff,
  Info,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  RefreshCw,
} from "lucide-react-native";
import { COLORS, GRADIENTS } from "../constants/theme";
import { useConnection } from "../contexts/ConnectionContext";
import { vpnBlocker, type VpnBlockerStatus } from "../services/vpnBlocker";

export default function AndroidVpnDemoCard() {
  const {
    networkMode,
    setNetworkMode,
    vpnStatus,
    state,
    internetStatus,
    usage,
    requestVpnConsent,
    consumeSimulatedBytes,
    resetDemoAllocation,
    exitDemoMode,
  } = useConnection();

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showDiagModal, setShowDiagModal] = useState(false);
  const [liveStatus, setLiveStatus] = useState<VpnBlockerStatus | null>(null);

  const refreshLiveStatus = async () => {
    if (!vpnBlocker.isAvailable()) return;
    try {
      setLiveStatus(await vpnBlocker.getStatus());
    } catch {
      // ignore
    }
  };

  const openDiag = () => {
    setShowDiagModal(true);
    void refreshLiveStatus();
  };

  const diag = liveStatus ?? vpnStatus;
  // « Valide » UNIQUEMENT si la session serveur est active ET l'autorisation
  // native est réellement accordée et non expirée (TTL natif > 0).
  const hasValidAuth = state === "wifi_active" && (diag?.authTtlMs ?? 0) > 0;

  const isDemo = networkMode === "android_vpn_demo";
  const isBlocked = vpnStatus?.state === "BLOCKED" || vpnStatus?.tunnelUp;
  const isAllowed = vpnStatus?.state === "ALLOWED" && !vpnStatus?.tunnelUp;
  const isPermissionRequired = !vpnStatus?.consentGranted || vpnStatus?.state === "PERMISSION_REQUIRED";

  const handleToggleMode = (mode: "mikrotik" | "android_vpn_demo" | "mock") => {
    setNetworkMode(mode);
  };

  const handleRequestConsent = async () => {
    setLoadingAction("consent");
    try {
      await requestVpnConsent();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSimulateBytes = async (mb: number) => {
    setLoadingAction(`sim_${mb}`);
    try {
      await consumeSimulatedBytes(mb * 1024 * 1024);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleExhaustQuota = async () => {
    setLoadingAction("exhaust");
    try {
      await consumeSimulatedBytes((usage.remainingQuotaMB + 10) * 1024 * 1024);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResetQuota = async () => {
    setLoadingAction("reset_quota");
    try {
      await resetDemoAllocation();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleExitDemo = () => {
    Alert.alert(
      "Quitter le mode démo",
      "Le tunnel VPN local sera fermé et Internet sera rétabli pour toutes les applications.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Quitter et rétablir Internet",
          style: "destructive",
          onPress: async () => {
            setLoadingAction("exit");
            try {
              await exitDemoMode();
            } finally {
              setLoadingAction(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.card}>
      {/* Sélecteur de mode */}
      <View style={styles.modeRow}>
        <Text style={styles.sectionTitle}>Mode Réseau :</Text>
        <View style={styles.modePills}>
          <Pressable
            onPress={() => handleToggleMode("android_vpn_demo")}
            style={[styles.pill, isDemo && styles.pillActive]}
          >
            <Text style={[styles.pillText, isDemo && styles.pillTextActive]}>Démo VPN</Text>
          </Pressable>
          <Pressable
            onPress={() => handleToggleMode("mikrotik")}
            style={[styles.pill, networkMode === "mikrotik" && styles.pillActive]}
          >
            <Text style={[styles.pillText, networkMode === "mikrotik" && styles.pillTextActive]}>MikroTik</Text>
          </Pressable>
          <Pressable
            onPress={() => handleToggleMode("mock")}
            style={[styles.pill, networkMode === "mock" && styles.pillActive]}
          >
            <Text style={[styles.pillText, networkMode === "mock" && styles.pillTextActive]}>Mock</Text>
          </Pressable>
        </View>
      </View>

      {isDemo && (
        <>
          {/* Bannière d'état VpnService */}
          <View style={[styles.statusBanner, isAllowed ? styles.statusAllowed : styles.statusBlocked]}>
            <View style={styles.bannerIcon}>
              {isAllowed ? (
                <ShieldCheck color="#22C55E" size={20} />
              ) : isPermissionRequired ? (
                <ShieldAlert color="#F59E0B" size={20} />
              ) : (
                <Shield color="#EF4444" size={20} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {isAllowed
                  ? "Internet autres apps : AUTORISÉ"
                  : isPermissionRequired
                  ? "Consentement VPN requis"
                  : "Internet autres apps : SUSPENDU"}
              </Text>
              <Text style={styles.bannerSub}>
                {isAllowed
                  ? "Tunnel de blocage retiré (session active)"
                  : "Tunnel TUN actif — Bôjô conserve son accès"}
              </Text>
            </View>
          </View>

          {/* Bouton de consentement si manquant */}
          {isPermissionRequired && (
            <Pressable
              onPress={handleRequestConsent}
              disabled={loadingAction === "consent"}
              style={styles.consentButton}
            >
              <LinearGradient
                colors={GRADIENTS.accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {loadingAction === "consent" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Radio color="#FFFFFF" size={16} />
                  <Text style={styles.consentButtonText}>Activer le contrôle VPN local</Text>
                </>
              )}
            </Pressable>
          )}

          {/* Actions de simulation de consommation */}
          <View style={styles.simBox}>
            <View style={styles.simHeader}>
              <Sliders color={COLORS.textSecondary} size={14} />
              <Text style={styles.simTitle}>Consommation simulée persistante (5 Go) :</Text>
            </View>
            <View style={styles.simButtonsRow}>
              <Pressable
                onPress={() => handleSimulateBytes(50)}
                disabled={Boolean(loadingAction) || usage.remainingQuotaMB <= 0}
                style={styles.simBtn}
              >
                <Text style={styles.simBtnText}>+50 Mo</Text>
              </Pressable>
              <Pressable
                onPress={() => handleSimulateBytes(500)}
                disabled={Boolean(loadingAction) || usage.remainingQuotaMB <= 0}
                style={styles.simBtn}
              >
                <Text style={styles.simBtnText}>+500 Mo</Text>
              </Pressable>
              <Pressable
                onPress={handleExhaustQuota}
                disabled={Boolean(loadingAction) || usage.remainingQuotaMB <= 0}
                style={[styles.simBtn, styles.simBtnDanger]}
              >
                <Text style={[styles.simBtnText, { color: COLORS.danger }]}>Épuiser</Text>
              </Pressable>
              <Pressable
                onPress={handleResetQuota}
                disabled={Boolean(loadingAction)}
                style={[styles.simBtn, styles.simBtnSuccess]}
              >
                <RefreshCw color="#22C55E" size={12} />
                <Text style={[styles.simBtnText, { color: "#22C55E" }]}>Reset 5G</Text>
              </Pressable>
            </View>
          </View>

          {/* Boutons Diagnostic & Quitter */}
          <View style={styles.footerRow}>
            <Pressable onPress={openDiag} style={styles.diagBtn}>
              <Info color={COLORS.textSecondary} size={14} />
              <Text style={styles.diagBtnText}>Diagnostic</Text>
            </Pressable>

            <Pressable onPress={handleExitDemo} style={styles.exitBtn}>
              <PowerOff color={COLORS.danger} size={14} />
              <Text style={styles.exitBtnText}>Quitter démo</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Modal de diagnostic détaillé */}
      <Modal visible={showDiagModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Diagnostic Démo Android</Text>
              <Pressable onPress={() => setShowDiagModal(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 10 }}>
              <DiagItem
                label="Permission VPN"
                value={vpnStatus?.consentGranted ? "Accordée" : "Manquante"}
                ok={vpnStatus?.consentGranted}
              />
              <DiagItem
                label="Service de contrôle"
                value={vpnStatus?.serviceRunning ? "Actif (foreground)" : "Inactif"}
                ok={vpnStatus?.serviceRunning}
              />
              <DiagItem
                label="Tunnel TUN (blocage)"
                value={vpnStatus?.tunnelUp ? "Actif (Capture tout sauf Bôjô)" : "Retiré (Trafic libre)"}
                ok={true}
              />
              <DiagItem
                label="État interne VpnBlocker"
                value={vpnStatus?.state ?? "Inconnu"}
                ok={vpnStatus?.state === "BLOCKED" || vpnStatus?.state === "ALLOWED"}
              />
              <DiagItem
                label="Validation serveur"
                value={
                  hasValidAuth
                    ? "Valide (session active + TTL natif > 0)"
                    : state === "wifi_active"
                    ? "Session OK mais autorisation natif expirée"
                    : "En attente / expirée"
                }
                ok={hasValidAuth}
              />
              <DiagItem
                label="Autorisation native"
                value={`TTL restant : ${((diag?.authTtlMs ?? 0) / 1000).toFixed(0)} s`}
                ok={(diag?.authTtlMs ?? 0) > 0}
              />
              <DiagItem
                label="Génération session"
                value={`#${vpnStatus?.generation ?? 1}`}
                ok={true}
              />
              <DiagItem
                label="Quota restant"
                value={`${usage.remainingQuotaMB} Mo / ${usage.totalQuotaMB} Mo`}
                ok={usage.remainingQuotaMB > 0}
              />
              <DiagItem
                label="Exclusion Bôjô"
                value="Active (addDisallowedApplication)"
                ok={true}
              />
              <View style={styles.diagNotice}>
                <Info color="#F59E0B" size={14} />
                <Text style={styles.diagNoticeText}>
                  Bôjô conserve l'accès réseau pour contacter Supabase et charger les publicités. Pour prouver la suspension, testez depuis Chrome ou YouTube en mode écran partagé.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DiagItem({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={styles.diagItem}>
      <Text style={styles.diagLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {ok !== undefined && (
          ok ? <CheckCircle2 color="#22C55E" size={14} /> : <AlertCircle color="#F59E0B" size={14} />
        )}
        <Text style={styles.diagValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(24, 24, 27, 0.75)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 14,
    gap: 12,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter-Bold",
  },
  modePills: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  pillActive: {
    backgroundColor: COLORS.primary,
  },
  pillText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter-Regular",
  },
  pillTextActive: {
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
  },
  statusAllowed: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  statusBlocked: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  bannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  bannerTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter-Bold",
  },
  bannerSub: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    fontFamily: "Inter-Regular",
  },
  consentButton: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    overflow: "hidden",
  },
  consentButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter-Bold",
  },
  simBox: {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  simHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  simTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: "Inter-Regular",
  },
  simButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  simBtn: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  simBtnDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderWidth: 1,
  },
  simBtnSuccess: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderWidth: 1,
  },
  simBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter-Bold",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  diagBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter-Regular",
  },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  exitBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontFamily: "Inter-Bold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#18181B",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 10,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter-Bold",
  },
  modalClose: {
    padding: 4,
  },
  modalCloseText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  diagItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  diagLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: "Inter-Regular",
  },
  diagValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter-Bold",
  },
  diagNotice: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
  },
  diagNoticeText: {
    flex: 1,
    color: "#F59E0B",
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter-Regular",
  },
});
