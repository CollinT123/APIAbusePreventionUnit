"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/issues", label: "Issues" },
  { href: "/fixes", label: "Fixes" },
  { href: "/overview", label: "Overview" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-8 border-b border-zinc-800 bg-zinc-900/50 px-6"
      aria-label="Main navigation"
    >
      {TABS.map(({ href, label }) => {
        const isActive =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === "/issues" && pathname === "/");

        return (
          <Link
            key={href}
            href={href}
            className={`relative py-4 text-sm font-medium transition-colors hover:text-zinc-100 ${
              isActive ? "text-zinc-100" : "text-zinc-500"
            }`}
          >
            {label}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
