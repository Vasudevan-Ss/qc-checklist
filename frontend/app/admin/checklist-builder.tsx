import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, font, spacing, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import AppButton from "@/src/components/AppButton";
import { useToast } from "@/src/context/Toast";

const PARAM_TYPES = ["passfail", "yesno", "numeric", "dropdown", "text", "datetime", "photo"];

function LabeledInput({ label, value, onChangeText, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.muted}
        {...rest}
      />
    </View>
  );
}

function Toggle({ label, value, onToggle, testID }: any) {
  return (
    <Pressable testID={testID} style={styles.toggleRow} onPress={onToggle}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>
        {value && <Ionicons name="checkmark" size={18} color="#fff" />}
      </View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

export default function ChecklistBuilder() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [itemModal, setItemModal] = useState(false);
  const [ccpModal, setCcpModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editCcp, setEditCcp] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const c = await api.get(`/products/${productId}/checklist`).catch(() => ({ items: [], ccps: [], template: { version: 1 } }));
      const p = await api.get(`/products/${productId}`);
      setData({ ...c, product: p });
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openItem = (item: any = null) => {
    setEditItem(item);
    setItemModal(true);
  };
  const openCcp = (ccp: any = null) => {
    setEditCcp(ccp);
    setCcpModal(true);
  };

  const deleteItem = async (item: any) => {
    try {
      await api.del(`/checklist-items/${item.id}`);
      toast.show("Parameter removed", "success");
      load();
    } catch (e: any) {
      toast.show(e.message || "Delete failed", "error");
    }
  };
  const deleteCcp = async (ccp: any) => {
    try {
      await api.del(`/ccps/${ccp.id}`);
      toast.show("CCP removed", "success");
      load();
    } catch (e: any) {
      toast.show(e.message || "Delete failed", "error");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Checklist Builder" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Checklist Builder"
        subtitle={data.product?.product_name}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {/* CCP section */}
        <View style={styles.secHead}>
          <Text style={styles.secTitle}>CRITICAL CONTROL POINTS</Text>
          <Pressable testID="add-ccp-button" onPress={() => openCcp()} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        </View>
        {(data.ccps || []).length === 0 && <Text style={styles.emptyLine}>No CCPs defined</Text>}
        {(data.ccps || []).map((c: any) => (
          <View key={c.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{c.ccp_number} · {c.name}</Text>
              <Text style={styles.rowMeta}>
                {c.critical_limit_min ?? ""}
                {c.critical_limit_max != null ? `–${c.critical_limit_max}` : "+"} {c.unit} · {c.monitoring_frequency}
              </Text>
            </View>
            <Pressable testID={`edit-ccp-${c.id}`} onPress={() => openCcp(c)} style={styles.iconBtn}>
              <Ionicons name="create-outline" size={20} color={colors.onSurface} />
            </Pressable>
            <Pressable testID={`delete-ccp-${c.id}`} onPress={() => deleteCcp(c)} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </Pressable>
          </View>
        ))}

        {/* Items section */}
        <View style={[styles.secHead, { marginTop: spacing.xl }]}>
          <Text style={styles.secTitle}>CHECKLIST PARAMETERS</Text>
          <Pressable testID="add-item-button" onPress={() => openItem()} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        </View>
        {(data.items || []).length === 0 && <Text style={styles.emptyLine}>No parameters defined</Text>}
        {(data.items || []).map((it: any) => (
          <View key={it.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{it.parameter_name}</Text>
              <Text style={styles.rowMeta}>
                {it.section} · {it.parameter_type}
                {it.parameter_type === "numeric" ? ` · ${it.minimum_value ?? ""}-${it.maximum_value ?? ""} ${it.unit || ""}` : ""}
              </Text>
            </View>
            <Pressable testID={`edit-item-${it.id}`} onPress={() => openItem(it)} style={styles.iconBtn}>
              <Ionicons name="create-outline" size={20} color={colors.onSurface} />
            </Pressable>
            <Pressable testID={`delete-item-${it.id}`} onPress={() => deleteItem(it)} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {itemModal && (
        <ItemFormModal
          productId={productId!}
          item={editItem}
          onClose={() => setItemModal(false)}
          onSaved={() => {
            setItemModal(false);
            load();
          }}
        />
      )}
      {ccpModal && (
        <CcpFormModal
          productId={productId!}
          ccp={editCcp}
          onClose={() => setCcpModal(false)}
          onSaved={() => {
            setCcpModal(false);
            load();
          }}
        />
      )}
    </View>
  );
}

// ---------------- Item form modal ----------------
function ItemFormModal({ productId, item, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isEdit = !!item;
  const [name, setName] = useState(item?.parameter_name || "");
  const [ptype, setPtype] = useState(item?.parameter_type || "passfail");
  const [section, setSection] = useState(item?.section || "Finished Product");
  const [unit, setUnit] = useState(item?.unit || "");
  const [minV, setMinV] = useState(item?.minimum_value != null ? String(item.minimum_value) : "");
  const [maxV, setMaxV] = useState(item?.maximum_value != null ? String(item.maximum_value) : "");
  const [options, setOptions] = useState((item?.options || []).join(", "));
  const [required, setRequired] = useState(item?.is_required !== false);
  const [photo, setPhoto] = useState(!!item?.requires_photo);
  const [seq, setSeq] = useState(item?.sequence != null ? String(item.sequence) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.show("Parameter name is required", "error");
      return;
    }
    const payload: any = {
      parameter_name: name.trim(),
      parameter_type: ptype,
      section: section.trim() || "Finished Product",
      unit: unit || null,
      minimum_value: minV ? parseFloat(minV) : null,
      maximum_value: maxV ? parseFloat(maxV) : null,
      options: ptype === "dropdown" ? options.split(",").map((o) => o.trim()).filter(Boolean) : null,
      is_required: required,
      requires_photo: photo,
      sequence: seq ? parseInt(seq, 10) : 0,
    };
    setSaving(true);
    try {
      if (isEdit) await api.put(`/checklist-items/${item.id}`, payload);
      else await api.post(`/products/${productId}/checklist-items`, payload);
      toast.show(isEdit ? "Parameter saved" : "Parameter added", "success");
      onSaved();
    } catch (e: any) {
      toast.show(e.message || "Save failed", "error");
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{isEdit ? "EDIT PARAMETER" : "ADD PARAMETER"}</Text>
            <Pressable testID="close-item-modal" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <KeyboardAwareScrollView
            bottomOffset={90}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          >
            <LabeledInput label="PARAMETER NAME *" value={name} onChangeText={setName} placeholder="e.g. Net Weight" testID="item-name-input" />

            <Text style={styles.label}>TYPE</Text>
            <View style={styles.chipWrap}>
              {PARAM_TYPES.map((t) => (
                <Pressable
                  key={t}
                  testID={`type-${t}`}
                  onPress={() => setPtype(t)}
                  style={[styles.typeChip, ptype === t && styles.typeChipOn]}
                >
                  <Text style={[styles.typeChipText, ptype === t && { color: "#fff" }]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <LabeledInput label="SECTION" value={section} onChangeText={setSection} placeholder="e.g. Finished Product / Packaging" />

            {ptype === "numeric" && (
              <>
                <LabeledInput label="UNIT" value={unit} onChangeText={setUnit} placeholder="g / mm / °C" />
                <View style={styles.rowGap}>
                  <View style={{ flex: 1 }}>
                    <LabeledInput label="MIN" value={minV} onChangeText={setMinV} keyboardType="numeric" placeholder="490" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <LabeledInput label="MAX" value={maxV} onChangeText={setMaxV} keyboardType="numeric" placeholder="510" />
                  </View>
                </View>
              </>
            )}

            {ptype === "dropdown" && (
              <LabeledInput
                label="OPTIONS (comma separated)"
                value={options}
                onChangeText={setOptions}
                placeholder="Light Brown, Golden Brown, Dark Brown"
              />
            )}

            <LabeledInput label="SEQUENCE" value={seq} onChangeText={setSeq} keyboardType="numeric" placeholder="1" />

            <Toggle testID="toggle-required" label="Required" value={required} onToggle={() => setRequired((v) => !v)} />
            <Toggle testID="toggle-photo" label="Requires photo" value={photo} onToggle={() => setPhoto((v) => !v)} />

            <AppButton testID="save-item-button" title={saving ? "" : "SAVE PARAMETER"} onPress={save} loading={saving} style={{ marginTop: spacing.sm }} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------- CCP form modal ----------------
function CcpFormModal({ productId, ccp, onClose, onSaved }: any) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const isEdit = !!ccp;
  const [f, setF] = useState<Record<string, string>>({
    ccp_number: ccp?.ccp_number || "",
    name: ccp?.name || "",
    process_step: ccp?.process_step || "",
    hazard: ccp?.hazard || "",
    critical_limit_min: ccp?.critical_limit_min != null ? String(ccp.critical_limit_min) : "",
    critical_limit_max: ccp?.critical_limit_max != null ? String(ccp.critical_limit_max) : "",
    unit: ccp?.unit || "",
    monitoring_frequency: ccp?.monitoring_frequency || "",
    corrective_action: ccp?.corrective_action || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.ccp_number.trim() || !f.name.trim()) {
      toast.show("CCP number and name are required", "error");
      return;
    }
    const payload: any = {
      ccp_number: f.ccp_number.trim(),
      name: f.name.trim(),
      process_step: f.process_step || null,
      hazard: f.hazard || null,
      critical_limit_min: f.critical_limit_min ? parseFloat(f.critical_limit_min) : null,
      critical_limit_max: f.critical_limit_max ? parseFloat(f.critical_limit_max) : null,
      unit: f.unit || null,
      monitoring_frequency: f.monitoring_frequency || null,
      corrective_action: f.corrective_action || null,
      active: true,
    };
    setSaving(true);
    try {
      if (isEdit) await api.put(`/ccps/${ccp.id}`, payload);
      else await api.post(`/products/${productId}/ccps`, payload);
      toast.show(isEdit ? "CCP saved" : "CCP added", "success");
      onSaved();
    } catch (e: any) {
      toast.show(e.message || "Save failed", "error");
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{isEdit ? "EDIT CCP" : "ADD CCP"}</Text>
            <Pressable testID="close-ccp-modal" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          <KeyboardAwareScrollView
            bottomOffset={90}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          >
            <LabeledInput label="CCP NUMBER *" value={f.ccp_number} onChangeText={(t: string) => set("ccp_number", t)} placeholder="CCP-1" testID="ccp-number-input" />
            <LabeledInput label="NAME *" value={f.name} onChangeText={(t: string) => set("name", t)} placeholder="Baking Temperature" testID="ccp-name-input" />
            <LabeledInput label="PROCESS STEP" value={f.process_step} onChangeText={(t: string) => set("process_step", t)} placeholder="Baking" />
            <LabeledInput label="HAZARD" value={f.hazard} onChangeText={(t: string) => set("hazard", t)} placeholder="Undercooked product" />
            <View style={styles.rowGap}>
              <View style={{ flex: 1 }}>
                <LabeledInput label="LIMIT MIN" value={f.critical_limit_min} onChangeText={(t: string) => set("critical_limit_min", t)} keyboardType="numeric" placeholder="175" />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label="LIMIT MAX" value={f.critical_limit_max} onChangeText={(t: string) => set("critical_limit_max", t)} keyboardType="numeric" placeholder="185" />
              </View>
            </View>
            <LabeledInput label="UNIT" value={f.unit} onChangeText={(t: string) => set("unit", t)} placeholder="°C" />
            <LabeledInput label="MONITORING FREQUENCY" value={f.monitoring_frequency} onChangeText={(t: string) => set("monitoring_frequency", t)} placeholder="Every 30 minutes" />
            <LabeledInput label="CORRECTIVE ACTION" value={f.corrective_action} onChangeText={(t: string) => set("corrective_action", t)} placeholder="Adjust oven / reject batch" />
            <AppButton testID="save-ccp-button" title={saving ? "" : "SAVE CCP"} onPress={save} loading={saving} style={{ marginTop: spacing.sm }} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  secTitle: { fontFamily: font.display, fontSize: type.base, color: colors.onSurface, letterSpacing: 1 },
  addBtn: { width: 36, height: 36, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  emptyLine: { fontFamily: font.text, fontSize: type.sm, color: colors.muted, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.borderStrong,
    paddingLeft: spacing.md,
    marginBottom: spacing.sm,
  },
  rowName: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
  rowMeta: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: colors.border },
  // modal
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: colors.surface, borderTopWidth: 2, borderColor: colors.borderStrong, maxHeight: "92%" },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
  },
  modalTitle: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface, letterSpacing: 1 },
  label: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary, letterSpacing: 1 },
  input: {
    height: 52,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    fontFamily: font.text,
    fontSize: type.base,
    color: colors.onSurface,
  },
  rowGap: { flexDirection: "row", gap: spacing.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeChip: { borderWidth: 2, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, height: 40, justifyContent: "center" },
  typeChipOn: { backgroundColor: colors.brand },
  typeChipText: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurface },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.brand },
  toggleText: { fontFamily: font.text, fontSize: type.base, color: colors.onSurface },
});
