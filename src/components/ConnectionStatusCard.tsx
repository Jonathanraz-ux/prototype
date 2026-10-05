import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Clock, HardDrive, Sparkles } from "lucide-react-native";
import { COLORS } from "../constants/theme";
import type { NetworkProviderKind } from "../network";

export function formatDurationFR(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m} min`;
}

export function formatDataFR(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2).replace(".", ",")} Go`;
  }
  return `${Math.round(mb)} Mo`;
}

interface ConnectionStatusCardProps {
  connected: boolean;
  connecting?: boolean;
  percent: number;
  timeMinutes: number;
  quotaMB: number;
  consumedMB?: number;
  totalQuotaMB?: number;
  networkHealth?: string;
  providerKind?: NetworkProviderKind;
  /**
   * true quand le fournisseur « live » n'est PAS confirmé comme matériel
   * réel : agent de TEST (`MIKROTIK_MOCK`) ou information absente, faute de
   * `MIKROTIK_REAL=1`. L'adaptateur est bien « live », mais le routeur peut
   * être simulé : on l'annonce comme tel et on masque les compteurs. Ne
   * jamais afficher « accès réel » ni des Mo sur un mock, et se rappeler que
   * le défaut est la prudence (fail closed).
   */
  agentSimulated?: boolean;
  /**
   * true quand le serveur a au moins répondu sur l'état de la chaîne réseau.
   * `providerKind` seul ne prouve rien : il décrit la configuration locale,
   * pas ce que le routeur fait réellement. Défaut `false` = prudent, donc un
   * appelant qui oublie ce drapeau n'obtient jamais un faux « accès réel ».
   */
  detailVerified?: boolean;
  lastSyncAt?: string | null;
  /**
   * true uniquement si le compteur provient réellement du routeur (MikroTik,
   * providerKind "live" ET agent non simulé). En mode provisoire (simulé /
   * non configuré), les métriques de quota sont masquées au profit d'une
   * note honnête : le téléphone ne mesure pas la données traversant le
   * point d'accès.
   */
  meterTrusted?: boolean;
}

const PROVIDER_LABEL: Record<NetworkProviderKind, string | null> = {
  live: "Accès réseau réel (MikroTik)",
  simulated: "Simulation locale (mode démo)",
  unconfigured: null,
};

export default function ConnectionStatusCard({
  connected,
  connecting = false,
  percent,
  timeMinutes,
  quotaMB,
  consumedMB = 0,
  totalQuotaMB = 0,
  networkHealth,
  providerKind,
  agentSimulated = false,
  detailVerified = false,
  lastSyncAt,
  meterTrusted
}: ConnectionStatusCardProps) {
  const statusColor = connected ? COLORS.success : connecting ? COLORS.warning : COLORS.textMuted;
  const statusLabel = connected ? "Wi-Fi gratuit actif" : connecting ? "Autorisation en cours" : "Accès coupé";

  // Un compteur n'est « de confiance » que si le routeur est réel ET piloté
  // par un agent de production. `meterTrusted` reste prioritaire quand le
  // parent le fournit ; sinon on le déduit honnêtement des deux drapeaux.
  //
  // `detailVerified` est indispensable : `providerKind` vient de la
  // configuration LOCALE (EXPO_PUBLIC_NETWORK_MODE), donc il vaut déjà
  // « live » au premier rendu, avant tout appel réseau. Sans lui, un
  // simulateur s'affichait « Accès réseau réel (MikroTik) » avec 0 %.
  const countersTrusted =
    meterTrusted ?? (detailVerified && providerKind === "live" && !agentSimulated);
  const mockLive = providerKind === "live" && agentSimulated;
  // Tant que le serveur n'a pas répondu, on ne revendique aucun mode
  // d'accès : afficher « réel » ou « simulé » serait deviner.
  const providerLabel = !detailVerified
    ? "Mode réseau à confirmer"
    : mockLive
      ? "Routeur simulé (agent de test)"
      : providerKind
        ? PROVIDER_LABEL[providerKind]
        : null;

  const healthLabel = networkHealth
    ? {
        READY: "Agent & routeur opérationnels",
        AUTHENTICATION_FAILED: "Échec d'authentification routeur",
        UNREACHABLE: "Agent en ligne / routeur injoignable",
        NOT_CONFIGURED: "Agent non configuré",
        ERROR: "Erreur de connexion",
      }[networkHealth] ?? "État de connexion"
    : "État de connexion";

  const healthColor =
    networkHealth === "READY" ? COLORS.success : networkHealth === "NOT_CONFIGURED" ? COLORS.textMuted : COLORS.warning;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        <View style={styles.spacer} />
        <View style={styles.chip}>
          <Sparkles color={COLORS.primaryLight} size={11} />
          <Text style={styles.chipText}>Financé par la pub</Text>
        </View>
      </View>

      {countersTrusted ? (
        <>
          <View style={styles.percentRow}>
            <Text style={styles.percent}>{Math.round(percent)}%</Text>
            <Text style={styles.percentLabel}>de quota restant</Text>
          </View>

          {totalQuotaMB > 0 && (
            <Text style={styles.quotaType}>
              Quota initial : {formatDataFR(totalQuotaMB)} · consommé : {formatDataFR(consumedMB)}
            </Text>
          )}

          <View style={styles.divider} />

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <View style={styles.metricIcon}>
                <Clock color={connected ? COLORS.accent : COLORS.textMuted} size={15} />
              </View>
              <View>
                <Text style={styles.metricLabel}>Temps restant</Text>
                <Text style={styles.metricValue}>{connected ? formatDurationFR(timeMinutes) : "--"}</Text>
              </View>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <View style={styles.metricIcon}>
                <HardDrive color={connected ? COLORS.accent : COLORS.textMuted} size={15} />
              </View>
              <View>
                <Text style={styles.metricLabel}>Données restantes</Text>
                <Text style={styles.metricValue}>{connected ? formatDataFR(quotaMB) : "--"}</Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.honestWrap}>
          <View style={styles.honestRow}>
            <HardDrive color={COLORS.primaryLight} size={14} />
            <Text style={styles.honestText}>
              {mockLive
                ? "Bôjô offre un quota de 5 Go. L'agent connecté au serveur est un " +
                  "agent de TEST : aucun routeur réel ne pilote votre accès, les " +
                  "compteurs ne sont donc pas affichés."
                : "Bôjô offre un quota de 5 Go. Le comptage sera mesuré par le routeur " +
                  "(MikroTik) lors de la phase définitive — les compteurs ne sont pas " +
                  "encore actifs en mode provisoire."}
            </Text>
          </View>
        </View>
      )}

      {(networkHealth || lastSyncAt) && (
        <View style={styles.footer}>
          {providerLabel && <Text style={styles.providerLabel}>{providerLabel}</Text>}
          {networkHealth && (
            <View style={styles.footerRow}>
              <View style={[styles.miniDot, { backgroundColor: healthColor }]} />
              <Text numberOfLines={1} style={[styles.footerText, { color: healthColor }]}>
                {healthLabel}
              </Text>
            </View>
          )}
          {lastSyncAt && (
            <Text style={styles.syncText}>
              Dernière synchronisation : {new Date(lastSyncAt).toLocaleTimeString()}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8
  },
  statusText: {
    fontSize: 15,
    fontFamily: "Inter-Bold"
  },
  spacer: {
    flex: 1
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  chipText: {
    color: COLORS.primaryLight,
    fontSize: 10.5,
    fontFamily: "Inter-Bold"
  },
  percentRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 12
  },
  quotaType: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    marginTop: 4,
    fontFamily: "Inter-Regular"
  },
  percent: {
    color: COLORS.accentSoft,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: "Inter-Bold"
  },
  percentLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter-Regular"
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginTop: 12,
    marginBottom: 12
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  metric: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  metricDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 14
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  metricLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: "Inter-Regular"
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 13.5,
    marginTop: 2,
    fontFamily: "Inter-Bold"
  },
  footer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    gap: 4
  },
  providerLabel: {
    color: COLORS.primaryLight,
    fontSize: 11,
    fontFamily: "Inter-Bold",
    marginBottom: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  miniDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  footerText: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: "Inter-Regular"
  },
  syncText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter-Regular"
  },
  honestWrap: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 12
  },
  honestRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  honestText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: "Inter-Regular"
  }
});