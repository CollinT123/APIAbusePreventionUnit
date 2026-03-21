"use client";

import { useBackendStatus } from "@/lib/hooks";
import { NavTabs } from "./NavTabs";
import { PageTransition } from "./PageTransition";

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const { anyDown } = useBackendStatus();
  return (
    <div
      className={`flex flex-1 flex-col transition-[padding] duration-200 ${
        anyDown ? "pt-24" : "pt-14"
      }`}
    >
      <NavTabs />
      <PageTransition>
        <main className="flex-1 p-6">{children}</main>
      </PageTransition>
    </div>
  );
}
