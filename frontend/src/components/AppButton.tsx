import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, font, spacing, type } from "@/src/theme";

interface Props {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary"
      ? colors.brand
      : variant === "danger"
      ? colors.error
      : variant === "secondary"
      ? colors.surfaceSecondary
      : "transparent";
  const fg =
    variant === "secondary" || variant === "outline" ? colors.onSurface : colors.onSurfaceInverse;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        (variant === "outline" || variant === "secondary") && styles.bordered,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  bordered: { borderWidth: 2, borderColor: colors.borderStrong },
  label: { fontFamily: font.display, fontSize: type.lg, letterSpacing: 0.5 },
});
