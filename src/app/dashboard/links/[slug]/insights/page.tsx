import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  canEditLinky,
  canViewLinky,
  requireAuthSubject,
  roleOfSubject,
} from "@/lib/server/auth";
import { getPublicBaseUrl } from "@/lib/server/config";
import {
  aggregateLauncherInsights,
  resolveInsightsRange,
  type InsightsRange,
} from "@/lib/server/launcher-events-repository";
import { getLinkyRecordBySlug } from "@/lib/server/linkies-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
};

const RANGE_OPTIONS: { value: InsightsRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function formatInteger(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// Minimal SVG sparkline — no chart lib dependency. Keeps the bundle lean
// and matches the terminal aesthetic: stark strokes, no gradients. We
// pad the x-axis to the full range so a sparse 2-point series does not
// render as two dots jammed to one edge.
function Sparkline({
  series,
  rangeDays,
  width = 480,
  height = 80,
}: {
  series: { day: string; views: number; openAllClicks: number }[];
  rangeDays: number;
  width?: number;
  height?: number;
}) {
  if (series.length === 0) {
    return (
      <p className="terminal-muted text-xs">
        No launcher activity in this window yet.
      </p>
    );
  }

  // Build an index over the actual event days so we can fill zeros for
  // missing days. This keeps the x-axis evenly spaced — otherwise a
  // dense-then-silent-then-dense pattern would squish together.
  const byDay = new Map(series.map((p) => [p.day, p]));
  const today = series[series.length - 1]?.day ?? new Date().toISOString().slice(0, 10);
  const filled: { day: string; views: number; openAllClicks: number }[] = [];
  const todayDate = new Date(`${today}T00:00:00Z`);
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    filled.push(byDay.get(key) ?? { day: key, views: 0, openAllClicks: 0 });
  }

  const maxViews = Math.max(1, ...filled.map((p) => p.views));
  const stepX = width / Math.max(1, filled.length - 1);
  const toY = (value: number) =>
    height - (value / maxViews) * (height - 6) - 3;

  const viewsPath = filled
    .map((p, i) => {
      const x = i * stepX;
      const y = toY(p.views);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const openAllPath = filled
    .map((p, i) => {
      const x = i * stepX;
      const y = toY(p.openAllClicks);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="insights-sparkline"
      role="img"
      aria-label="Daily launcher views + Open All clicks over the selected range"
    >
      <path
        d={viewsPath}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={1.5}
      />
      <path
        d={openAllPath}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={1}
        strokeDasharray="3 2"
        opacity={0.65}
      />
    </svg>
  );
}

export default async function DashboardLinkyInsightsPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { range: rawRange } = await searchParams;
  const subject = await requireAuthSubject();

  const linky = await getLinkyRecordBySlug(slug);
  if (!linky) notFound();

  const ownership = {
    ownerUserId: linky.owner.type === "user" ? linky.owner.userId : null,
    ownerOrgId: linky.owner.type === "org" ? linky.owner.orgId : null,
  };
  const role = roleOfSubject(subject);

  if (!canViewLinky(subject, ownership, role)) {
    redirect("/dashboard");
  }

  const range = resolveInsightsRange(rawRange);
  const insights = await aggregateLauncherInsights({
    linkyId: linky.id,
    range,
  });

  const baseUrl = getPublicBaseUrl();
  const publicUrl = new URL(`/l/${linky.slug}`, baseUrl).toString();
  const canEdit = canEditLinky(subject, ownership, role);

  // Resolve rule-id → human label here so the page can render without a
  // separate DTO import from the API route. Mirrors the logic in the
  // route handler; deleted rules render as "(removed rule)".
  const byRule = insights.byRule.map((bucket) => {
    if (bucket.ruleId === null) return { ...bucket, ruleName: "Fallthrough" };
    const match = linky.resolutionPolicy.rules.find(
      (rule) => rule.id === bucket.ruleId,
    );
    if (!match) return { ...bucket, ruleName: "(removed rule)" };
    return {
      ...bucket,
      ruleName: match.name?.trim() || `Rule ${match.id.slice(0, 8)}`,
    };
  });

  const rangeDays = range === "7d" ? 7 : range === "90d" ? 90 : 30;

  return (
    <section className="dashboard-linky-insights">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="terminal-label mb-1">Insights</p>
          <h1 className="display-title text-2xl font-semibold text-foreground sm:text-3xl">
            {linky.title || `/l/${linky.slug}`}
          </h1>
          <p className="terminal-muted mt-2 break-all text-xs sm:text-sm">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {publicUrl}
            </a>
          </p>
        </div>
        <Link
          href="/dashboard"
          className="terminal-secondary px-3 py-1.5 text-xs sm:text-sm"
        >
          Back to dashboard
        </Link>
      </header>

      {/* Tab bar — Insights + Edit. Edit tab only shown to editors+ so
          viewers don't click into a page that will redirect them. */}
      <nav className="insights-tabs mb-5 flex flex-wrap gap-2 border-b border-[var(--panel-border)] pb-3">
        <Link
          href={`/dashboard/links/${linky.slug}/insights`}
          className="terminal-action px-3 py-1.5 text-xs sm:text-sm"
          aria-current="page"
        >
          Insights
        </Link>
        {canEdit ? (
          <Link
            href={`/dashboard/links/${linky.slug}`}
            className="terminal-secondary px-3 py-1.5 text-xs sm:text-sm"
          >
            Edit
          </Link>
        ) : null}
      </nav>

      {/* Range picker — plain GET links so the URL is shareable. */}
      <div className="mb-5 flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((option) => {
          const href = `/dashboard/links/${linky.slug}/insights?range=${option.value}`;
          const active = option.value === range;
          return (
            <Link
              key={option.value}
              href={href}
              className={
                active
                  ? "terminal-action px-3 py-1.5 text-xs sm:text-sm"
                  : "terminal-secondary px-3 py-1.5 text-xs sm:text-sm"
              }
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {/* Totals — four stat cards in a terminal-aesthetic grid. */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Views" value={formatInteger(insights.totals.views)} />
        <StatCard
          label="Unique viewer-days"
          value={formatInteger(insights.totals.uniqueViewerDays)}
        />
        <StatCard
          label="Open All clicks"
          value={formatInteger(insights.totals.openAllClicks)}
        />
        <StatCard
          label="Open All rate"
          value={formatPercent(insights.totals.openAllRate)}
        />
      </section>

      {/* Daily sparkline — solid line = views, dashed line = Open All. */}
      <section className="terminal-card mb-6 p-4">
        <p className="terminal-label mb-2">Daily activity</p>
        <Sparkline series={insights.series} rangeDays={rangeDays} />
        <p className="terminal-muted mt-2 text-xs">
          <span className="inline-block h-0.5 w-6 align-middle bg-[var(--foreground)]" />{" "}
          views ·{" "}
          <span className="inline-block h-0.5 w-6 align-middle border-t border-dashed border-[var(--foreground)]" />{" "}
          Open All clicks
        </p>
      </section>

      {/* Per-rule breakdown — renders even when the Linky has no policy;
          in that case every row bucket will have ruleId === null and the
          table collapses to one "Fallthrough" row. Deleted rule ids
          surface as "(removed rule)" so history is not rewritten. */}
      <section className="terminal-card p-4">
        <p className="terminal-label mb-3">Rule breakdown</p>
        {byRule.length === 0 ? (
          <p className="terminal-muted text-xs">
            No events in this window yet. Once viewers start hitting the
            launcher the breakdown appears here.
          </p>
        ) : (
          <table className="insights-rule-table w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                <th className="pb-2 pr-2 font-semibold">Rule</th>
                <th className="pb-2 pr-2 text-right font-semibold">Views</th>
                <th className="pb-2 pr-2 text-right font-semibold">Open All</th>
                <th className="pb-2 text-right font-semibold">Rate</th>
              </tr>
            </thead>
            <tbody>
              {byRule.map((row) => (
                <tr
                  key={row.ruleId ?? "fallthrough"}
                  className="border-t border-[var(--panel-border)]"
                >
                  <td className="py-2 pr-2 text-foreground">
                    {row.ruleName}
                    {row.ruleId === null ? (
                      <span className="terminal-muted ml-2 text-xs">
                        (unmatched / anonymous)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {formatInteger(row.views)}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {formatInteger(row.openAllClicks)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatPercent(row.openAllRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="terminal-muted mt-6 text-xs">
        Linky captures launcher views and Open All clicks against the
        matched rule. No viewer-side tracking, no destination-tab pings —
        only what helps you answer whether the right audience arrived.
      </p>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="terminal-card p-4">
      <p className="terminal-label mb-1 text-xs">{label}</p>
      <p className="display-title text-2xl font-semibold text-foreground tabular-nums sm:text-3xl">
        {value}
      </p>
    </div>
  );
}
