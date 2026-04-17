import type { ReactNode } from "react";
import { OrganizationSwitcher } from "@clerk/nextjs";

import { SiteHeader } from "@/components/site/site-header";
import { getAuthSubject } from "@/lib/server/auth";
import {
  getOrganizationNameByClerkId,
  getUserDisplayNameByClerkId,
} from "@/lib/server/identity-repository";

// Dashboard wraps every /dashboard/* route with the site chrome and an org
// switcher so the current org context is always visible. Access control
// (require-signed-in) is enforced at the proxy.ts edge — by the time this
// layout renders, auth() has already admitted the request.
//
// We resolve the active subject here (instead of in every page) so the
// workspace context pill is consistent across list, edit, and any future
// dashboard subroute. Clerk caches auth() inside a single request so this
// does not duplicate work when a child page also calls getAuthSubject().
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const subject = await getAuthSubject();

  // Layout is only reached when proxy.ts has admitted the request, so the
  // subject is guaranteed non-anonymous in practice. We still handle it to
  // keep the type narrow for the JSX below without ! assertions.
  const contextLabel = await resolveContextLabel(subject);

  return (
    <div className="terminal-stage flex flex-1 items-start justify-center px-5 py-5 sm:py-6">
      <main className="site-shell w-full max-w-5xl p-5 sm:p-6 lg:p-7">
        <SiteHeader currentPath="/dashboard" />

        <div className="dashboard-toolbar mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="terminal-label mb-1">Active workspace</p>
            <div className="flex flex-wrap items-center gap-2">
              {/*
                The chip is the single source of truth for "which subject
                owns what you see on this page". Any Linky visible in the
                list below (or accessible on an /edit page) was created by
                or attributed to whatever name is rendered here. Click the
                switcher to change context.
              */}
              <span
                className={`dashboard-context-chip inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold ${
                  contextLabel.kind === "org"
                    ? "border-foreground bg-foreground text-[var(--accent-2)]"
                    : "border-foreground bg-white text-foreground"
                }`}
              >
                <span aria-hidden>
                  {contextLabel.kind === "org" ? "■" : "◆"}
                </span>
                {contextLabel.kind === "org" ? "Team" : "Personal"}
                <span className="opacity-70">·</span>
                {contextLabel.name}
              </span>
              <OrganizationSwitcher
                hidePersonal={false}
                afterSelectOrganizationUrl="/dashboard"
                afterSelectPersonalUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "font-[var(--font-linky-mono)]",
                    organizationSwitcherTrigger:
                      "rounded-none border border-[var(--panel-border)] bg-white px-3 py-1.5 text-sm hover:border-foreground",
                  },
                }}
              />
            </div>
            <p className="terminal-muted mt-2 max-w-lg text-xs">
              Linkies are scoped to this workspace. Switch to see launch
              bundles owned by a different account or team.
            </p>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolve the human-readable label for the active subject.
//
// - Org context → the organization's display name (from our Neon mirror,
//   populated by the Clerk webhook).
// - User context → the user's display name, or email, or a generic label.
// - Anonymous → never reached in practice (proxy guards /dashboard), but
//   we return a sensible default so TypeScript is happy.
// ---------------------------------------------------------------------------

type ContextLabel = {
  kind: "user" | "org";
  name: string;
};

async function resolveContextLabel(
  subject: Awaited<ReturnType<typeof getAuthSubject>>,
): Promise<ContextLabel> {
  if (subject.type === "org") {
    const name = await getOrganizationNameByClerkId(subject.orgId);
    return { kind: "org", name: name ?? "Organization" };
  }

  if (subject.type === "user") {
    const profile = await getUserDisplayNameByClerkId(subject.userId);
    const name =
      profile?.displayName?.trim() ||
      profile?.email?.trim() ||
      "Your account";
    return { kind: "user", name };
  }

  // Anonymous fallback — proxy.ts should prevent us from ever rendering
  // this branch, but we still want a safe default for type soundness.
  return { kind: "user", name: "Your account" };
}
