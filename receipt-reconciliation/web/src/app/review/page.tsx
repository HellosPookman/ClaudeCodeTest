"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import { matches } from "@/lib/api";
import type { Match } from "@/lib/types";

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);

  useEffect(() => {
    matches.needsReview().then((m) => { setQueue(m); setLoading(false); });
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkConfirm() {
    if (!selected.size) return;
    setActing(true);
    await matches.bulkConfirm([...selected]);
    const refreshed = await matches.needsReview();
    setQueue(refreshed);
    setSelected(new Set());
    setActing(false);
  }

  async function bulkReject() {
    if (!selected.size) return;
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    setActing(true);
    await matches.bulkReject([...selected], reason);
    const refreshed = await matches.needsReview();
    setQueue(refreshed);
    setSelected(new Set());
    setActing(false);
  }

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
            <p className="text-sm text-gray-500 mt-0.5">{queue.length} match{queue.length !== 1 ? "es" : ""} need review</p>
          </div>
          {selected.size > 0 && (
            <div className="flex gap-2">
              <button onClick={bulkConfirm} disabled={acting}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                Confirm {selected.size} selected
              </button>
              <button onClick={bulkReject} disabled={acting}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                Reject {selected.size} selected
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : queue.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <p className="text-green-700 font-medium">✓ Review queue is empty</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((m) => (
              <div key={m.id}
                className={`bg-white rounded-xl border p-5 transition-all ${
                  selected.has(m.id) ? "border-blue-400 ring-1 ring-blue-300" : "border-gray-200"
                }`}
              >
                <div className="flex items-start gap-4">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)}
                    className="mt-1 rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <StatusBadge status={m.status} type="match" />
                      {m.confidence_level && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.confidence_level === "high" ? "bg-green-100 text-green-700"
                          : m.confidence_level === "medium" ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                        }`}>
                          {m.confidence_level} confidence · {m.match_score?.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                      <div>
                        <p className="text-xs text-gray-400">Receipt</p>
                        <p className="font-medium">{m.receipt?.vendor_name || m.receipt?.original_file_name || "—"}</p>
                        <p className="text-gray-600">{m.receipt?.amount ? `¥${Number(m.receipt.amount).toFixed(2)}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Invoice</p>
                        <p className="font-medium">{m.invoice?.vendor_name || m.invoice?.original_file_name || "—"}</p>
                        <p className="text-gray-600">{m.invoice?.amount ? `¥${Number(m.invoice.amount).toFixed(2)}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Amount diff</p>
                        <p className={`font-medium ${Number(m.amount_difference) > Number(m.allowed_difference) ? "text-red-600" : "text-green-600"}`}>
                          {m.amount_difference != null ? `¥${Number(m.amount_difference).toFixed(2)}` : "—"}
                        </p>
                        <p className="text-xs text-gray-400">allowed: ¥{Number(m.allowed_difference ?? 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Invoice #</p>
                        <p className="font-medium">{m.invoice?.invoice_number || "—"}</p>
                      </div>
                    </div>
                    {m.warnings.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {m.warnings.map((w) => (
                          <span key={w.id} className={`text-xs px-2 py-0.5 rounded ${
                            w.severity === "critical" ? "bg-red-100 text-red-700"
                            : w.severity === "warning" ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>
                            {w.severity === "critical" ? "🔴" : w.severity === "warning" ? "🟠" : "ℹ"} {w.warning_message}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link href={`/matches/${m.id}`}
                    className="shrink-0 text-sm text-blue-600 hover:underline">
                    Review →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
