import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors, font, spacing, type } from "@/src/theme";
import { api } from "@/src/api/client";
import { useToast } from "@/src/context/Toast";

interface Props {
  path?: string | null;
  onChange: (path: string) => void;
  testID?: string;
}

export default function PhotoField({ path, onChange, testID }: Props) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    if (path) {
      api.fileUrl(path).then((u) => active && setPreview(u));
    } else {
      setPreview(null);
    }
    return () => {
      active = false;
    };
  }, [path]);

  const handleUpload = async (uri: string) => {
    setUploading(true);
    try {
      const stored = await api.uploadPhoto(uri);
      setPreview(uri);
      onChange(stored);
      toast.show("Photo attached", "success");
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const openCamera = async () => {
    setPickerOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) setBlocked(true);
      else toast.show("Camera permission needed to take photos", "error");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]) handleUpload(res.assets[0].uri);
  };

  const openLibrary = async () => {
    setPickerOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) setBlocked(true);
      else toast.show("Photo library permission needed", "error");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]) handleUpload(res.assets[0].uri);
  };

  return (
    <View testID={testID}>
      <Pressable style={styles.box} onPress={() => setPickerOpen(true)} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color={colors.brand} />
        ) : preview ? (
          <Image source={{ uri: preview }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="camera-outline" size={30} color={colors.muted} />
            <Text style={styles.placeholderText}>ADD PHOTO</Text>
          </View>
        )}
      </Pressable>
      {!!preview && !uploading && (
        <Pressable
          testID="retake-photo-button"
          style={styles.retake}
          onPress={() => setPickerOpen(true)}
        >
          <Ionicons name="refresh" size={14} color={colors.onSurface} />
          <Text style={styles.retakeText}>Replace</Text>
        </Pressable>
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>ATTACH PHOTO</Text>
            <Pressable testID="photo-camera-option" style={styles.sheetRow} onPress={openCamera}>
              <Ionicons name="camera" size={22} color={colors.onSurface} />
              <Text style={styles.sheetRowText}>Take Photo</Text>
            </Pressable>
            <Pressable testID="photo-library-option" style={styles.sheetRow} onPress={openLibrary}>
              <Ionicons name="images" size={22} color={colors.onSurface} />
              <Text style={styles.sheetRowText}>Choose From Library</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={blocked} transparent animationType="fade" onRequestClose={() => setBlocked(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>PERMISSION REQUIRED</Text>
            <Text style={styles.blockedText}>
              Access was denied. Enable camera / photos in Settings to attach QC photos.
            </Text>
            <Pressable
              testID="open-settings-button"
              style={styles.settingsBtn}
              onPress={() => {
                setBlocked(false);
                Linking.openSettings();
              }}
            >
              <Text style={styles.settingsText}>OPEN SETTINGS</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => setBlocked(false)}>
              <Text style={styles.sheetRowText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 120,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  thumb: { width: "100%", height: "100%" },
  placeholder: { alignItems: "center", gap: 6 },
  placeholderText: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, letterSpacing: 1 },
  retake: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  retakeText: { fontFamily: font.text, fontSize: type.sm, color: colors.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: { fontFamily: font.display, fontSize: type.lg, color: colors.onSurface, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sheetRowText: { fontFamily: font.text, fontSize: type.lg, color: colors.onSurface },
  blockedText: { fontFamily: font.text, fontSize: type.base, color: colors.onSurfaceSecondary, marginBottom: spacing.md },
  settingsBtn: { backgroundColor: colors.brand, height: 52, alignItems: "center", justifyContent: "center" },
  settingsText: { fontFamily: font.display, fontSize: type.base, color: colors.onSurfaceInverse, letterSpacing: 1 },
});
