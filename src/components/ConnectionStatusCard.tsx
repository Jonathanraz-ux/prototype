import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Clock, HardDrive, Sparkles } from "lucide-react-native";
import { COLORS } from "../constants/theme";

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
}

export default function ConnectionStatusCard({
  connected,
  connecting = false,
  percent,
  timeMinutes,
  quotaMB
}: ConnectionStatusCardProps) {
  const statusColor = connected ? COLORS.success : connecting ? COLORS.warning : COLORS.textMuted;
  const statusLabel = connected ? "Internet actif" : connecting ? "Connexion en cours" : "Internet coupé";

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

      <View style={styles.percentRow}>
        <Text style={styles.percent}>{Math.round(percent)}%</Text>
        <Text style={styles.percentLabel}>de quota restant</Text>
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(24, 24, 27, 0.72)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
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
    backgroundColor: "rgba(249, 115, 22, 0.14)"
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
    backgroundColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "rgba(255,255,255,0.07)",
    marginHorizontal: 14
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)"
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
  }
});
