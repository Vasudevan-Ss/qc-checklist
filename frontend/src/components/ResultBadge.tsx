import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, resultColor, type } from "@/src/theme";

export default function ResultBadge({
  result,
  testID,
}: {
  result?: string | null;
  testID?: string;
}) {
  const label = result || "—";
  const bg = resultColor(result);
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, minWidth: 56, alignItems: "center" },
  text: { color: "#FFFFFF", fontFamily: font.mono, fontSize: type.sm, letterSpacing: 1 },
});
