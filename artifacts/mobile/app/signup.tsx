import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topPad = Platform.OS === "web" ? 40 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const canSubmit = name.trim() && username.trim() && password.length >= 6 && password === confirmPw && !loading;

  async function handleRegister() {
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      await register(username.trim(), password, name.trim(), "commuter");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? "Registration failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  const s = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: topPad, paddingBottom: bottomPad }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={s.brand}>
            <View style={s.logo}>
              <MaterialCommunityIcons name="bus-multiple" size={28} color="#fff" />
            </View>
            <Text style={s.appName}>Create Account</Text>
            <Text style={s.subtitle}>Join as a commuter to track jeepneys near you</Text>
          </View>
        </View>

        <View style={s.card}>
          {!!error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <InputField label="Full Name" icon="user" value={name} onChange={setName} colors={colors} />
          <InputField label="Username" icon="at-sign" value={username} onChange={setUsername} colors={colors} autoCapitalize="none" />

          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <View style={s.inputWrap}>
              <Feather name="lock" size={18} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input} placeholder="Min. 6 characters"
                placeholderTextColor={colors.mutedForeground}
                value={password} onChangeText={setPassword}
                secureTextEntry={!showPw}
              />
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={s.eyeBtn}>
                <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Confirm Password</Text>
            <View style={[s.inputWrap, confirmPw && password !== confirmPw && s.inputError]}>
              <Feather name="lock" size={18} color={colors.mutedForeground} style={s.inputIcon} />
              <TextInput
                style={s.input} placeholder="Repeat password"
                placeholderTextColor={colors.mutedForeground}
                value={confirmPw} onChangeText={setConfirmPw}
                secureTextEntry={!showPw}
              />
            </View>
            {confirmPw && password !== confirmPw && (
              <Text style={s.fieldError}>Passwords do not match</Text>
            )}
          </View>

          <View style={s.infoBox}>
            <MaterialCommunityIcons name="map-marker-radius" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.infoTitle}>Commuter Account</Text>
              <Text style={s.infoDesc}>Track jeepneys near you and announce your pickup location to nearby drivers.</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[s.submitBtn, !canSubmit && s.btnDisabled]}
            onPress={handleRegister}
            activeOpacity={0.8}
            disabled={!canSubmit}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <><Text style={s.submitBtnText}>Create Account</Text><Feather name="arrow-right" size={18} color="#fff" /></>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.loginLink} onPress={() => router.replace("/")}>
            <Text style={s.loginLinkText}>Already have an account? <Text style={{ color: colors.primary, fontWeight: "700" }}>Sign in</Text></Text>
          </TouchableOpacity>

          <View style={s.adminNote}>
            <Text style={s.adminNoteText}>Fleet admin? Register at the <Text style={{ fontWeight: "700" }}>Admin Portal</Text> on the website.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InputField({ label, icon, value, onChange, colors, autoCapitalize = "words" }: any) {
  const s = makeStyles(colors);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputWrap}>
        <Feather name={icon} size={18} color={colors.mutedForeground} style={s.inputIcon} />
        <TextInput
          style={s.input} placeholder={`Enter ${label.toLowerCase()}`}
          placeholderTextColor={colors.mutedForeground}
          value={value} onChangeText={onChange}
          autoCapitalize={autoCapitalize} autoCorrect={false}
        />
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.primary },
    scroll: { flexGrow: 1, padding: 20 },
    header: { marginBottom: 20 },
    backBtn: { padding: 8, marginBottom: 12, alignSelf: "flex-start" },
    brand: { alignItems: "center" },
    logo: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center", justifyContent: "center", marginBottom: 8,
    },
    appName: { fontSize: 24, fontWeight: "800", color: "#fff" },
    subtitle: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4, textAlign: "center" },
    card: {
      backgroundColor: colors.background, borderRadius: 20, padding: 24,
      shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12, shadowRadius: 24, elevation: 12,
    },
    errorBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 16,
    },
    errorText: { fontSize: 14, color: colors.destructive, flex: 1 },
    field: { marginBottom: 14 },
    label: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
    inputWrap: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 14, height: 50,
    },
    inputError: { borderWidth: 1, borderColor: colors.destructive },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 15, color: colors.foreground },
    eyeBtn: { padding: 4 },
    fieldError: { fontSize: 12, color: colors.destructive, marginTop: 4 },
    infoBox: {
      flexDirection: "row", alignItems: "flex-start", gap: 12,
      backgroundColor: colors.secondary, borderRadius: 12, padding: 14, marginBottom: 20,
    },
    infoTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 2 },
    infoDesc: { fontSize: 12, color: colors.mutedForeground, lineHeight: 17 },
    submitBtn: {
      height: 54, borderRadius: 14, backgroundColor: colors.primary,
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    btnDisabled: { opacity: 0.45 },
    submitBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
    loginLink: { marginTop: 16, alignItems: "center" },
    loginLinkText: { fontSize: 14, color: colors.mutedForeground },
    adminNote: {
      marginTop: 12, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: colors.border,
      alignItems: "center",
    },
    adminNoteText: { fontSize: 12, color: colors.mutedForeground, textAlign: "center" },
  });
}
