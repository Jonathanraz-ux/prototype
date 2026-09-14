import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, RefreshCw, ServerCog, CheckCircle, XCircle } from "lucide-react-native";
import { COLORS } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { callFunction } from "../../lib/functions";
import { logger } from "../../lib/logger";
import { formatDataFR } from "../../components/ConnectionStatusCard";

const TAG = "admin";

interface AllocationRow {
  allocation_id: string;
  user_email?: string;
  site_id: string;
  quota_bytes: number;
  consumed_bytes: number;
  remaining_bytes: number;
  status: string;
  exhausted_at?: string | null;
  created_at?: string;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  status: string;
  ad_state?: string;
  authorization_state?: string;
  last_heartbeat_at?: string | null;
  bytes_total?: number;
  disconnect_reason?: string | null;
  router_session_reference?: string | null;
  device_observed_ip?: string | null;
  device_observed_mac?: string | null;
}

interface RouterRow {
  id: string;
  name?: string;
  model?: string;
  adapter_type?: string;
  status: string;
  last_seen_at?: string | null;
}

interface AgentRow {
  id: string;
  name?: string;
  status: string;
  site_id?: string;
  last_seen_at?: string | null;
}

export interface AdminOverview {
  site_id?: string | null;
  allocations?: AllocationRow[];
  sessions?: SessionRow[];
  events?: Array<{ id: string; event_type: string; severity?: string; created_at?: string; metadata?: unknown }>;
  commands?: Array<{ id: string; type: string; status: string; created_at?: string; error_message?: string | null }>;
  agents?: AgentRow[];
  routers?: RouterRow[];
}

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, isSiteManager } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await callFunction<AdminOverview>("admin-overview", {});
    if (!res.ok) {
      setError(res.error.code === "forbidden" ? "Accès réservé au rôle administrateur." : res.error.message);
      setLoading(false);
      return;
    }
    setError(null);
    setOverview(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const resetAllocation = async (allocationId: string) => {
    setResetting(allocationId);
    try {
      const res = await callFunction<{ ok: boolean }>("admin-reset-allocation", {
        allocation_id: allocationId,
      });
      if (!res.ok) {
        logger.warn(TAG, "reset refusé", res.error.code);
      }
    } catch (e) {
      logger.warn(TAG, "reset impossible", e);
    } finally {
      setResetting(null);
      await load();
    }
  };

  const sessions = overview?.sessions ?? [];
  const allocations = overview?.allocations ?? [];
  const agents = overview?.agents ?? [];
  const routers = overview?.routers ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft color={COLORS.textSecondary} size={20} />
        </Pressable>
        <Text style={styles.headerTitle}>Administration</Text>
        <Pressable onPress={handleRefresh} hitSlop={12} disabled={refreshing}>
          <RefreshCw color={COLORS.textSecondary} size={18} />
        </Pressable>
      </View>

      {isAdmin || isSiteManager ? (
        loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={COLORS.primaryLight} />
          </View>
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.body}>
                <Section title="Agents locaux" count={agents.length}>
                  {agents.length === 0 ? <Empty text="Aucun agent local" /> : (
                    <View style={styles.card}>
                      {agents.map((a) => (
                        <Row key={a.id} title={a.name ?? a.id} value={`${a.status} · ${fmtAgo(a.last_seen_at)}`} ok={a.status === "online"} />
                      ))}
                    </View>
                  )}
                </Section>

                <Section title="Routeurs" count={routers.length}>
                  {routers.length === 0 ? <Empty text="Aucun routeur" /> : (
                    <View style={styles.card}>
                      {routers.map((r) => (
                        <Row key={r.id} title={r.name ?? r.id} value={`${r.status} · ${fmtAgo(r.last_seen_at)}`} ok={r.status === "active"} />
                      ))}
                    </View>
                  )}
                </Section>

                <Section title="Sessions actives" count={sessions.filter((s) => ["authorized", "active", "paused", "authorizing", "pending"].includes(s.status)).length}>
                  {sessions.length === 0 ? <Empty text="Aucune session" /> : (
                    <View style={styles.card}>
                      {sessions.slice(0, 20).map((s) => (
                        <View key={s.session_id} style={styles.sessionRow}>
                          <View style={styles.sessionTop}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {s.device_observed_ip ?? s.router_session_reference ?? s.session_id}
                            </Text>
                            <Text style={styles.rowValue} numberOfLines={1}>
                              {s.status}
                            </Text>
                          </View>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {s.bytes_total ? `${formatDataFR(Math.round(s.bytes_total / (1024 * 1024)))}` : "0 Mo"} · autorisation {s.authorization_state ?? "none"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Section>

                <Section title="Allocations (quota 5 Go)" count={allocations.length}>
                  {allocations.length === 0 ? <Empty text="Aucune allocation" /> : (
                    <View style={styles.card}>
                      {allocations.map((a) => {
                        const consumedPct = a.quota_bytes > 0 ? Math.min(1, a.consumed_bytes / a.quota_bytes) : 0;
                        return (
                          <View key={a.allocation_id} style={styles.sessionRow}>
                            <View style={styles.sessionTop}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {a.user_email ?? "utilisateur"}
                              </Text>
                              <Text style={styles.rowValue} numberOfLines={1}>
                                {Math.round(consumedPct * 100)}%
                              </Text>
                            </View>
                            <View style={styles.bar}>
                              <View style={[styles.barFill, { width: `${Math.round(consumedPct * 100)}%` }]} />
                            </View>
                            <Text style={styles.rowSubtitle} numberOfLines={1}>
                              {formatDataFR(Math.round(a.remaining_bytes / (1024 * 1024)))} restant · {formatDataFR(Math.round(a.consumed_bytes / (1024 * 1024)))} consommé
                            </Text>
                            {a.status === "exhausted" && (
                              <Pressable
                                onPress={() => void resetAllocation(a.allocation_id)}
                                disabled={resetting === a.allocation_id}
                                style={styles.alertButton}
                              >
                                {resetting === a.allocation_id ? (
                                  <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                  <Text style={styles.alertButtonText}>Réinitialiser (admin)</Text>
                                )}
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </Section>
              </View>
            </ScrollView>
          )
      ) : (
        <View style={styles.empty}>
          <ServerCog color={COLORS.textMuted} size={28} />
          <Text style={styles.errorText}>Accès réservé au rôle administrateur.</Text>
        </View>
      )}
    </View>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title} · {count}</Text>
      {children}
    </View>
  );
}

function Row({ title, value, ok }: { title: string; value: string; ok: boolean }) {
  return (
    <View style={styles.sessionRow}>
      <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
      <Text style={[styles.rowValue, { color: ok ? COLORS.success : COLORS.danger }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

function fmtAgo(iso?: string | null): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}min`;
  return `il y a ${Math.floor(m / 60)}h`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)"
  },
  headerTitle: { flex: 1, color: "#FFFFFF", fontSize: 18, fontFamily: "Inter-Bold" },
  body: { paddingHorizontal: 20, paddingTop: 18, gap: 22 },
  section: { gap: 8 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontFamily: "Inter-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  card: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 16, paddingVertical: 6 },
  sessionRow: { paddingVertical: 10, gap: 6 },
  rowTitle: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter-Regular" },
  rowValue: { color: COLORS.textSecondary, fontSize: 12.5, fontFamily: "Inter-Regular" },
  rowSubtitle: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter-Regular" },
  sessionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  bar: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: COLORS.accentSoft },
  alertButton: {
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    marginTop: 6
  },
  alertButtonText: { color: COLORS.danger, fontSize: 13, fontFamily: "Inter-Bold" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter-Regular", textAlign: "center" },
  errorText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: "Inter-Regular", textAlign: "center" }
});