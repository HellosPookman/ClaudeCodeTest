export type DocumentType = "receipt" | "invoice";
export type DocumentStatus =
  | "Uploaded" | "Processing" | "Extracted" | "Low Confidence"
  | "Needs Review" | "Matched" | "Confirmed" | "Approved" | "Exported" | "Archived";
export type MatchStatus =
  | "Suggested" | "Auto-Confirmed" | "Manually Confirmed"
  | "Rejected" | "Needs Review" | "Approved" | "Exported";
export type UserRole = "reviewer" | "approver" | "admin";
export type ConfidenceLevel = "high" | "medium" | "low";
export type WarningSeverity = "info" | "warning" | "critical";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  document_type: DocumentType;
  source_type: string;
  original_file_name?: string;
  mime_type?: string;
  file_url: string;
  thumbnail_url?: string;
  language_detected?: string;
  vendor_name?: string;
  amount?: number;
  currency?: string;
  document_date?: string;
  document_time?: string;
  invoice_number?: string;
  tax_amount?: number;
  extraction_confidence?: number;
  amount_confidence?: number;
  date_confidence?: number;
  time_confidence?: number;
  invoice_number_confidence?: number;
  duplicate_type?: string;
  status: DocumentStatus;
  uploaded_by: string;
  reviewed_by?: string;
  uploaded_at: string;
  reviewed_at?: string;
  approved_at?: string;
}

export interface MatchWarning {
  id: string;
  warning_type: string;
  warning_message: string;
  severity: WarningSeverity;
}

export interface Match {
  id: string;
  receipt_document_id: string;
  invoice_document_id: string;
  amount_difference?: number;
  allowed_difference?: number;
  vendor_similarity?: number;
  time_difference_minutes?: number;
  match_score?: number;
  confidence_level?: ConfidenceLevel;
  status: MatchStatus;
  auto_confirmed: boolean;
  confirmed_by?: string;
  approved_by?: string;
  rejection_reason?: string;
  created_at: string;
  confirmed_at?: string;
  approved_at?: string;
  warnings: MatchWarning[];
  receipt?: Document;
  invoice?: Document;
}

export interface ExportPackage {
  id: string;
  package_name: string;
  pdf_url?: string;
  created_by: string;
  created_at: string;
  status: "generating" | "ready" | "failed";
  total_pairs: number;
  total_amount?: number;
  items?: PackageItem[];
}

export interface PackageItem {
  id: string;
  match_id: string;
  page_number?: number;
}

export interface AppSettings {
  amount_tolerance_fixed: number;
  amount_tolerance_pct: number;
  ocr_confidence_amount: number;
  ocr_confidence_date: number;
  ocr_confidence_time: number;
  ocr_confidence_invoice_number: number;
  batch_upload_threshold: number;
  retention_days: number;
  company_name: string;
}
