"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import ConfidenceBar from "@/components/ConfidenceBar";
import { documents } from "@/lib/api";
import type { Document } from "@/lib/types";

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Document | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Document>>({});
  const [saving, setSaving] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    documents.get(id).then(setDoc);
    documents.signedUrl(id).then((r) => setSignedUrl(r.url));
  }, [id]);

  function startEdit() {
    if (!doc) return;
    setForm({
      vendor_name: doc.vendor_name,
      amount: doc.amount,
      document_date: doc.document_date,
      document_time: doc.document_time,
      invoice_number: doc.invoice_number,
      tax_amount: doc.tax_amount,
    });
    setEditMode(true);
  }

  async function saveEdit() {
    setSaving(true);
    setError("");
    try {
      const updated = await documents.update(id, form);
      setDoc(updated);
      setEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!doc) {
    return (
      <>
        <NavBar />
        <main className="max-w-5xl mx-auto px-4 py-8 text-gray-400">Loading…</main>
      </>
    );
  }

  const field = (label: string, value: string | undefined | null, edit?: React.ReactNode) => (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      {editMode && edit ? edit : (
        <p className="text-sm font-medium text-gray-900">{value || "—"}</p>
      )}
    </div>
  );

  const input = (key: keyof Document, type = "text") => (
    <input
      type={type}
      value={String(form[key] ?? "")}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value || undefined }))}
      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
    />
  );

  return (
    <>
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline mb-2 block">
              ← Back
            </button>
            <h1 className="text-xl font-bold text-gray-900">
              {doc.original_file_name || doc.id}
            </h1>
          </div>
          <StatusBadge status={doc.status} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Document preview */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
              Document Preview
            </div>
            {signedUrl ? (
              doc.mime_type === "application/pdf" ? (
                <iframe src={signedUrl} className="w-full h-96" />
              ) : (
                <img src={signedUrl} alt="Document" className="w-full object-contain max-h-96" />
              )
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-400">Loading preview…</div>
            )}
          </div>

          {/* Extracted fields */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Extracted Fields</h2>
                {!editMode ? (
                  <button onClick={startEdit} className="text-sm text-blue-600 hover:underline">Edit</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditMode(false)} className="text-sm text-gray-500 hover:underline">Cancel</button>
                    <button onClick={saveEdit} disabled={saving}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
              <div className="grid grid-cols-2 gap-4">
                {field("Type", doc.document_type)}
                {field("Vendor", doc.vendor_name, input("vendor_name"))}
                {field("Amount", doc.amount ? `¥${Number(doc.amount).toFixed(2)}` : undefined,
                  input("amount", "number"))}
                {field("Tax Amount", doc.tax_amount ? `¥${Number(doc.tax_amount).toFixed(2)}` : undefined,
                  input("tax_amount", "number"))}
                {field("Date", doc.document_date, input("document_date", "date"))}
                {field("Time", doc.document_time, input("document_time", "time"))}
                {field("Invoice #", doc.invoice_number, input("invoice_number"))}
                {field("Currency", doc.currency)}
                {field("Language", doc.language_detected)}
              </div>
              {doc.duplicate_type && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700 font-medium">
                    ⚠ Duplicate detected: {doc.duplicate_type.replace(/_/g, " ")}
                  </p>
                </div>
              )}
            </div>

            {/* Confidence */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">OCR Confidence</h2>
              <div className="space-y-2">
                <ConfidenceBar value={doc.amount_confidence} label="Amount" threshold={0.95} />
                <ConfidenceBar value={doc.date_confidence} label="Date" threshold={0.90} />
                <ConfidenceBar value={doc.time_confidence} label="Time" threshold={0.90} />
                {doc.document_type === "invoice" && (
                  <ConfidenceBar value={doc.invoice_number_confidence} label="Invoice #" threshold={0.95} />
                )}
                <ConfidenceBar value={doc.extraction_confidence} label="Overall" threshold={0.90} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
