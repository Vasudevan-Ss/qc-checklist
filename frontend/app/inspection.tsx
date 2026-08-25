import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";
import PhotoField from "@/src/components/PhotoField";
import ResultBadge from "@/src/components/ResultBadge";
import { useToast } from "@/src/context/Toast";

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface ResultState {
  value?: any;
  numeric_value?: number | null;
  result?: string | null;
  remarks?: string;
  photo_path?: string | null;
  corrective_action?: any;
}

// ---------- Corrective Action inline block ----------
function CorrectiveBlock({
  value,
  onChange,
}: {
  value: any;
  onChange: (ca: any) => void;
}) {
  const ca = value || { status: "Open" };
  return (
    <View style={s.caBox}>
      <View style={s.caHeaderRow}>
        <Ionicons name="warning" size={18} color="#fff" />
        <Text style={s.caHeader}>CORRECTIVE ACTION REQUIRED</Text>
      </View>
      <Text style={s.caLabel}>ACTION TAKEN</Text>
      <TextInput
        testID="ca-action-input"
        style={s.caInput}
        multiline
        value={ca.corrective_action || ""}
        onChangeText={(t) => onChange({ ...ca, corrective_action: t })}
        placeholder="e.g. Product rejected due to overburning"
        placeholderTextColor={colors.muted}
      />
      <Text style={s.caLabel}>RESPONSIBLE PERSON</Text>
      <TextInput
        testID="ca-person-input"
        style={s.caInputSingle}
        value={ca.responsible_person || ""}
        onChangeText={(t) => onChange({ ...ca, responsible_person: t })}
        placeholder="Name"
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

// ---------- Single checklist item ----------
function ChecklistItem({
  item,
  state,
  onSave,
}: {
  item: any;
  state: ResultState;
  onSave: (r: ResultState) => void;
}) {
  const [local, setLocal] = useState<ResultState>(state);
  useEffect(() => setLocal(state), [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<ResultState>, saveNow = true) => {
    const next = { ...local, ...patch };
    setLocal(next);
    if (saveNow) onSave(next);
  };

  const setPassFail = (r: "PASS" | "FAIL") =>
    update({ result: r, value: r, corrective_action: r === "FAIL" ? local.corrective_action || { status: "Open" } : null });

  const setYesNo = (yes: boolean) => {
    const r = yes ? "PASS" : "FAIL";
    update({ result: r, value: yes ? "Yes" : "No", corrective_action: r === "FAIL" ? local.corrective_action || { status: "Open" } : null });
  };

  const onNumeric = (t: string) => {
    const num = t === "" ? null : parseFloat(t);
    let result: string | null = null;
    if (num != null && !isNaN(num)) {
      const okMin = item.minimum_value == null || num >= item.minimum_value;
      const okMax = item.maximum_value == null || num <= item.maximum_value;
      result = okMin && okMax ? "PASS" : "FAIL";
    }
    update({
      numeric_value: num,
      value: t,
      result,
      corrective_action: result === "FAIL" ? local.corrective_action || { status: "Open" } : null,
    });
  };

  const isFail = local.result === "FAIL";

  return (
    <View style={s.item}>
      <View style={s.itemHead}>
        <Text style={s.itemName}>{item.parameter_name}</Text>
        {item.is_required && <Text style={s.req}>REQUIRED</Text>}
      </View>

      {item.parameter_type === "passfail" && (
        <View style={s.pfRow}>
          <Pressable
            testID={`pass-${item.id}`}
            onPress={() => setPassFail("PASS")}
            style={[s.pfBtn, local.result === "PASS" && { backgroundColor: colors.success, borderColor: colors.success }]}
          >
            <Text style={[s.pfText, local.result === "PASS" && s.pfTextActive]}>PASS</Text>
          </Pressable>
          <Pressable
            testID={`fail-${item.id}`}
            onPress={() => setPassFail("FAIL")}
            style={[s.pfBtn, local.result === "FAIL" && { backgroundColor: colors.error, borderColor: colors.error }]}
          >
            <Text style={[s.pfText, local.result === "FAIL" && s.pfTextActive]}>FAIL</Text>
          </Pressable>
        </View>
      )}

      {item.parameter_type === "yesno" && (
        <View style={s.pfRow}>
          <Pressable
            testID={`yes-${item.id}`}
            onPress={() => setYesNo(true)}
            style={[s.pfBtn, local.value === "Yes" && { backgroundColor: colors.success, borderColor: colors.success }]}
          >
            <Text style={[s.pfText, local.value === "Yes" && s.pfTextActive]}>YES</Text>
          </Pressable>
          <Pressable
            testID={`no-${item.id}`}
            onPress={() => setYesNo(false)}
            style={[s.pfBtn, local.value === "No" && { backgroundColor: colors.error, borderColor: colors.error }]}
          >
            <Text style={[s.pfText, local.value === "No" && s.pfTextActive]}>NO</Text>
          </Pressable>
        </View>
      )}

      {item.parameter_type === "numeric" && (
        <View>
          <View style={s.numRow}>
            <TextInput
              testID={`numeric-${item.id}`}
              style={[s.numInput, isFail && { borderColor: colors.error }]}
              keyboardType="numeric"
              value={local.value ?? ""}
              onChangeText={onNumeric}
              placeholder="0"
              placeholderTextColor={colors.muted}
            />
            <Text style={s.unit}>{item.unit}</Text>
            {local.result && <ResultBadge result={local.result} testID={`result-${item.id}`} />}
          </View>
          <Text style={s.target}>
            TARGET: {item.minimum_value ?? "—"} to {item.maximum_value ?? "—"} {item.unit}
          </Text>
        </View>
      )}

      {item.parameter_type === "dropdown" && (
        <View style={s.optWrap}>
          {(item.options || []).map((opt: string) => {
            const active = local.value === opt;
            return (
              <Pressable
                key={opt}
                testID={`opt-${item.id}-${opt}`}
                onPress={() => update({ value: opt, result: "PASS" })}
                style={[s.optChip, active && s.optChipActive]}
              >
                <Text style={[s.optText, active && s.optTextActive]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {item.parameter_type === "text" && (
        <TextInput
          testID={`text-${item.id}`}
          style={s.textArea}
          multiline
          value={local.value ?? ""}
          onChangeText={(t) => update({ value: t, result: "NA" }, false)}
          onEndEditing={() => onSave(local)}
          placeholder="Enter observation"
          placeholderTextColor={colors.muted}
        />
      )}

      {item.parameter_type === "datetime" && (
        <View style={s.numRow}>
          <TextInput
            testID={`datetime-${item.id}`}
            style={[s.numInput, { flex: 1 }]}
            value={local.value ?? ""}
            onChangeText={(t) => update({ value: t, result: "NA" }, false)}
            onEndEditing={() => onSave(local)}
            placeholder="HH:MM"
            placeholderTextColor={colors.muted}
          />
          <Pressable style={s.nowBtn} onPress={() => update({ value: nowHM(), result: "NA" })}>
            <Text style={s.nowText}>NOW</Text>
          </Pressable>
        </View>
      )}

      {(item.parameter_type === "photo" || item.requires_photo) && (
        <View style={{ marginTop: spacing.md }}>
          {item.parameter_type !== "photo" && <Text style={s.photoLabel}>PHOTO</Text>}
          <PhotoField
            testID={`photo-${item.id}`}
            path={local.photo_path}
            onChange={(p) => update({ photo_path: p, result: local.result || "NA" })}
          />
        </View>
      )}

      {isFail && (
        <CorrectiveBlock value={local.corrective_action} onChange={(ca) => update({ corrective_action: ca })} />
      )}
    </View>
  );
}

// ---------- CCP card with recurring readings ----------
function CcpCard({
  ccp,
  readings,
  onAdd,
}: {
  ccp: any;
  readings: any[];
  onAdd: (payload: any) => Promise<void>;
}) {
  const [time, setTime] = useState(nowHM());
  const [val, setVal] = useState("");
  const [ca, setCa] = useState<any>({ status: "Open" });
  const [adding, setAdding] = useState(false);

  const num = val === "" ? null : parseFloat(val);
  let preview: string | null = null;
  if (num != null && !isNaN(num)) {
    const okMin = ccp.critical_limit_min == null || num >= ccp.critical_limit_min;
    const okMax = ccp.critical_limit_max == null || num <= ccp.critical_limit_max;
    preview = okMin && okMax ? "PASS" : "FAIL";
  }

  const add = async () => {
    if (num == null || isNaN(num)) return;
    setAdding(true);
    try {
      await onAdd({
        ccp_id: ccp.id,
        reading_time: time,
        actual_value: num,
        corrective_action: preview === "FAIL" ? ca : null,
      });
      setVal("");
      setTime(nowHM());
      setCa({ status: "Open" });
    } finally {
      setAdding(false);
    }
  };

  const limitLabel =
    ccp.critical_limit_max != null
      ? `${ccp.critical_limit_min ?? ""}–${ccp.critical_limit_max} ${ccp.unit}`
      : `≥ ${ccp.critical_limit_min} ${ccp.unit}`;

  return (
    <View style={s.ccpCard}>
      <View style={s.ccpHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.ccpName}>
            {ccp.ccp_number} · {ccp.name}
          </Text>
          <Text style={s.ccpMeta}>
            Limit {limitLabel} · {ccp.monitoring_frequency}
          </Text>
        </View>
      </View>

      {readings.length > 0 && (
        <View style={s.readList}>
          {readings.map((r) => (
            <View key={r.id} style={s.readRow}>
              <Text style={s.readTime}>{r.reading_time}</Text>
              <Text style={s.readVal}>
                {r.actual_value} {r.unit}
              </Text>
              <ResultBadge result={r.result} />
            </View>
          ))}
        </View>
      )}

      <View style={s.readInputRow}>
        <TextInput
          testID={`ccp-time-${ccp.id}`}
          style={[s.numInput, { width: 74 }]}
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          testID={`ccp-value-${ccp.id}`}
          style={[s.numInput, { flex: 1, borderColor: preview === "FAIL" ? colors.error : colors.borderStrong }]}
          keyboardType="numeric"
          value={val}
          onChangeText={setVal}
          placeholder={`Value (${ccp.unit})`}
          placeholderTextColor={colors.muted}
        />
        {preview && <ResultBadge result={preview} />}
      </View>

      {preview === "FAIL" && (
        <CorrectiveBlock value={ca} onChange={setCa} />
      )}

      <Pressable
        testID={`ccp-add-${ccp.id}`}
        style={[s.addReadBtn, (num == null || isNaN(num as any)) && { opacity: 0.4 }]}
        onPress={add}
        disabled={num == null || isNaN(num as any) || adding}
      >
        <Ionicons name="add" size={18} color={colors.onSurfaceInverse} />
        <Text style={s.addReadText}>{adding ? "SAVING..." : "ADD READING"}</Text>
      </Pressable>
    </View>
  );
}

export default function Inspection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [insp, setInsp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, ResultState>>({});
  const [readings, setReadings] = useState<any[]>([]);

  const load = useCallback(async () => {
    const data = await api.get(`/inspections/${id}`);
    setInsp(data);
    const rmap: Record<string, ResultState> = {};
    (data.results || []).forEach((r: any) => {
      rmap[r.item_id] = {
        value: r.value,
        numeric_value: r.numeric_value,
        result: r.result,
        remarks: r.remarks,
        photo_path: r.photo_path,
        corrective_action: r.corrective_action,
      };
    });
    setResults(rmap);
    setReadings(data.ccp_readings || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveResult = async (itemId: string, r: ResultState) => {
    setResults((prev) => ({ ...prev, [itemId]: r }));
    try {
      await api.put(`/inspections/${id}/results`, {
        item_id: itemId,
        value: r.value,
        numeric_value: r.numeric_value,
        result: r.result,
        remarks: r.remarks,
        photo_path: r.photo_path,
        corrective_action: r.corrective_action,
      });
    } catch (e: any) {
      toast.show("Save failed", "error");
    }
  };

  const addReading = async (payload: any) => {
    try {
      const reading = await api.post(`/inspections/${id}/ccp-readings`, {
        ...payload,
        reading_time: payload.reading_time,
      });
      setReadings((prev) => [...prev, reading]);
      toast.show(`Reading saved · ${reading.result}`, reading.result === "FAIL" ? "error" : "success");
    } catch (e: any) {
      toast.show(e.message || "Could not save reading", "error");
    }
  };

  const items = insp?.snapshot?.items || [];
  const ccps = insp?.snapshot?.ccps || [];

  const sections = useMemo(() => {
    const map: Record<string, any[]> = {};
    items.forEach((it: any) => {
      const sec = it.section || "General";
      if (!map[sec]) map[sec] = [];
      map[sec].push(it);
    });
    return map;
  }, [items]);

  const progress = useMemo(() => {
    const requiredItems = items.filter((i: any) => i.is_required);
    const doneItems = requiredItems.filter((i: any) => results[i.id]?.result).length;
    const ccpDone = ccps.filter((c: any) => readings.some((r) => r.ccp_id === c.id)).length;
    const total = requiredItems.length + ccps.length;
    const done = doneItems + ccpDone;
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }, [items, ccps, results, readings]);

  if (loading) {
    return (
      <View style={s.container}>
        <ScreenHeader title="Inspection" />
        <View style={s.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScreenHeader
        title={insp.product_name}
        subtitle={`BATCH ${insp.batch_number} · ${insp.shift}`}
      />
      <View style={s.progressWrap}>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={s.progressText}>{progress}%</Text>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={90}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
      >
        {ccps.length > 0 && (
          <>
            <Text style={s.sectionTitle}>CRITICAL CONTROL POINTS (CCP)</Text>
            {ccps.map((c: any) => (
              <CcpCard
                key={c.id}
                ccp={c}
                readings={readings.filter((r) => r.ccp_id === c.id)}
                onAdd={addReading}
              />
            ))}
          </>
        )}

        {Object.entries(sections).map(([sec, its]) => (
          <View key={sec}>
            <Text style={s.sectionTitle}>{sec.toUpperCase()}</Text>
            {(its as any[]).map((it) => (
              <ChecklistItem
                key={it.id}
                item={it}
                state={results[it.id] || {}}
                onSave={(r) => saveResult(it.id, r)}
              />
            ))}
          </View>
        ))}
      </KeyboardAwareScrollView>

      <View style={[s.ctaBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="review-inspection-button"
          title="REVIEW INSPECTION →"
          onPress={() => router.push(`/review?id=${id}` as any)}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  progressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
  },
  progressBar: { flex: 1, height: 12, borderWidth: 2, borderColor: colors.borderStrong },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  progressText: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurface, width: 44, textAlign: "right" },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: type.base,
    color: colors.onSurfaceInverse,
    backgroundColor: colors.surfaceInverse,
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  item: { borderBottomWidth: 2, borderBottomColor: colors.border, paddingBottom: spacing.lg, marginBottom: spacing.lg },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  itemName: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface, flex: 1 },
  req: { fontFamily: font.mono, fontSize: 10, color: colors.muted, letterSpacing: 1 },
  pfRow: { flexDirection: "row", gap: spacing.md },
  pfBtn: {
    flex: 1,
    height: 64,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  pfText: { fontFamily: font.display, fontSize: type.xl, color: colors.onSurface, letterSpacing: 1 },
  pfTextActive: { color: "#fff" },
  numRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  numInput: {
    height: 56,
    minWidth: 90,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    fontFamily: font.mono,
    fontSize: type.xl,
    color: colors.onSurface,
  },
  unit: { fontFamily: font.mono, fontSize: type.lg, color: colors.muted },
  target: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: spacing.sm, letterSpacing: 0.5 },
  optWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  optChip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, height: 48, justifyContent: "center" },
  optChipActive: { backgroundColor: colors.brand },
  optText: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  optTextActive: { color: "#fff" },
  textArea: {
    minHeight: 80,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    fontFamily: font.text,
    fontSize: type.base,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
  nowBtn: { height: 56, paddingHorizontal: spacing.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  nowText: { fontFamily: font.mono, color: "#fff", fontSize: type.base },
  photoLabel: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, letterSpacing: 1, marginBottom: 6 },
  // CCP
  ccpCard: { borderWidth: 2, borderColor: colors.borderStrong, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.md },
  ccpHead: { flexDirection: "row" },
  ccpName: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface },
  ccpMeta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  readList: { borderTopWidth: 1, borderColor: colors.border },
  readRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  readTime: { fontFamily: font.mono, fontSize: type.base, color: colors.onSurface, width: 60 },
  readVal: { fontFamily: font.mono, fontSize: type.base, color: colors.onSurface, flex: 1 },
  readInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  addReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 48,
    backgroundColor: colors.brand,
  },
  addReadText: { fontFamily: font.display, fontSize: type.base, color: "#fff", letterSpacing: 1 },
  // corrective
  caBox: { marginTop: spacing.md, borderWidth: 2, borderColor: colors.error, backgroundColor: "#FEF2F2", padding: spacing.md, gap: 6 },
  caHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.error, padding: spacing.sm, marginHorizontal: -spacing.md, marginTop: -spacing.md, marginBottom: spacing.sm },
  caHeader: { fontFamily: font.display, fontSize: type.sm, color: "#fff", letterSpacing: 1 },
  caLabel: { fontFamily: font.mono, fontSize: type.sm, color: colors.error, letterSpacing: 0.5 },
  caInput: { minHeight: 60, borderWidth: 2, borderColor: colors.error, padding: spacing.sm, fontFamily: font.text, fontSize: type.base, color: colors.onSurface, backgroundColor: "#fff", textAlignVertical: "top" },
  caInputSingle: { height: 48, borderWidth: 2, borderColor: colors.error, paddingHorizontal: spacing.sm, fontFamily: font.text, fontSize: type.base, color: colors.onSurface, backgroundColor: "#fff" },
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
