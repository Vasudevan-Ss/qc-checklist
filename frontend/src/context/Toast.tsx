import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, spacing, type } from "@/src/theme";

type ToastType = "success" | "error" | "info";
interface ToastCtx {
  show: (message: string, type?: ToastType) => void;
}
const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState("");
  const [ttype, setTtype] = useState<ToastType>("info");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, t: ToastType = "info") => {
      setMsg(message);
      setTtype(t);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      }, 2600);
    },
    [opacity],
  );

  const bg =
    ttype === "success" ? colors.success : ttype === "error" ? colors.error : colors.surfaceInverse;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.wrap,
          { top: insets.top + 60, opacity },
        ]}
      >
        {!!msg && (
          <View testID="app-toast" style={[styles.toast, { backgroundColor: bg }]}>
            <Text style={styles.text}>{msg}</Text>
          </View>
        )}
      </Animated.View>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", zIndex: 9999 },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    maxWidth: 520,
  },
  text: { color: "#FFFFFF", fontFamily: font.text, fontSize: type.base },
});
