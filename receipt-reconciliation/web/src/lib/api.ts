import Cookies from "js-cookie";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = Cookies.get("token");
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
    throw new ApiError(res.status, detail.detail || res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    return request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: form.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
  me: () => request<import("./types").User>("/auth/me"),
  logout: () => {
    Cookies.remove("token");
    window.location.href = "/login";
  },
};

// ── Documents ─────────────────────────────────────────────────────────────────
export const documents = {
  upload: (files: File[], documentType?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (documentType) form.append("document_type", documentType);
    return request<import("./types").Document[]>("/documents/upload", {
      method: "POST",
      body: form,
      headers: {},
    });
  },
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<import("./types").Document[]>(`/documents${qs}`);
  },
  get: (id: string) => request<import("./types").Document>(`/documents/${id}`),
  signedUrl: (id: string) =>
    request<{ url: string }>(`/documents/${id}/signed-url`),
  update: (id: string, data: Record<string, unknown>) =>
    request<import("./types").Document>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  recheckDuplicates: (id: string) =>
    request<{ duplicate_type: string | null }>(`/documents/${id}/recheck-duplicates`, {
      method: "POST",
    }),
  delete: (id: string) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),
};

// ── Matches ───────────────────────────────────────────────────────────────────
export const matches = {
  list: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<import("./types").Match[]>(`/matches${qs}`);
  },
  needsReview: () => request<import("./types").Match[]>("/matches/needs-review"),
  pendingApproval: () =>
    request<import("./types").Match[]>("/matches/pending-approval"),
  get: (id: string) => request<import("./types").Match>(`/matches/${id}`),
  run: (documentIds?: string[]) =>
    request<{ matches_created: number }>("/matches/run", {
      method: "POST",
      body: JSON.stringify(documentIds ? { document_ids: documentIds } : {}),
    }),
  confirm: (id: string) =>
    request<import("./types").Match>(`/matches/${id}/confirm`, { method: "POST" }),
  reject: (id: string, reason: string) =>
    request<import("./types").Match>(`/matches/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  approve: (id: string) =>
    request<import("./types").Match>(`/matches/${id}/approve`, { method: "POST" }),
  financeReject: (id: string, reason: string) =>
    request<import("./types").Match>(`/matches/${id}/finance-reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  bulkConfirm: (ids: string[]) =>
    request<{ confirmed: string[] }>("/matches/bulk-confirm", {
      method: "POST",
      body: JSON.stringify({ match_ids: ids }),
    }),
  bulkReject: (ids: string[], reason?: string) =>
    request<{ rejected: string[] }>("/matches/bulk-reject", {
      method: "POST",
      body: JSON.stringify({ match_ids: ids, reason }),
    }),
};

// ── Packages ──────────────────────────────────────────────────────────────────
export const packages = {
  create: (matchIds: string[], packageName?: string) =>
    request<import("./types").ExportPackage>("/packages", {
      method: "POST",
      body: JSON.stringify({ match_ids: matchIds, package_name: packageName }),
    }),
  list: () => request<import("./types").ExportPackage[]>("/packages"),
  get: (id: string) =>
    request<import("./types").ExportPackage>(`/packages/${id}`),
  downloadUrl: (id: string) => `${BASE}/packages/${id}/download`,
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const admin = {
  getSettings: () =>
    request<import("./types").AppSettings>("/admin/settings"),
  updateSettings: (data: Partial<import("./types").AppSettings>) =>
    request<import("./types").AppSettings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  getAuditLogs: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<unknown[]>(`/admin/audit-logs${qs}`);
  },
  listUsers: () => request<import("./types").User[]>("/admin/users"),
};
