"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { documents, matches } from "@/lib/api";
import type { Document, Match } from "@/lib/types";

interface Stats {
  total_docs: number;
  needs_review: number;
  pending_approval: number;
  auto_confirmed: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      documents.list({ limit: "5" }),
      matches.needsReview(),
      matches.pendingApproval(),
      matches.list({ status: "Auto-Confirmed", limit: "200" }),
    ]).then(([docs, review, approval, autoC]) => {
      setRecentDocs(docs.slice(0, 5));
      setStats({
        total_docs: docs.length,
        needs_review: review.length,
        pending_approval: approval.length,
        auto_confirmed: autoC.length,
      });
      setLoading(false);
    });
  }, []);

  const cards = [
    { label: "Needs Review", value: stats?.needs_review ?? "—", href: "/review", color: "text-orange-600" },
    { label: "Pending Approval", value: stats?.pending_approval ?? "—", href: "/approval", color: "text-blue-600" },
    { label: "Auto-Confirmed", value: stats?.auto_confirmed ?? "—", href: "/matches?status=Auto-Confirmed", color: "text-green-600" },
  ];

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {cards.map(({ label, value, href, color }) => (
            <Link key={label} href={href}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <p className="text-sm text-gray-500">{label}</p>
              <p className={`text-4xl font-bold mt-1 ${color}`}>{loading ? "…" : value}</p>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Upload Documents", href: "/upload" },
            { label: "Review Queue", href: "/review" },
            { label: "Finance Approval", href: "/approval" },
            { label: "Export Package", href: "/export" },
          ].map(({ label, href }) => (
            <Link key={label} href={href}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium text-center py-3 px-4 rounded-lg transition-colors">
              {label}
            </Link>
          ))}
        </div>

        {/* Recent documents */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Documents</h2>
            <Link href="/documents" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {loading ? (
            <p className="px-6 py-8 text-gray-400 text-sm">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  {["File", "Type", "Vendor", "Amount", "Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentDocs.map(doc => (
                  <tr key={doc.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 truncate max-w-xs">
                      <Link href={`/documents/${doc.id}`} className="hover:text-blue-600">
                        {doc.original_file_name || doc.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{doc.document_type}</td>
                    <td className="px-4 py-3 text-gray-600">{doc.vendor_name || "—"}</td>
                    <td className="px-4 py-3">{doc.amount ? `¥${doc.amount.toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === "Needs Review" ? "bg-orange-100 text-orange-700"
                        : doc.status === "Confirmed" ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>{doc.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
