"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/documents", label: "Documents" },
  { href: "/review", label: "Review Queue" },
  { href: "/approval", label: "Approval" },
  { href: "/export", label: "Export" },
  { href: "/archive", label: "Archive" },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-6">
        <span className="font-bold text-blue-700 text-sm shrink-0">
          发票对账
        </span>
        <div className="flex gap-1 overflow-x-auto flex-1">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                path.startsWith(href)
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-gray-800 shrink-0"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
