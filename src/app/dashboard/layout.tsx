import type { ReactNode } from "react";
import { OrganizationSwitcher } from "@clerk/nextjs";

import { SiteHeader } from "@/components/site/site-header";

// Dashboard wraps every /dashboard/* route with the site chrome and an org
// switcher so the current org context is always visible. Access control
// (require-signed-in) is enforced at the proxy.ts edge — by the time this
// layout renders, auth() has already admitted the request.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="terminal-stage flex flex-1 items-start justify-center px-5 py-5 sm:py-6">
      <main className="site-shell w-full max-w-5xl p-5 sm:p-6 lg:p-7">
        <SiteHeader currentPath="/dashboard" />

        <div className="dashboard-toolbar mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="terminal-label mb-1">Workspace</p>
            <OrganizationSwitcher
              hidePersonal={false}
              afterSelectOrganizationUrl="/dashboard"
              afterSelectPersonalUrl="/dashboard"
              appearance={{
                elements: {
                  // Match the site's stark, square aesthetic.
                  rootBox: "font-[var(--font-linky-mono)]",
                  organizationSwitcherTrigger:
                    "rounded-none border border-[var(--panel-border)] bg-white px-3 py-1.5 text-sm hover:border-foreground",
                },
              }}
            />
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
