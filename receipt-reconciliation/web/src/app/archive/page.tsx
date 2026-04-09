"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import { documents } from "@/lib/api";
import type { Document } from "@/lib/types";

export default function ArchivePage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    const params: Record<string, string> = { status: "Archived", limit: "200" };
    if (typeFilter) params.document_type = typeFilter;
    if (search) params.search = search;
    setLoading(true);
    documents.list(params).then((d) => { setDocs(d); setLoading(false); });
  }, [search, typeFilter]);

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Archive</h1>
        <p className="text-sm text-gray-500 mb-6">
          Documents exported and retained for 90 days.
        </p>

        <div className="flex gap-3 mb-4">
          <input
            placeholder="Search vendor, invoice #, filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All types</option>
            <option value="receipt">Receipt</option>
            <option value="invoice">Invoice</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-gray-400 text-sm">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">No archived documents found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {["File","Type","Vendor","Amount","Invoice #","Date","Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/documents/${doc.id}`} className="text-blue-600 hover:underline">
                        {doc.original_file_name || doc.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">{doc.document_type}</td>
                    <td className="px-4 py-3 text-gray-600">{doc.vendor_name || "—"}</td>
                    <td className="px-4 py-3">{doc.amount ? `¥${Number(doc.amount).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{doc.invoice_number || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{doc.document_date || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
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
