import { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { uploadReceipt } from "../services/api";

export default function UploadPreviewScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ id: string; status: string } | null>(null);

  async function submit() {
    if (!uri) return;
    setUploading(true);
    try {
      const doc = await uploadReceipt(uri);
      setResult(doc);
    } catch (e: unknown) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setUploading(false);
    }
  }

  if (result) {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>Uploaded!</Text>
        <Text style={styles.successSub}>
          Your receipt is being processed. OCR extraction will begin shortly.
        </Text>
        <Text style={styles.docId}>Doc ID: {result.id.slice(0, 8)}…</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push(`/document/${result.id}`)}
        >
          <Text style={styles.primaryBtnText}>View Status →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.ghostBtnText}>Capture Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Review & Submit</Text>

      {uri ? (
        <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
      ) : (
        <View style={[styles.preview, styles.noImage]}>
          <Text>No image selected</Text>
        </View>
      )}

      <Text style={styles.hint}>
        Check that the receipt is clearly visible and the amount, date, and vendor name are readable.
        OCR will extract fields automatically — you can correct them after upload.
      </Text>

      <TouchableOpacity
        style={[styles.primaryBtn, (!uri || uploading) && styles.disabledBtn]}
        onPress={submit}
        disabled={!uri || uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Submit Receipt</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.ghostBtn} onPress={() => router.back()}>
        <Text style={styles.ghostBtnText}>← Retake</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 24, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 20 },
  preview: { width: "100%", height: 380, borderRadius: 16, backgroundColor: "#e5e7eb", marginBottom: 16 },
  noImage: { alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 13, color: "#6b7280", lineHeight: 20, marginBottom: 24 },
  primaryBtn: { backgroundColor: "#1d4ed8", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 12 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabledBtn: { opacity: 0.5 },
  ghostBtn: { alignItems: "center", padding: 12 },
  ghostBtnText: { color: "#1d4ed8", fontSize: 15, fontWeight: "500" },
  successContainer: { flex: 1, backgroundColor: "#f9fafb", alignItems: "center", justifyContent: "center", padding: 32 },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 26, fontWeight: "700", color: "#111827", marginBottom: 8 },
  successSub: { fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22, marginBottom: 8 },
  docId: { fontSize: 12, color: "#9ca3af", marginBottom: 32 },
});
