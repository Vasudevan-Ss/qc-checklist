import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { colors, font, spacing, type } from "@/src/theme";
import AppButton from "@/src/components/AppButton";

const HERO =
  "https://images.unsplash.com/photo-1621954938124-02e637ba3584?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTB8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBpbmR1c3RyaWFsJTIwYmFrZXJ5JTIwcHJvZHVjdGlvbiUyMGxpbmV8ZW58MHx8fHwxNzg3NjMwNzcyfDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login, register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!email || !password || (mode === "register" && !name)) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      router.replace("/dashboard");
    } catch (e: any) {
      setError(e.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={styles.heroImg} resizeMode="cover" />
          <LinearGradient
            colors={["rgba(0,0,0,0.2)", "rgba(9,9,11,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroText, { paddingTop: insets.top + spacing.lg }]}>
            <Text style={styles.brand}>QC INSPECT</Text>
            <Text style={styles.tagline}>Digital Quality Control for Bakery Manufacturing</Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>{mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}</Text>

          {!!error && (
            <View testID="login-error" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {mode === "register" && (
            <View style={styles.field}>
              <Text style={styles.label}>FULL NAME</Text>
              <TextInput
                testID="name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Ravi Kumar"
                placeholderTextColor={colors.muted}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@bakery.com"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
            />
          </View>

          <AppButton
            testID="submit-auth-button"
            title={loading ? "" : mode === "login" ? "SIGN IN" : "REGISTER"}
            onPress={submit}
            loading={loading}
            style={{ marginTop: spacing.sm }}
          />

          <Pressable
            testID="toggle-auth-mode"
            onPress={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>
              {mode === "login" ? "New QC Executive? Create an account" : "Already registered? Sign in"}
            </Text>
          </Pressable>

          <View style={styles.demo}>
            <Text style={styles.demoTitle}>DEMO LOGINS</Text>
            <Text style={styles.demoText}>admin@qc.com · Admin@12345</Text>
            <Text style={styles.demoText}>qc@qc.com · Qcuser@12345</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 260, backgroundColor: "#000", justifyContent: "flex-end" },
  heroImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroText: { padding: spacing.lg },
  brand: { fontFamily: font.display, fontSize: type["3xl"], color: "#fff", letterSpacing: 2 },
  tagline: { fontFamily: font.text, fontSize: type.base, color: "#E4E4E7", marginTop: spacing.xs },
  form: { padding: spacing.lg, gap: spacing.md },
  formTitle: { fontFamily: font.display, fontSize: type.xl, color: colors.onSurface, letterSpacing: 1 },
  errorBox: { backgroundColor: colors.error, padding: spacing.md, borderWidth: 2, borderColor: colors.borderStrong },
  errorText: { color: "#fff", fontFamily: font.text, fontSize: type.base },
  field: { gap: 6 },
  label: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary, letterSpacing: 1 },
  input: {
    height: 56,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    fontFamily: font.text,
    fontSize: type.lg,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  toggle: { paddingVertical: spacing.sm, alignItems: "center" },
  toggleText: { fontFamily: font.text, fontSize: type.base, color: colors.info },
  demo: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    gap: 2,
  },
  demoTitle: { fontFamily: font.mono, fontSize: type.sm, color: colors.muted, letterSpacing: 1, marginBottom: 4 },
  demoText: { fontFamily: font.mono, fontSize: type.sm, color: colors.onSurfaceSecondary },
});
