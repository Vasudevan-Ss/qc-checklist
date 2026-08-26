import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import ResultBadge from "@/src/components/ResultBadge";
import AppButton from "@/src/components/AppButton";
import { useToast } from "@/src/context/Toast";

const BACKEND = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function shift(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Report() {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(todayStr());
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; filename: string; photos: number } | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const r = await api.get(`/reports/daily?date=${d}`);
      setReport(r);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPdf(null);
    load(date);
  }, [date, load]);

  const buildText = () => {
    if (!report) return "";
    const q = report.qc_summary;
    const c = report.ccp_summary;
    const p = report.production_summary;
    let t = `QC INSPECT — DAILY QC REPORT\n${report.header.department}\nDate: ${report.header.date}\n\n`;
    t += `PRODUCTION\nProducts: ${p.products_inspected} | Batches: ${p.batches_inspected} | Inspections: ${p.total_inspections}\n\n`;
    t += `QC SUMMARY\nPassed: ${q.passed} | Failed: ${q.failed} | Pending: ${q.pending}\n\n`;
    t += `CCP SUMMARY\nMonitored: ${c.monitored} | Passed: ${c.passed} | Failed: ${c.failed}\n\n`;
    t += `PRODUCTS\n`;
    report.product_summary.forEach((ps: any) => {
      t += `- ${ps.product} [${ps.batch}] ${ps.result}${ps.findings.length ? " — " + ps.findings.join("; ") : ""}\n`;
    });
    if (report.nonconformance_summary.length) {
      t += `\nNON-CONFORMANCES\n`;
      report.nonconformance_summary.forEach((n: any) => {
        t += `- ${n.product} [${n.batch}]: ${n.issue} → ${n.corrective_action || "—"} (${n.status})\n`;
      });
    }
    t += `\nPrepared by: ${report.prepared_by}`;
    return t;
  };

  const onShare = async () => {
    try {
      await Share.share({ message: buildText() });
    } catch {
      toast.show("Could not share report", "error");
    }
  };

  const openPdf = async (url: string) => {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
  };

  const onExportPdf = async () => {
    setExporting(true);
    try {
      const r = await api.post(`/reports/daily/pdf?date=${date}`);
      const url = `${BACKEND}${r.share_path}`;
      setPdf({ url, filename: r.filename, photos: r.photo_count });
      toast.show("PDF sign-off sheet ready", "success");
      await openPdf(url);
    } catch (e: any) {
      toast.show(e?.message || "Could not generate PDF", "error");
    } finally {
      setExporting(false);
    }
  };

  const onSharePdfLink = async () => {
    if (!pdf) return;
    try {
      await Share.share({
        title: pdf.filename,
        message: `Daily QC Report — ${date}\n${pdf.url}`,
        url: pdf.url,
      });
    } catch {
      toast.show("Could not share link", "error");
    }
  };

  const Stat = ({ label, value, color }: any) => (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Daily QC Report"
        right={
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable testID="export-pdf-icon" onPress={onExportPdf} hitSlop={10} disabled={exporting}>
              <Ionicons
                name="document-text-outline"
                size={22}
                color={exporting ? colors.muted : colors.onSurface}
              />
            </Pressable>
            <Pressable testID="share-report-button" onPress={onShare} hitSlop={10}>
              <Ionicons name="share-outline" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
        }
      />

      <View style={styles.dateNav}>
        <Pressable testID="date-prev" onPress={() => setDate(shift(date, -1))} style={styles.dateBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.dateText}>{date}</Text>
        <Pressable
          testID="date-next"
          onPress={() => setDate(shift(date, 1))}
          style={[styles.dateBtn, date >= todayStr() && { opacity: 0.3 }]}
          disabled={date >= todayStr()}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !report ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No data for this date</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <Text style={styles.section}>PRODUCTION SUMMARY</Text>
          <View style={styles.statRow}>
            <Stat label="PRODUCTS" value={report.production_summary.products_inspected} />
            <Stat label="BATCHES" value={report.production_summary.batches_inspected} />
            <Stat label="INSPECTIONS" value={report.production_summary.total_inspections} />
          </View>

          <Text style={styles.section}>QC SUMMARY</Text>
          <View style={styles.statRow}>
            <Stat label="PASSED" value={report.qc_summary.passed} color={colors.success} />
            <Stat label="FAILED" value={report.qc_summary.failed} color={colors.error} />
            <Stat label="PENDING" value={report.qc_summary.pending} color={colors.warning} />
          </View>

          <Text style={styles.section}>CCP SUMMARY</Text>
          <View style={styles.statRow}>
            <Stat label="MONITORED" value={report.ccp_summary.monitored} />
            <Stat label="PASSED" value={report.ccp_summary.passed} color={colors.success} />
            <Stat label="FAILED" value={report.ccp_summary.failed} color={colors.error} />
          </View>

          <Text style={styles.section}>PRODUCTS ({report.product_summary.length})</Text>
          {report.product_summary.map((ps: any, i: number) => (
            <Pressable
              key={i}
              style={styles.prodRow}
              onPress={() => router.push(`/inspection-detail?id=${ps.inspection_id}` as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.prodName}>{ps.product}</Text>
                <Text style={styles.prodMeta}>{ps.batch} · {ps.shift}</Text>
                {ps.findings.length > 0 && (
                  <Text style={styles.finding}>{ps.findings.join("; ")}</Text>
                )}
              </View>
              <ResultBadge result={ps.result} />
            </Pressable>
          ))}

          {report.nonconformance_summary.length > 0 && (
            <>
              <Text style={styles.section}>NON-CONFORMANCES ({report.nonconformance_summary.length})</Text>
              {report.nonconformance_summary.map((n: any, i: number) => (
                <View key={i} style={styles.ncRow}>
                  <Text style={styles.ncIssue}>{n.issue}</Text>
                  <Text style={styles.ncMeta}>{n.product} · {n.batch}</Text>
                  <Text style={styles.ncAction}>{n.corrective_action || "No action recorded"}</Text>
                  <View style={styles.ncStatus}>
                    <Text style={styles.ncStatusText}>{n.status}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <AppButton
              testID="export-pdf-button"
              title={exporting ? "GENERATING PDF…" : "EXPORT PDF SIGN-OFF SHEET"}
              onPress={onExportPdf}
              disabled={exporting}
            />
            {pdf && (
              <View testID="pdf-ready-card" style={styles.pdfCard}>
                <View style={styles.pdfHead}>
                  <Ionicons name="document-text-outline" size={18} color={colors.onSurface} />
                  <Text style={styles.pdfName} numberOfLines={1}>{pdf.filename}</Text>
                </View>
                <Text style={styles.pdfMeta}>
                  All CCPs, parameter checks and {pdf.photos} photo{pdf.photos === 1 ? "" : "s"} included · link valid 30 days
                </Text>
                <Text style={styles.pdfLink} numberOfLines={2}>{pdf.url}</Text>
                <View style={styles.pdfActions}>
                  <View style={{ flex: 1 }}>
                    <AppButton testID="open-pdf-button" title="OPEN / DOWNLOAD" onPress={() => openPdf(pdf.url)} variant="secondary" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton testID="share-pdf-link-button" title="SHARE LINK" onPress={onSharePdfLink} variant="secondary" />
                  </View>
                </View>
              </View>
            )}
            <AppButton testID="share-report-cta" title="SHARE TEXT SUMMARY" onPress={onShare} variant="outline" />
          </View>
          <Text style={styles.prepared}>Prepared by {report.prepared_by}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing["3xl"] },
  empty: { fontFamily: font.text, fontSize: type.base, color: colors.muted },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  dateBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.borderStrong },
  dateText: { fontFamily: font.mono, fontSize: type.lg, color: colors.onSurface },
  section: {
    fontFamily: font.mono, fontSize: type.sm, color: colors.muted, letterSpacing: 1.5,
    marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  statRow: { flexDirection: "row", gap: spacing.md },
  statBox: { flex: 1, borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, alignItems: "center" },
  statValue: { fontFamily: font.mono, fontSize: type["2xl"], color: colors.onSurface },
  statLabel: { fontFamily: font.mono, fontSize: 10, color: colors.muted, letterSpacing: 1, marginTop: 4 },
  prodRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.sm,
  },
  prodName: { fontFamily: font.display, fontSize: type.base, color: colors.onSurface },
  prodMeta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  finding: { fontFamily: font.text, fontSize: type.sm, color: colors.error, marginTop: 4 },
  ncRow: { borderWidth: 2, borderColor: colors.error, padding: spacing.md, marginBottom: spacing.sm, gap: 2 },
  ncIssue: { fontFamily: font.display, fontSize: type.base, color: colors.onSurface },
  ncMeta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted },
  ncAction: { fontFamily: font.text, fontSize: type.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  ncStatus: { alignSelf: "flex-start", backgroundColor: colors.warning, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  ncStatusText: { fontFamily: font.mono, fontSize: type.sm, color: "#fff", letterSpacing: 1 },
  prepared: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, textAlign: "center", marginTop: spacing.md },
  pdfCard: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, gap: spacing.xs },
  pdfHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pdfName: { flex: 1, fontFamily: font.display, fontSize: type.base, color: colors.onSurface },
  pdfMeta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted },
  pdfLink: { fontFamily: font.mono, fontSize: 10, color: colors.brand },
  pdfActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
});
