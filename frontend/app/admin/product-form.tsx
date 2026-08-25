import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";
import { useToast } from "@/src/context/Toast";

const FIELDS: { key: string; label: string; numeric?: boolean; placeholder?: string }[] = [
  { key: "product_code", label: "PRODUCT CODE *", placeholder: "e.g. HC-500" },
  { key: "product_name", label: "PRODUCT NAME *", placeholder: "e.g. Honey Cake" },
  { key: "category", label: "CATEGORY", placeholder: "e.g. Cakes" },
  { key: "description", label: "DESCRIPTION", placeholder: "Short description" },
  { key: "standard_weight", label: "STANDARD WEIGHT (g)", numeric: true, placeholder: "500" },
  { key: "weight_tolerance", label: "WEIGHT TOLERANCE (±g)", numeric: true, placeholder: "10" },
  { key: "standard_dimensions", label: "STANDARD DIMENSIONS", placeholder: "180 x 90 x 45 mm" },
  { key: "shelf_life", label: "SHELF LIFE", placeholder: "7 days" },
  { key: "storage_condition", label: "STORAGE CONDITION", placeholder: "Ambient, dry" },
  { key: "packaging_type", label: "PACKAGING TYPE", placeholder: "Flow wrap" },
];

export default function ProductForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      api.get(`/products/${id}`).then((p) => {
        const f: Record<string, string> = {};
        FIELDS.forEach((fl) => {
          f[fl.key] = p[fl.key] != null ? String(p[fl.key]) : "";
        });
        setForm(f);
        setActive(p.active !== false);
      });
    }
  }, [id]);

  const setField = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.product_code?.trim() || !form.product_name?.trim()) {
      toast.show("Product code and name are required", "error");
      return;
    }
    const payload: any = { active };
    FIELDS.forEach((fl) => {
      const val = form[fl.key];
      if (fl.numeric) payload[fl.key] = val ? parseFloat(val) : null;
      else payload[fl.key] = val || null;
    });
    payload.product_code = form.product_code.trim();
    payload.product_name = form.product_name.trim();

    setSaving(true);
    try {
      if (isEdit) await api.put(`/products/${id}`, payload);
      else await api.post(`/products`, payload);
      toast.show(isEdit ? "Product updated" : "Product created", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Save failed", "error");
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={isEdit ? "Edit Product" : "New Product"} />
      <KeyboardAwareScrollView
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
      >
        {FIELDS.map((fl) => (
          <View key={fl.key} style={styles.field}>
            <Text style={styles.label}>{fl.label}</Text>
            <TextInput
              testID={`field-${fl.key}`}
              style={styles.input}
              value={form[fl.key] || ""}
              onChangeText={(t) => setField(fl.key, t)}
              placeholder={fl.placeholder}
              placeholderTextColor={colors.muted}
              keyboardType={fl.numeric ? "numeric" : "default"}
            />
          </View>
        ))}

        <Pressable
          testID="toggle-active"
          style={styles.toggleRow}
          onPress={() => setActive((a) => !a)}
        >
          <View style={[styles.checkbox, active && styles.checkboxOn]}>
            {active && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <Text style={styles.toggleText}>Active (available for inspection)</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="save-product-button"
          title={saving ? "" : isEdit ? "SAVE CHANGES" : "CREATE PRODUCT"}
          onPress={save}
          loading={saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  field: { gap: 6 },
  label: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary, letterSpacing: 1 },
  input: {
    height: 56,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    fontFamily: font.text,
    fontSize: type.lg,
    color: colors.onSurface,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.brand },
  toggleText: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
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
