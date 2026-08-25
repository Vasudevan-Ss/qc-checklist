import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import ResultBadge from "@/src/components/ResultBadge";

function Photo({ path }: { path: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    api.fileUrl(path).then(setUri);
  }, [path]);
  if (!uri) return null;
  return <Image source={{ uri }} style={styles.photo} contentFit="cover" />;
}

export default function InspectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [insp, setInsp] = useState<any>(null);

  useEffect(() => {
    api.get(`/inspections/${id}`).then(setInsp).catch(() => {});
  }, [id]);

  if (!insp) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Inspection" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={insp.product_name} subtitle={`BATCH ${insp.batch_number}`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={[styles.overall, { backgroundColor: insp.overall_result === "FAIL" ? colors.error : insp.overall_result === "PASS" ? colors.success : colors.warning }]}>
          <Text style={styles.overallLabel}>{insp.status === "submitted" ? "OVERALL RESULT" : "STATUS"}</Text>
          <Text style={styles.overallValue}>
            {insp.status === "submitted" ? insp.overall_result : "IN PROGRESS"}
          </Text>
        </View>

        <View style={styles.metaCard}>
          <Text style={styles.metaLine}>DATE: {insp.production_date} · {insp.shift}</Text>
          <Text style={styles.metaLine}>LINE: {insp.production_line || "—"} · MACHINE: {insp.machine || "—"}</Text>
          <Text style={styles.metaLine}>OPERATOR: {insp.operator || "—"}</Text>
          <Text style={styles.metaLine}>QC: {insp.qc_user_name}</Text>
          <Text style={styles.metaLine}>CHECKLIST v{insp.checklist_version}</Text>
        </View>

        {insp.ccp_readings?.length > 0 && (
          <>
            <Text style={styles.section}>CCP READINGS</Text>
            {insp.ccp_readings.map((r: any) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.rowTime}>{r.reading_time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{r.ccp_name}</Text>
                  <Text style={styles.rowDetail}>{r.actual_value} {r.unit}</Text>
                  {r.corrective_action?.corrective_action ? (
                    <Text style={styles.ca}>CA: {r.corrective_action.corrective_action}</Text>
                  ) : null}
                </View>
                <ResultBadge result={r.result} />
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>QUALITY CHECKS</Text>
        {(insp.results || []).map((r: any) => (
          <View key={r.item_id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{r.parameter_name}</Text>
              <Text style={styles.rowDetail}>
                {r.numeric_value != null ? `${r.numeric_value} ${r.unit || ""}` : r.value ?? "—"}
              </Text>
              {r.corrective_action?.corrective_action ? (
                <Text style={styles.ca}>CA: {r.corrective_action.corrective_action} ({r.corrective_action.status})</Text>
              ) : null}
              {r.photo_path ? <Photo path={r.photo_path} /> : null}
            </View>
            <ResultBadge result={r.result} />
          </View>
        ))}

        {!!insp.remarks && (
          <>
            <Text style={styles.section}>REMARKS</Text>
            <Text style={styles.remarks}>{insp.remarks}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overall: { padding: spacing.lg, borderWidth: 2, borderColor: colors.borderStrong },
  overallLabel: { fontFamily: font.mono, fontSize: type.sm, color: "rgba(255,255,255,0.85)", letterSpacing: 1 },
  overallValue: { fontFamily: font.display, fontSize: type["2xl"], color: "#fff", letterSpacing: 1 },
  metaCard: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginTop: spacing.md, gap: 4 },
  metaLine: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary },
  section: {
    fontFamily: font.mono, fontSize: type.sm, color: colors.muted, letterSpacing: 1.5,
    marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowTime: { fontFamily: font.mono, fontSize: type.base, color: colors.onSurface, width: 56 },
  rowName: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  rowDetail: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  ca: { fontFamily: font.text, fontSize: type.sm, color: colors.error, marginTop: 4 },
  photo: { width: 100, height: 100, marginTop: spacing.sm, borderWidth: 2, borderColor: colors.borderStrong },
  remarks: { fontFamily: font.text, fontSize: type.base, color: colors.onSurfaceSecondary },
});
