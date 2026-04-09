import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { uploadReceipt } from "../../services/api";

export default function HomeScreen() {
  const router = useRouter();

  async function openCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Camera access is needed to capture receipts.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets[0]) {
      router.push({ pathname: "/upload-preview", params: { uri: result.assets[0].uri } });
    }
  }

  async function openGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Photo library access is needed.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) {
      router.push({ pathname: "/upload-preview", params: { uri: result.assets[0].uri } });
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receipt Capture</Text>
      <Text style={styles.subtitle}>发票对账 · Reconciliation</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={openCamera}>
          <Text style={styles.btnIcon}>📷</Text>
          <Text style={styles.primaryBtnText}>Capture Receipt</Text>
          <Text style={styles.primaryBtnSub}>Take a photo with camera</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.secondaryBtn]} onPress={openGallery}>
          <Text style={styles.btnIcon}>🖼</Text>
          <Text style={styles.secondaryBtnText}>Upload from Library</Text>
          <Text style={styles.secondaryBtnSub}>Choose an existing image or PDF</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.ghostBtn]}
          onPress={() => router.push("/documents")}
        >
          <Text style={styles.ghostBtnText}>View My Documents →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 48,
  },
  actions: {
    gap: 12,
  },
  btn: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  btnIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: "#1d4ed8",
  },
  primaryBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  primaryBtnSub: {
    fontSize: 13,
    color: "#bfdbfe",
    marginTop: 2,
  },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#d1d5db",
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  secondaryBtnSub: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  ghostBtn: {
    backgroundColor: "transparent",
    paddingVertical: 12,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1d4ed8",
  },
});
