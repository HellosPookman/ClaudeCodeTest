"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import { matches } from "@/lib/api";
import type { Match } from "@/lib/types";

export default function ApprovalPage() {
  const [queue, setQueue] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    matches.pendingApproval().then((m) => { setQueue(m); setLoading(false); });
  }, []);

  async function approve(id: string) {
    setActing(id);
    await matches.approve(id);
    setQueue((prev) => prev.filter((m) => m.id !== id));
    setActing(null);
  }

  async function financeReject(id: string) {
    const reason = prompt("Rejection reason (finance):");
    if (!reason) return;
    setActing(id);
    await matches.financeReject(id, reason);
    setQueue((prev) => prev.filter((m) => m.id !== id));
    setActing(null);
  }

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Finance Approval</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {queue.length} pair{queue.length !== 1 ? "s" : ""} pending approval
          </p>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : queue.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <p className="text-green-700 font-medium">✓ No pairs pending approval</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {["Receipt", "Invoice", "Vendor", "Receipt Amt", "Invoice Amt", "Δ", "Status", "Warnings", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/documents/${m.receipt_document_id}`} className="text-blue-600 hover:underline text-xs">
                        {m.receipt?.original_file_name?.slice(0, 20) || m.receipt_document_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/documents/${m.invoice_document_id}`} className="text-blue-600 hover:underline text-xs">
                        {m.invoice?.invoice_number || m.invoice_document_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {m.invoice?.vendor_name || m.receipt?.vendor_name || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {m.receipt?.amount ? `¥${Number(m.receipt.amount).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {m.invoice?.amount ? `¥${Number(m.invoice.amount).toFixed(2)}` : "—"}
                    </td>
                    <td className={`px-4 py-3 font-medium ${
                      Number(m.amount_difference) > Number(m.allowed_difference) ? "text-red-600" : "text-green-600"
                    }`}>
                      {m.amount_difference != null ? `¥${Number(m.amount_difference).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} type="match" /></td>
                    <td className="px-4 py-3">
                      {m.warnings.filter(w => w.severity !== "info").length > 0 ? (
                        <span className="text-orange-600 text-xs">
                          {m.warnings.filter(w => w.severity !== "info").length} warning(s)
                        </span>
                      ) : (
                        <span className="text-green-600 text-xs">✓ None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/matches/${m.id}`}
                          className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                          View →
                        </Link>
                        <button
                          onClick={() => approve(m.id)}
                          disabled={acting === m.id}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded disabled:opacity-50 whitespace-nowrap"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => financeReject(m.id)}
                          disabled={acting === m.id}
                          className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded disabled:opacity-50 whitespace-nowrap"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
