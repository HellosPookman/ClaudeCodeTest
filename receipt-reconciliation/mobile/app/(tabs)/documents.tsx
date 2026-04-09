import { useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { listDocuments } from "../../services/api";

type Doc = {
  id: string;
  document_type: string;
  original_file_name?: string;
  vendor_name?: string;
  amount?: number;
  document_date?: string;
  status: string;
};

const STATUS_COLOR: Record<string, string> = {
  Uploaded: "#6b7280",
  Processing: "#2563eb",
  Extracted: "#4f46e5",
  "Low Confidence": "#d97706",
  "Needs Review": "#ea580c",
  Matched: "#0891b2",
  Confirmed: "#059669",
  Approved: "#16a34a",
  Exported: "#7c3aed",
  Archived: "#9ca3af",
};

export default function DocumentsTab() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const params: Record<string, string> = { limit: "50" };
    if (search) params.search = search;
    const data = await listDocuments(params);
    setDocs(data);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [search]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Documents</Text>
      <TextInput
        style={styles.search}
        placeholder="Search vendor, invoice #…"
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#9ca3af"
      />
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? "Loading…" : "No documents found."}</Text>
        }
        renderItem={({ item: doc }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/document/${doc.id}`)}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardIcon}>{doc.document_type === "invoice" ? "🧾" : "📄"}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {doc.vendor_name || doc.original_file_name || doc.id.slice(0, 8)}
              </Text>
              <Text style={styles.cardMeta}>
                {doc.amount ? `¥${doc.amount.toFixed(2)}` : "—"}
                {doc.document_date ? `  ·  ${doc.document_date}` : ""}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[doc.status] || "#6b7280") + "22" }]}>
              <Text style={[styles.statusText, { color: STATUS_COLOR[doc.status] || "#6b7280" }]}>
                {doc.status}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", paddingTop: 60, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 12 },
  search: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: "#111827", marginBottom: 12,
  },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 48, fontSize: 14 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, marginBottom: 8,
    padding: 14, flexDirection: "row", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  cardLeft: { marginRight: 12 },
  cardIcon: { fontSize: 28 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  cardMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "600" },
});
