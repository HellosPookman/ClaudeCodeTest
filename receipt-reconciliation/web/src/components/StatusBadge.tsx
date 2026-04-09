import type { DocumentStatus, MatchStatus } from "@/lib/types";

const DOC_COLORS: Record<string, string> = {
  Uploaded: "bg-gray-100 text-gray-700",
  Processing: "bg-blue-100 text-blue-700 animate-pulse",
  Extracted: "bg-indigo-100 text-indigo-700",
  "Low Confidence": "bg-yellow-100 text-yellow-800",
  "Needs Review": "bg-orange-100 text-orange-800",
  Matched: "bg-cyan-100 text-cyan-800",
  Confirmed: "bg-emerald-100 text-emerald-800",
  Approved: "bg-green-100 text-green-800",
  Exported: "bg-purple-100 text-purple-800",
  Archived: "bg-gray-200 text-gray-600",
};

const MATCH_COLORS: Record<string, string> = {
  Suggested: "bg-blue-100 text-blue-700",
  "Auto-Confirmed": "bg-emerald-100 text-emerald-800",
  "Manually Confirmed": "bg-teal-100 text-teal-800",
  Rejected: "bg-red-100 text-red-700",
  "Needs Review": "bg-orange-100 text-orange-800",
  Approved: "bg-green-100 text-green-800",
  Exported: "bg-purple-100 text-purple-800",
};

interface Props {
  status: DocumentStatus | MatchStatus;
  type?: "document" | "match";
}

export default function StatusBadge({ status, type = "document" }: Props) {
  const map = type === "match" ? MATCH_COLORS : DOC_COLORS;
  const cls = map[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
