import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type, SHIFTS } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";
import { useToast } from "@/src/context/Toast";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Batch() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [product, setProduct] = useState<any>(null);
  const [batch, setBatch] = useState("");
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState(SHIFTS[0]);
  const [line, setLine] = useState("");
  const [machine, setMachine] = useState("");
  const [operator, setOperator] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/products/${productId}`).then(setProduct).catch(() => {});
  }, [productId]);

  const start = async () => {
    if (!batch.trim()) {
      toast.show("Batch number is required", "error");
      return;
    }
    setSubmitting(true);
    try {
      const insp = await api.post("/inspections", {
        product_id: productId,
        batch_number: batch.trim(),
        production_date: date,
        shift,
        production_line: line,
        machine,
        operator,
      });
      router.replace(`/inspection?id=${insp.id}` as any);
    } catch (e: any) {
      toast.show(e.message || "Could not start inspection", "error");
      setSubmitting(false);
    }
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    testID,
  }: any) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Batch Details"
        subtitle={product ? `${product.product_name} · ${product.product_code}` : undefined}
      />
      <KeyboardAwareScrollView
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
      >
        <View style={styles.field}>
          <Text style={styles.label}>BATCH NUMBER *</Text>
          <TextInput
            testID="batch-number-input"
            style={styles.input}
            value={batch}
            onChangeText={setBatch}
            autoCapitalize="characters"
            placeholder="e.g. HC250825-01"
            placeholderTextColor={colors.muted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>PRODUCTION DATE</Text>
          <TextInput
            testID="production-date-input"
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>SHIFT</Text>
          <View style={styles.shiftRow}>
            {SHIFTS.map((s) => {
              const active = s === shift;
              return (
                <Pressable
                  key={s}
                  testID={`shift-${s.toLowerCase()}`}
                  onPress={() => setShift(s)}
                  style={[styles.shiftChip, active && styles.shiftChipActive]}
                >
                  <Text style={[styles.shiftText, active && styles.shiftTextActive]}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field label="PRODUCTION LINE" value={line} onChange={setLine} placeholder="e.g. Line 2" testID="line-input" />
        <Field label="OVEN / MACHINE" value={machine} onChange={setMachine} placeholder="e.g. Oven A" testID="machine-input" />
        <Field label="OPERATOR" value={operator} onChange={setOperator} placeholder="Operator name" testID="operator-input" />
      </KeyboardAwareScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="start-checklist-button"
          title={submitting ? "" : "START CHECKLIST"}
          onPress={start}
          loading={submitting}
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
  shiftRow: { flexDirection: "row", gap: spacing.sm },
  shiftChip: {
    flex: 1,
    height: 52,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftChipActive: { backgroundColor: colors.brand },
  shiftText: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  shiftTextActive: { color: colors.onSurfaceInverse },
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
