import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

interface Product {
  id: string;
  product_code: string;
  product_name: string;
  category: string;
  standard_weight?: number;
}

export default function Products() {
  const router = useRouter();
  const { browse } = useLocalSearchParams<{ browse?: string }>();
  const isBrowse = browse === "1";
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await api.get<Product[]>(`/products${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const onSelect = (p: Product) => {
    if (isBrowse) router.push(`/product-detail?id=${p.id}` as any);
    else router.push(`/batch?productId=${p.id}` as any);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={isBrowse ? "Product Master" : "Select Product"}
        subtitle={isBrowse ? "Tap a product to view specifications" : "Tap a product to start inspection"}
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="product-search-input"
          style={styles.search}
          placeholder="Search product, code or category"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: spacing["2xl"] }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No products found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`product-row-${item.product_code}`}
              style={styles.row}
              onPress={() => onSelect(item)}
            >
              <View style={styles.thumb}>
                <Ionicons name="cube" size={24} color={colors.onSurfaceInverse} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.product_name}</Text>
                <Text style={styles.meta}>
                  {item.product_code} · {item.category}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 52,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  search: { flex: 1, fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  center: { padding: spacing["3xl"], alignItems: "center" },
  empty: { fontFamily: font.text, fontSize: type.base, color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 72,
  },
  thumb: {
    width: 48,
    height: 48,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface },
  meta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
});
