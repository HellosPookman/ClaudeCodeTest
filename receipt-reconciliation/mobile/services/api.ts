import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const BASE: string =
  Constants.expoConfig?.extra?.apiUrl ?? "http://localhost:8000";

const TOKEN_KEY = "auth_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || res.statusText);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<void> {
  const form = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  const data = await res.json();
  await setToken(data.access_token);
}

export async function me() {
  return request<{ id: string; name: string; email: string; role: string }>("/auth/me");
}

// ── Documents ─────────────────────────────────────────────────────────────────
export async function uploadReceipt(
  imageUri: string,
  mimeType = "image/jpeg",
  fileName = "receipt.jpg"
): Promise<{ id: string; status: string }> {
  const form = new FormData();
  form.append("file", { uri: imageUri, type: mimeType, name: fileName } as unknown as Blob);
  return request("/documents/mobile-capture", { method: "POST", body: form, headers: {} });
}

export async function listDocuments(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request<Array<{
    id: string;
    document_type: string;
    original_file_name?: string;
    vendor_name?: string;
    amount?: number;
    document_date?: string;
    status: string;
    thumbnail_url?: string;
  }>>(`/documents${qs ? "?" + qs : ""}`);
}

export async function getDocument(id: string) {
  return request<{
    id: string;
    document_type: string;
    original_file_name?: string;
    vendor_name?: string;
    amount?: number;
    currency?: string;
    document_date?: string;
    document_time?: string;
    invoice_number?: string;
    tax_amount?: number;
    status: string;
    duplicate_type?: string;
    amount_confidence?: number;
    date_confidence?: number;
    time_confidence?: number;
  }>(`/documents/${id}`);
}

export async function getSignedUrl(id: string): Promise<string> {
  const res = await request<{ url: string }>(`/documents/${id}/signed-url`);
  return res.url;
}
