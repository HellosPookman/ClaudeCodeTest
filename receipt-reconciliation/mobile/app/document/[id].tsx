import { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image,
  ActivityIndicator, TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getDocument, getSignedUrl } from "../../services/api";

type Doc = Awaited<ReturnType<typeof getDocument>>;

const CONFIDENCE_COLOR = (v?: number | null, threshold = 0.9) =>
  !v ? "#9ca3af" : v >= threshold ? "#16a34a" : "#ea580c";

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDocument(id).then(setDoc);
    getSignedUrl(id).then(setImageUrl).catch(() => null);
  }, [id]);

  if (!doc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  const fields: [string, string | undefined | null][] = [
    ["Type", doc.document_type],
    ["Vendor", doc.vendor_name],
    ["Amount", doc.amount ? `¥${doc.amount.toFixed(2)}` : undefined],
    ["Date", doc.document_date],
    ["Time", doc.document_time?.slice(0, 5)],
    ["Invoice #", doc.invoice_number],
    ["Tax", doc.tax_amount ? `¥${doc.tax_amount.toFixed(2)}` : undefined],
    ["Currency", doc.currency],
  ];

  const confidences: [string, number | undefined | null, number][] = [
    ["Amount", doc.amount_confidence, 0.95],
    ["Date", doc.date_confidence, 0.90],
    ["Time", doc.time_confidence, 0.90],
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={2}>
        {doc.original_file_name || doc.id}
      </Text>

      {/* Status */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>{doc.status}</Text>
        {doc.duplicate_type && (
          <Text style={styles.dupBadge}>⚠ {doc.duplicate_type.replace(/_/g, " ")}</Text>
        )}
      </View>

      {/* Image preview */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.preview} resizeMode="contain" />
      ) : (
        <View style={styles.noPreview}>
          <Text style={styles.noPreviewText}>📄 Preview not available</Text>
        </View>
      )}

      {/* Extracted fields */}
      <Text style={styles.sectionTitle}>Extracted Fields</Text>
      <View style={styles.card}>
        {fields.map(([label, value]) => (
          <View key={label} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue}>{value || "—"}</Text>
          </View>
        ))}
      </View>

      {/* Confidence */}
      <Text style={styles.sectionTitle}>OCR Confidence</Text>
      <View style={styles.card}>
        {confidences.map(([label, val, threshold]) => (
          <View key={label} style={styles.confRow}>
            <Text style={styles.confLabel}>{label}</Text>
            <View style={styles.confBarBg}>
              <View
                style={[
                  styles.confBar,
                  {
                    width: `${Math.round((val ?? 0) * 100)}%`,
                    backgroundColor: CONFIDENCE_COLOR(val, threshold),
                  },
                ]}
              />
            </View>
            <Text style={[styles.confPct, { color: CONFIDENCE_COLOR(val, threshold) }]}>
              {val != null ? `${Math.round(val * 100)}%` : "—"}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 15, color: "#1d4ed8", fontWeight: "500" },
  title: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8 },
  statusRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 16 },
  statusLabel: { fontSize: 13, fontWeight: "600", color: "#4f46e5", backgroundColor: "#eef2ff", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  dupBadge: { fontSize: 12, color: "#dc2626", backgroundColor: "#fee2e2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  preview: { width: "100%", height: 280, borderRadius: 12, backgroundColor: "#e5e7eb", marginBottom: 20 },
  noPreview: { height: 120, borderRadius: 12, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  noPreviewText: { color: "#9ca3af", fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#374151", marginBottom: 10 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#e5e7eb" },
  fieldRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  fieldLabel: { fontSize: 13, color: "#6b7280" },
  fieldValue: { fontSize: 13, fontWeight: "600", color: "#111827", maxWidth: "60%", textAlign: "right" },
  confRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  confLabel: { fontSize: 12, color: "#6b7280", width: 60 },
  confBarBg: { flex: 1, height: 6, backgroundColor: "#e5e7eb", borderRadius: 99, overflow: "hidden" },
  confBar: { height: "100%", borderRadius: 99 },
  confPct: { fontSize: 12, fontWeight: "600", width: 36, textAlign: "right" },
});
