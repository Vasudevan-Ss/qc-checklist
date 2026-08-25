import React, { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import AppButton from "@/src/components/AppButton";

interface Stats {
  date: string;
  inspections_completed: number;
  inspections_in_progress: number;
  products_inspected: number;
  total_checks: number;
  passed_inspections: number;
  failed_inspections: number;
  open_corrective_actions: number;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const METRICS: { key: keyof Stats; label: string; color: string }[] = [
  { key: "inspections_completed", label: "COMPLETED", color: colors.onSurface },
  { key: "products_inspected", label: "PRODUCTS", color: colors.onSurface },
  { key: "passed_inspections", label: "PASSED", color: colors.success },
  { key: "failed_inspections", label: "FAILED", color: colors.error },
  { key: "total_checks", label: "CHECKS", color: colors.onSurface },
  { key: "open_corrective_actions", label: "OPEN ACTIONS", color: colors.warning },
];

export default function Dashboard() {
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.get<Stats>(`/dashboard/stats?date=${todayStr()}`);
      setStats(s);
    } catch {
      // ignore, show zeros
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const quickActions = [
    { label: "Today's Inspections", icon: "today-outline", to: `/history?date=${todayStr()}` },
    { label: "Daily Report", icon: "document-text-outline", to: "/report" },
    { label: "Product Master", icon: "cube-outline", to: "/products?browse=1" },
    { label: "History", icon: "time-outline", to: "/history" },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View>
          <Text style={styles.hello}>QC INSPECT</Text>
          <Text style={styles.date}>
            {new Date().toDateString().toUpperCase()}
          </Text>
        </View>
        <Pressable testID="logout-button" onPress={logout} style={styles.logoutBtn} hitSlop={10}>
          <Ionicons name="log-out-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userRole}>
              {isAdmin ? "QC MANAGER / ADMIN" : "QC EXECUTIVE"} · {user?.department}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>TODAY'S SUMMARY</Text>
        <View style={styles.grid}>
          {METRICS.map((m) => (
            <View key={m.key} testID={`metric-${m.key}`} style={styles.metricCard}>
              <Text style={[styles.metricValue, { color: m.color }]}>
                {stats ? (stats[m.key] as number) : "—"}
              </Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.actionList}>
          {quickActions.map((a) => (
            <Pressable
              key={a.label}
              testID={`quick-${a.label.replace(/[^a-z]/gi, "-").toLowerCase()}`}
              style={styles.actionRow}
              onPress={() => router.push(a.to as any)}
            >
              <Ionicons name={a.icon as any} size={22} color={colors.onSurface} />
              <Text style={styles.actionText}>{a.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="start-inspection-button"
          title="＋  START NEW INSPECTION"
          onPress={() => router.push("/products")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
  },
  hello: { fontFamily: font.display, fontSize: type.xl, color: colors.onSurface, letterSpacing: 1 },
  date: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  logoutBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  avatar: {
    width: 46,
    height: 46,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontFamily: font.display, fontSize: type.xl },
  userName: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface },
  userRole: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  sectionLabel: {
    fontFamily: font.mono,
    fontSize: type.sm,
    color: colors.muted,
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricCard: {
    width: "47%",
    flexGrow: 1,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    minHeight: 84,
    justifyContent: "space-between",
    backgroundColor: colors.surface,
  },
  metricValue: { fontFamily: font.mono, fontSize: type["3xl"] },
  metricLabel: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, letterSpacing: 1 },
  actionList: { borderWidth: 2, borderColor: colors.borderStrong },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 60,
  },
  actionText: { flex: 1, fontFamily: font.text, fontSize: type.lg, color: colors.onSurface },
  ctaBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
