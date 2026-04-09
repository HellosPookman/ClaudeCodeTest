"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import ConfidenceBar from "@/components/ConfidenceBar";
import { matches, documents } from "@/lib/api";
import type { Match, Document } from "@/lib/types";

function DocPanel({ doc, label }: { doc: Document; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    documents.signedUrl(doc.id).then((r) => setUrl(r.url));
  }, [doc.id]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="font-semibold text-gray-900">{label}</span>
        <StatusBadge status={doc.status} />
      </div>
      {url ? (
        doc.mime_type === "application/pdf" ? (
          <iframe src={url} className="w-full h-72" />
        ) : (
          <img src={url} alt={label} className="w-full max-h-72 object-contain" />
        )
      ) : (
        <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      )}
      <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
        {[
          ["Vendor", doc.vendor_name],
          ["Amount", doc.amount ? `¥${Number(doc.amount).toFixed(2)}` : undefined],
          ["Date", doc.document_date],
          ["Time", doc.document_time?.slice(0, 5)],
          ["Invoice #", doc.invoice_number],
          ["Tax", doc.tax_amount ? `¥${Number(doc.tax_amount).toFixed(2)}` : undefined],
        ].map(([lbl, val]) => (
          <div key={lbl}>
            <p className="text-xs text-gray-400">{lbl}</p>
            <p className="font-medium">{val || "—"}</p>
          </div>
        ))}
        <div className="col-span-2 space-y-1.5 mt-1">
          <ConfidenceBar value={doc.amount_confidence} label="Amount" threshold={0.95} />
          <ConfidenceBar value={doc.date_confidence} label="Date" threshold={0.90} />
          <ConfidenceBar value={doc.time_confidence} label="Time" threshold={0.90} />
          {doc.document_type === "invoice" && (
            <ConfidenceBar value={doc.invoice_number_confidence} label="Invoice #" threshold={0.95} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    matches.get(id).then((m) => { setMatch(m); setLoading(false); });
  }, [id]);

  async function confirm() {
    setActing(true);
    const updated = await matches.confirm(id);
    setMatch(updated);
    setActing(false);
  }

  async function reject() {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    setActing(true);
    const updated = await matches.reject(id, reason);
    setMatch(updated);
    setActing(false);
  }

  if (loading || !match) {
    return <><NavBar /><main className="max-w-7xl mx-auto px-4 py-8 text-gray-400">Loading…</main></>;
  }

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline mb-4 block">
          ← Back to Review Queue
        </button>

        {/* Match header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={match.status} type="match" />
              {match.confidence_level && (
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                  match.confidence_level === "high" ? "bg-green-100 text-green-700"
                  : match.confidence_level === "medium" ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
                }`}>
                  {match.confidence_level} confidence · Score {match.match_score?.toFixed(1)}
                </span>
              )}
            </div>
            {match.status === "Suggested" || match.status === "Needs Review" ? (
              <div className="flex gap-2">
                <button onClick={confirm} disabled={acting}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                  ✓ Confirm Match
                </button>
                <button onClick={reject} disabled={acting}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                  ✗ Reject Match
                </button>
              </div>
            ) : match.status === "Rejected" && match.rejection_reason ? (
              <p className="text-sm text-red-600">Rejected: {match.rejection_reason}</p>
            ) : null}
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-100">
            {[
              ["Amount Δ", match.amount_difference != null ? `¥${Number(match.amount_difference).toFixed(2)}` : "—",
               Number(match.amount_difference) <= Number(match.allowed_difference) ? "text-green-600" : "text-red-600"],
              ["Allowed Δ", `¥${Number(match.allowed_difference ?? 0).toFixed(2)}`, "text-gray-700"],
              ["Vendor sim.", match.vendor_similarity != null ? `${(Number(match.vendor_similarity)*100).toFixed(0)}%` : "—", "text-gray-700"],
              ["Time Δ", match.time_difference_minutes != null ? `${match.time_difference_minutes} min` : "—", "text-gray-700"],
              ["Auto-confirmed", match.auto_confirmed ? "Yes" : "No",
               match.auto_confirmed ? "text-green-600" : "text-gray-500"],
            ].map(([lbl, val, cls]) => (
              <div key={lbl} className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">{lbl}</p>
                <p className={`text-sm font-semibold ${cls}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Warnings */}
          {match.warnings.length > 0 && (
            <div className="mt-4 space-y-1">
              {match.warnings.map((w) => (
                <p key={w.id} className={`text-sm flex items-start gap-1.5 ${
                  w.severity === "critical" ? "text-red-600"
                  : w.severity === "warning" ? "text-orange-600"
                  : "text-gray-500"
                }`}>
                  <span>{w.severity === "critical" ? "🔴" : w.severity === "warning" ? "🟠" : "ℹ"}</span>
                  {w.warning_message}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Side-by-side documents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {match.receipt && <DocPanel doc={match.receipt} label="Receipt / 小票" />}
          {match.invoice && <DocPanel doc={match.invoice} label="Invoice / 发票" />}
        </div>
      </main>
    </>
  );
}
