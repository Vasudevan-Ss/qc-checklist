import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";

export default function AdminProducts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/products?include_inactive=1`);
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Manage Products" subtitle="Create & edit products and checklists" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No products yet. Add your first product.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.product_name}</Text>
                  <Text style={styles.meta}>
                    {item.product_code} · {item.category || "—"}
                    {item.active ? "" : " · INACTIVE"}
                  </Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  testID={`edit-product-${item.product_code}`}
                  style={styles.actionBtn}
                  onPress={() => router.push(`/admin/product-form?id=${item.id}` as any)}
                >
                  <Ionicons name="create-outline" size={18} color={colors.onSurface} />
                  <Text style={styles.actionBtnText}>EDIT</Text>
                </Pressable>
                <Pressable
                  testID={`build-checklist-${item.product_code}`}
                  style={[styles.actionBtn, styles.actionBtnDark]}
                  onPress={() => router.push(`/admin/checklist-builder?productId=${item.id}` as any)}
                >
                  <Ionicons name="list-outline" size={18} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>CHECKLIST</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="add-product-button"
          title="＋  ADD PRODUCT"
          onPress={() => router.push("/admin/product-form" as any)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { padding: spacing["3xl"], alignItems: "center" },
  empty: { fontFamily: font.text, fontSize: type.base, color: colors.muted, textAlign: "center" },
  card: { borderWidth: 2, borderColor: colors.borderStrong },
  cardHead: { padding: spacing.md },
  name: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface },
  meta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  cardActions: { flexDirection: "row", borderTopWidth: 2, borderTopColor: colors.borderStrong },
  actionBtn: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRightWidth: 2,
    borderRightColor: colors.borderStrong,
  },
  actionBtnDark: { backgroundColor: colors.brand, borderRightWidth: 0 },
  actionBtnText: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurface, letterSpacing: 1 },
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
