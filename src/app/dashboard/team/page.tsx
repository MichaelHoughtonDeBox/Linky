import Link from "next/link";
import { redirect } from "next/navigation";

import {
  deriveMembershipRole,
  requireAuthSubject,
  roleOfSubject,
  type MembershipRole,
} from "@/lib/server/auth";
import {
  getOrganizationNameByClerkId,
  listOrgMembers,
  type OrgMemberRow,
} from "@/lib/server/identity-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sprint 2.7 Chunk E — read-only team view. Admins land here to see who
// has what role without bouncing to the Clerk dashboard. No write actions:
// promotions happen in Clerk (source of truth), we just mirror.

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function RoleBadge({ derived }: { derived: MembershipRole }) {
  // Admin gets the inverted terminal chip treatment so it pops in a
  // mostly-editor list. Viewer stays in the muted border-only style
  // because that role is visually identical to "no badge" in screen-
  // reader cases — the label still reads cleanly.
  if (derived === "admin") {
    return (
      <span className="terminal-chip border-foreground bg-foreground text-[var(--accent-2)]">
        admin
      </span>
    );
  }
  if (derived === "editor") {
    return <span className="terminal-chip">editor</span>;
  }
  return (
    <span className="terminal-chip text-[var(--muted-foreground)]">viewer</span>
  );
}

function MemberRow({ member }: { member: OrgMemberRow }) {
  const derived = deriveMembershipRole(member.role);
  const label =
    member.displayName?.trim() ||
    member.email?.trim() ||
    member.clerkUserId;

  return (
    <article className="site-divider-item flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground sm:text-base">
            {label}
          </p>
          <RoleBadge derived={derived} />
        </div>
        {member.email && member.email !== label ? (
          <p className="terminal-muted mt-1 break-all text-xs sm:text-sm">
            {member.email}
          </p>
        ) : null}
        <p className="terminal-muted mt-1 text-xs">
          Clerk role: <code>{member.role}</code> · joined{" "}
          {formatRelative(member.createdAt)}
        </p>
      </div>
    </article>
  );
}

export default async function DashboardTeamPage() {
  const subject = await requireAuthSubject();

  // Personal accounts have no team to show. Redirect back to the main
  // dashboard rather than 404 — it's a navigation mistake, not an error.
  if (subject.type !== "org") {
    redirect("/dashboard");
  }

  // Non-admins cannot see the member list. The API + dashboard api-keys
  // page already apply this gate; we mirror it here so a deep-linked
  // member list cannot leak to a non-admin editor.
  if (roleOfSubject(subject) !== "admin") {
    redirect("/dashboard");
  }

  const [members, orgName] = await Promise.all([
    listOrgMembers(subject.orgId),
    getOrganizationNameByClerkId(subject.orgId),
  ]);

  return (
    <section className="dashboard-team">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="terminal-label mb-1">Team</p>
          <h1 className="display-title text-2xl font-semibold text-foreground sm:text-3xl">
            {orgName ?? "Team members"}
          </h1>
          <p className="terminal-muted mt-2 max-w-2xl text-sm sm:text-base">
            Who can see, edit, and delete team launch bundles. Promotions
            happen in the{" "}
            <a
              href="https://dashboard.clerk.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Clerk dashboard
            </a>
            ; Linky mirrors them on the next webhook delivery.
          </p>
          <p className="terminal-muted mt-2 max-w-2xl text-sm">
            <Link
              href="/docs/access-control"
              className="underline-offset-4 hover:underline"
            >
              How roles map to Linky permissions →
            </Link>
          </p>
        </div>
        <Link
          href="/dashboard"
          className="terminal-secondary px-3 py-1.5 text-xs sm:text-sm"
        >
          Back to dashboard
        </Link>
      </header>

      <section className="terminal-card p-4 sm:p-5">
        <p className="terminal-label mb-3">
          {members.length === 1 ? "1 member" : `${members.length} members`}
        </p>
        {members.length === 0 ? (
          <p className="terminal-muted text-sm">
            No members synced yet. Linky mirrors memberships from Clerk
            webhooks — the first event should land shortly after any
            sign-in activity on this team.
          </p>
        ) : (
          <div className="site-divider-list">
            {members.map((member) => (
              <MemberRow key={member.clerkUserId} member={member} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
