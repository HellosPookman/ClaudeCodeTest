"use client";
import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { matches, packages } from "@/lib/api";
import type { Match, ExportPackage } from "@/lib/types";

export default function ExportPage() {
  const [approved, setApproved] = useState<Match[]>([]);
  const [history, setHistory] = useState<ExportPackage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [packageName, setPackageName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      matches.list({ status: "Approved", limit: "200" }),
      packages.list(),
    ]).then(([m, p]) => {
      setApproved(m);
      setHistory(p);
      setLoading(false);
    });
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(approved.map((m) => m.id)));
  }

  async function createPackage() {
    if (!selected.size) return;
    setCreating(true);
    setError("");
    try {
      const pkg = await packages.create([...selected], packageName || undefined);
      setHistory((prev) => [pkg, ...prev]);
      setSelected(new Set());
      setPackageName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create package");
    } finally {
      setCreating(false);
    }
  }

  const totalSelected = approved
    .filter((m) => selected.has(m.id))
    .reduce((sum, m) => sum + Number(m.invoice?.amount ?? 0), 0);

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Export Packages</h1>

        {/* Package builder */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Build New Package</h2>
          <div className="flex gap-3 mb-4 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Package name (optional)</label>
              <input
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="Auto-generated if blank"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button onClick={selectAll} className="text-sm text-blue-600 hover:underline">
              Select all ({approved.length})
            </button>
            {selected.size > 0 && (
              <button
                onClick={createPackage}
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {creating ? "Creating…" : `Create package (${selected.size} pairs · ¥${totalSelected.toFixed(2)})`}
              </button>
            )}
          </div>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : approved.length === 0 ? (
            <p className="text-gray-400 text-sm">No approved pairs available for export.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox"
                        checked={selected.size === approved.length}
                        onChange={(e) => e.target.checked ? selectAll() : setSelected(new Set())}
                      />
                    </th>
                    {["Vendor","Receipt Amt","Invoice Amt","Invoice #","Date"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {approved.map((m) => (
                    <tr key={m.id} className={`border-t border-gray-50 ${selected.has(m.id) ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                      </td>
                      <td className="px-3 py-2">{m.invoice?.vendor_name || m.receipt?.vendor_name || "—"}</td>
                      <td className="px-3 py-2">{m.receipt?.amount ? `¥${Number(m.receipt.amount).toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2">{m.invoice?.amount ? `¥${Number(m.invoice.amount).toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2">{m.invoice?.invoice_number || "—"}</td>
                      <td className="px-3 py-2">{m.invoice?.document_date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Export history */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Export History</h2>
          </div>
          {history.length === 0 ? (
            <p className="px-6 py-6 text-gray-400 text-sm">No packages exported yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  {["Package Name","Pairs","Total Amount","Status","Created","Download"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((pkg) => (
                  <tr key={pkg.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{pkg.package_name}</td>
                    <td className="px-4 py-3">{pkg.total_pairs}</td>
                    <td className="px-4 py-3">¥{Number(pkg.total_amount ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        pkg.status === "ready" ? "bg-green-100 text-green-700"
                        : pkg.status === "generating" ? "bg-blue-100 text-blue-700 animate-pulse"
                        : "bg-red-100 text-red-700"
                      }`}>{pkg.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(pkg.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {pkg.status === "ready" ? (
                        <a href={packages.downloadUrl(pkg.id)}
                          className="text-blue-600 hover:underline text-xs font-medium"
                          download>
                          Download PDF
                        </a>
                      ) : "—"}
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
