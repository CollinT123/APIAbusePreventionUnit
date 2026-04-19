"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs() {
  const pathname = usePathname();

  // Path like /route/api/users/:id for route detail
  const isRouteDetail = pathname.startsWith("/route/");

  const routePath = isRouteDetail
    ? "/" + pathname.slice("/route".length).split("/").map(decodeURIComponent).filter(Boolean).join("/")
    : "";

  return (
    <nav
      className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-6 py-3"
      aria-label="Breadcrumb"
    >
      {isRouteDetail ? (
        <>
          <Link
            href="/"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            All Routes
          </Link>
          <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden />
          <span className="font-mono text-sm text-zinc-100 truncate max-w-[400px]">
            {routePath}
          </span>
        </>
      ) : (
        <span className="text-sm text-zinc-100">All Routes</span>
      )}
    </nav>
  );
}
