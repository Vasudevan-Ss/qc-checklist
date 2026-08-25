import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, spacing, type } from "@/src/theme";

interface Props {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}

export default function ScreenHeader({ title, subtitle, back = true, right }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {back ? (
          <Pressable
            testID="header-back-button"
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.rightWrap}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, paddingHorizontal: spacing.xs },
  title: { fontFamily: font.display, fontSize: type.xl, color: colors.onSurface },
  subtitle: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, marginTop: 2 },
  rightWrap: { minWidth: 40, alignItems: "flex-end", justifyContent: "center" },
});
