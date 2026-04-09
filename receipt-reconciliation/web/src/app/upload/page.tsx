"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import NavBar from "@/components/NavBar";
import { documents } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import type { Document } from "@/lib/types";

type UploadedDoc = Document & { _uploading?: boolean };

export default function UploadPage() {
  const [docType, setDocType] = useState<"receipt" | "invoice">("invoice");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadedDoc[]>([]);
  const [error, setError] = useState("");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setUploading(true);
    setError("");
    try {
      const docs = await documents.upload(acceptedFiles, docType);
      setResults((prev) => [...docs, ...prev]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [docType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [], "image/png": [], "image/webp": [],
      "image/heic": [], "application/pdf": [],
    },
    multiple: true,
  });

  return (
    <>
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Documents</h1>

        {/* Document type selector */}
        <div className="flex gap-3 mb-6">
          {(["receipt", "invoice"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDocType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                docType === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
              }`}
            >
              {t === "receipt" ? "Receipt / 小票" : "Invoice / 发票"}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300"
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-4xl mb-3">📄</div>
          {isDragActive ? (
            <p className="text-blue-600 font-medium">Drop files here…</p>
          ) : (
            <>
              <p className="text-gray-700 font-medium">Drag & drop files here</p>
              <p className="text-sm text-gray-400 mt-1">
                or click to browse · JPG, PNG, WEBP, HEIC, PDF · max 20 MB each
              </p>
            </>
          )}
        </div>

        {uploading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Uploading and queuing for OCR…
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
              Uploaded ({results.length})
            </div>
            <ul className="divide-y divide-gray-50">
              {results.map((doc) => (
                <li key={doc.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.original_file_name || doc.id}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {doc.document_type} · {doc.amount ? `¥${Number(doc.amount).toFixed(2)}` : "extracting…"}
                    </p>
                  </div>
                  <StatusBadge status={doc.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}
