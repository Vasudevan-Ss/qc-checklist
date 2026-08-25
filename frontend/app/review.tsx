import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";
import ResultBadge from "@/src/components/ResultBadge";
import { useToast } from "@/src/context/Toast";

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [insp, setInsp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const data = await api.get(`/inspections/${id}`);
    setInsp(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Review" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  const checks: any[] = [
    ...(insp.results || []).map((r: any) => ({
      name: r.parameter_name,
      detail: r.numeric_value != null ? `${r.numeric_value} ${r.unit || ""}` : r.value,
      result: r.result,
    })),
    ...(insp.ccp_readings || []).map((r: any) => ({
      name: `${r.ccp_name} @ ${r.reading_time}`,
      detail: `${r.actual_value} ${r.unit || ""}`,
      result: r.result,
    })),
  ];
  const fails = checks.filter((c) => c.result === "FAIL");
  const passes = checks.filter((c) => c.result !== "FAIL");
  const overall = fails.length > 0 ? "FAIL" : "PASS";

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/inspections/${id}/submit`, { remarks });
      toast.show(`Inspection submitted · ${overall}`, overall === "FAIL" ? "error" : "success");
      router.replace("/dashboard");
    } catch (e: any) {
      toast.show(e.message || "Submit failed", "error");
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Review & Submit" subtitle={`BATCH ${insp.batch_number}`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <View style={[styles.overall, { backgroundColor: overall === "FAIL" ? colors.error : colors.success }]}>
          <Text style={styles.overallLabel}>OVERALL RESULT</Text>
          <Text style={styles.overallValue}>{overall}</Text>
          {overall === "FAIL" && <Text style={styles.overallSub}>Corrective action required</Text>}
        </View>

        <View style={styles.metaCard}>
          <Text style={styles.metaLine}>PRODUCT: {insp.product_name}</Text>
          <Text style={styles.metaLine}>BATCH: {insp.batch_number}</Text>
          <Text style={styles.metaLine}>DATE: {insp.production_date} · {insp.shift}</Text>
          <Text style={styles.metaLine}>QC: {insp.qc_user_name}</Text>
        </View>

        {fails.length > 0 && (
          <>
            <Text style={styles.section}>FAILURES ({fails.length})</Text>
            {fails.map((c, i) => (
              <View key={i} style={[styles.checkRow, styles.failRow]}>
                <Ionicons name="close-circle" size={20} color={colors.error} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkName}>{c.name}</Text>
                  {!!c.detail && <Text style={styles.checkDetail}>{c.detail}</Text>}
                </View>
                <ResultBadge result="FAIL" />
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>PASSED CHECKS ({passes.length})</Text>
        {passes.map((c, i) => (
          <View key={i} style={styles.checkRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.checkName}>{c.name}</Text>
              {!!c.detail && <Text style={styles.checkDetail}>{c.detail}</Text>}
            </View>
            <ResultBadge result={c.result} />
          </View>
        ))}

        <Text style={styles.section}>QC REMARKS</Text>
        <TextInput
          testID="review-remarks-input"
          style={styles.remarks}
          multiline
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Final remarks (optional)"
          placeholderTextColor={colors.muted}
        />
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="submit-inspection-button"
          title={submitting ? "" : "SUBMIT INSPECTION"}
          onPress={submit}
          loading={submitting}
          variant={overall === "FAIL" ? "danger" : "primary"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overall: { padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  overallLabel: { fontFamily: font.mono, fontSize: type.sm, color: "rgba(255,255,255,0.85)", letterSpacing: 1 },
  overallValue: { fontFamily: font.display, fontSize: type["3xl"], color: "#fff", letterSpacing: 2 },
  overallSub: { fontFamily: font.text, fontSize: type.base, color: "#fff", marginTop: 2 },
  metaCard: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginTop: spacing.md, gap: 4 },
  metaLine: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary },
  section: {
    fontFamily: font.mono,
    fontSize: type.sm,
    color: colors.muted,
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  failRow: { backgroundColor: "#FEF2F2", paddingHorizontal: spacing.sm },
  checkName: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  checkDetail: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  remarks: {
    minHeight: 80,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    fontFamily: font.text,
    fontSize: type.base,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
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
