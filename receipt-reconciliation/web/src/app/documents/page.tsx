"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import StatusBadge from "@/components/StatusBadge";
import { documents } from "@/lib/api";
import type { Document } from "@/lib/types";
import { format } from "date-fns";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const params: Record<string, string> = { limit: "100" };
    if (typeFilter) params.document_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    if (search) params.search = search;

    setLoading(true);
    documents.list(params).then((d) => {
      setDocs(d);
      setLoading(false);
    });
  }, [search, typeFilter, statusFilter]);

  const DOC_STATUSES = [
    "Uploaded","Processing","Extracted","Low Confidence",
    "Needs Review","Matched","Confirmed","Approved","Exported","Archived",
  ];

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <Link href="/upload"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            + Upload
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            placeholder="Search vendor, invoice #, filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">All types</option>
            <option value="receipt">Receipt</option>
            <option value="invoice">Invoice</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">All statuses</option>
            {DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-gray-400 text-sm">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">No documents found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    {["Thumbnail","File","Type","Vendor","Amount","Date","Invoice #","Status","Duplicate"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {doc.thumbnail_url ? (
                          <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden">
                            <img src={doc.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-lg">
                            {doc.document_type === "invoice" ? "🧾" : "📄"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <Link href={`/documents/${doc.id}`} className="text-blue-600 hover:underline truncate block">
                          {doc.original_file_name || doc.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 capitalize text-gray-600">{doc.document_type}</td>
                      <td className="px-4 py-2 text-gray-600">{doc.vendor_name || "—"}</td>
                      <td className="px-4 py-2 font-medium">
                        {doc.amount ? `¥${Number(doc.amount).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                        {doc.document_date
                          ? format(new Date(doc.document_date), "MM/dd/yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{doc.invoice_number || "—"}</td>
                      <td className="px-4 py-2"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-2">
                        {doc.duplicate_type && (
                          <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            {doc.duplicate_type.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
