import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import ResultBadge from "@/src/components/ResultBadge";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "PASS", label: "Passed" },
  { key: "FAIL", label: "Failed" },
  { key: "in_progress", label: "In Progress" },
];

export default function History() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: string[] = [];
      if (date) params.push(`date=${date}`);
      if (filter === "PASS" || filter === "FAIL") params.push(`result=${filter}`);
      if (filter === "in_progress") params.push(`status=in_progress`);
      const data = await api.get(`/inspections${params.length ? `?${params.join("&")}` : ""}`);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [date, filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title={date ? "Today's Inspections" : "History"} subtitle={date || "All records"} />

      <View style={styles.chipRowWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f.key}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          renderItem={({ item: f }) => {
            const active = filter === f.key;
            return (
              <Pressable
                testID={`filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No inspections found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`inspection-${item.batch_number}`}
              style={styles.card}
              onPress={() => router.push(`/inspection-detail?id=${item.id}` as any)}
            >
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.product_name}</Text>
                  <Text style={styles.cardMeta}>
                    {item.batch_number} · {item.production_date}
                  </Text>
                </View>
                <ResultBadge result={item.status === "in_progress" ? "PENDING" : item.overall_result} />
              </View>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{item.total_checks} CHECKS</Text>
                <Text style={[styles.stat, { color: colors.success }]}>{item.passed_checks} PASS</Text>
                <Text style={[styles.stat, { color: colors.error }]}>{item.failed_checks} FAIL</Text>
                <Text style={styles.stat}>{item.shift}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  chipRowWrap: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
  },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brand },
  chipText: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  chipTextActive: { color: "#fff" },
  center: { padding: spacing["3xl"], alignItems: "center" },
  empty: { fontFamily: font.text, fontSize: type.base, color: colors.muted },
  card: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, gap: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardTitle: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface },
  cardMeta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  stat: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary },
});
