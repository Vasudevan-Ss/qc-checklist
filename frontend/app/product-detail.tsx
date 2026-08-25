import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([
          api.get(`/products/${id}`),
          api.get(`/products/${id}/checklist`).catch(() => null),
        ]);
        setProduct(p);
        setChecklist(c);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Product" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  const rows: [string, any][] = [
    ["Product Code", product.product_code],
    ["Category", product.category],
    ["Standard Weight", product.standard_weight ? `${product.standard_weight} g` : "—"],
    ["Weight Tolerance", product.weight_tolerance ? `±${product.weight_tolerance} g` : "—"],
    ["Dimensions", product.standard_dimensions || "—"],
    ["Shelf Life", product.shelf_life || "—"],
    ["Storage", product.storage_condition || "—"],
    ["Packaging", product.packaging_type || "—"],
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title={product.product_name} subtitle={product.product_code} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {!!product.description && <Text style={styles.desc}>{product.description}</Text>}

        <Text style={styles.section}>SPECIFICATIONS</Text>
        <View style={styles.card}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.specRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.specKey}>{k}</Text>
              <Text style={styles.specVal}>{String(v)}</Text>
            </View>
          ))}
        </View>

        {checklist && (
          <>
            <Text style={styles.section}>
              QC CHECKLIST · v{checklist.template?.version} · {checklist.items?.length} PARAMETERS
            </Text>
            <View style={styles.card}>
              {checklist.ccps?.map((c: any) => (
                <View key={c.id} style={styles.specRow}>
                  <Text style={styles.specKey}>{c.ccp_number} · {c.name}</Text>
                  <Text style={styles.specVal}>
                    {c.critical_limit_min ?? ""}
                    {c.critical_limit_max != null ? `–${c.critical_limit_max}` : "+"} {c.unit}
                  </Text>
                </View>
              ))}
              {checklist.items?.map((it: any, i: number) => (
                <View
                  key={it.id}
                  style={[styles.specRow, i === checklist.items.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <Text style={styles.specKey}>{it.parameter_name}</Text>
                  <Text style={styles.specVal}>
                    {it.parameter_type === "numeric"
                      ? `${it.minimum_value ?? ""}–${it.maximum_value ?? ""} ${it.unit || ""}`
                      : it.parameter_type}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="start-from-detail-button"
          title="START INSPECTION"
          onPress={() => router.push(`/batch?productId=${id}` as any)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  desc: { fontFamily: font.text, fontSize: type.base, color: colors.onSurfaceSecondary, marginBottom: spacing.md },
  section: {
    fontFamily: font.mono,
    fontSize: type.sm,
    color: colors.muted,
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  card: { borderWidth: 2, borderColor: colors.borderStrong },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  specKey: { fontFamily: font.text, fontSize: type.base, color: colors.onSurfaceSecondary, flex: 1 },
  specVal: { fontFamily: font.mono, fontSize: type.base, color: colors.onSurface, textAlign: "right" },
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
