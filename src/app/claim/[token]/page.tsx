import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import { getAuthSubject } from "@/lib/server/auth";
import {
  consumeClaimToken,
  lookupClaimToken,
} from "@/lib/server/claim-tokens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ token: string }>;
};

// ---------------------------------------------------------------------------
// GET /claim/[token]
//
// Two behaviors based on auth state at the moment of the click:
//
//   1. Signed in → we attempt to consume the token in a single transaction
//      and redirect straight to the dashboard editor for that Linky. This
//      is the happy path for agent → human handoff:
//        - agent creates Linky without auth, gets a claim URL back
//        - user clicks the URL (already signed in via a prior browser session)
//        - they're immediately dropped into the editor, no extra step.
//
//   2. Signed out → we render a landing page explaining what claiming means
//      and offering Sign in / Sign up, both parameterized with
//      `redirect_url` so the user returns here after auth.
//
// Error states (expired, already consumed, already owned, deleted, not
// found) render dedicated messaging so failures are explainable rather
// than mysterious.
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="terminal-stage flex flex-1 items-start justify-center px-5 py-5 sm:py-6">
      <main className="site-shell w-full max-w-3xl p-5 sm:p-6 lg:p-7">
        <SiteHeader />
        {children}
      </main>
    </div>
  );
}

function ClaimExpired({ slug }: { slug: string }) {
  return (
    <PageShell>
      <section className="site-hero">
        <p className="terminal-label mb-3">Claim expired</p>
        <h1 className="display-title mb-3 text-3xl font-semibold text-foreground sm:text-4xl">
          This claim link has expired.
        </h1>
        <p className="terminal-muted max-w-2xl text-sm leading-relaxed sm:text-base">
          The Linky at{" "}
          <code className="site-example-link inline-block">/l/{slug}</code>{" "}
          still works for public viewing, but the window for attributing it to
          an account has closed. Ask the agent or teammate who shared it to
          create a fresh Linky for you.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/l/${slug}`} className="terminal-secondary px-4 py-2 text-sm">
            View the public Linky
          </Link>
          <Link href="/" className="terminal-secondary px-4 py-2 text-sm">
            Back to home
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

function ClaimAlreadyConsumed({ slug }: { slug: string }) {
  return (
    <PageShell>
      <section className="site-hero">
        <p className="terminal-label mb-3">Already claimed</p>
        <h1 className="display-title mb-3 text-3xl font-semibold text-foreground sm:text-4xl">
          This Linky has already been claimed.
        </h1>
        <p className="terminal-muted max-w-2xl text-sm leading-relaxed sm:text-base">
          Someone has already bound this Linky to an account. If you believe
          this is a mistake, please share a new Linky instead.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/l/${slug}`} className="terminal-secondary px-4 py-2 text-sm">
            View the public Linky
          </Link>
          <Link href="/" className="terminal-secondary px-4 py-2 text-sm">
            Back to home
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

function ClaimNotFound() {
  return (
    <PageShell>
      <section className="site-hero">
        <p className="terminal-label mb-3">Claim link invalid</p>
        <h1 className="display-title mb-3 text-3xl font-semibold text-foreground sm:text-4xl">
          This claim link doesn&apos;t look right.
        </h1>
        <p className="terminal-muted max-w-2xl text-sm leading-relaxed sm:text-base">
          We couldn&apos;t find a matching claim token. The URL may have been
          truncated, mistyped, or the Linky may have been deleted. Try again
          from the original source, or create a new Linky.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="terminal-action px-4 py-2 text-sm">
            Create a new Linky
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

function ClaimSignInPrompt({
  token,
  slug,
  email,
  urlCount,
  expiresDays,
}: {
  token: string;
  slug: string;
  email: string | null;
  urlCount: number | null;
  // Pre-computed at the page level (server entry) so this render function
  // remains pure — React 19's compiler flags Date.now() inside render.
  expiresDays: number;
}) {
  // `redirect_url` is the Clerk convention for post-auth return destination.
  // Encoded here so special chars in the token are safe.
  const redirectUrl = encodeURIComponent(`/claim/${token}`);
  const emailParam = email ? `&email_address=${encodeURIComponent(email)}` : "";
  const signInHref = `/signin?redirect_url=${redirectUrl}${emailParam}`;
  const signUpHref = `/signup?redirect_url=${redirectUrl}${emailParam}`;

  return (
    <PageShell>
      <section className="site-hero">
        <p className="terminal-label mb-3">Claim your Linky</p>
        <h1 className="display-title mb-3 text-3xl font-semibold text-foreground sm:text-4xl">
          Bind this Linky to your account.
        </h1>
        <p className="terminal-muted max-w-2xl text-sm leading-relaxed sm:text-base">
          An agent or teammate created a Linky that doesn&apos;t yet belong to
          anyone. Sign in (or create an account) to take ownership — you&apos;ll
          be able to edit the URL bundle, rename it, and share it from your
          dashboard.
        </p>

        <div className="site-inline-callout mt-5 text-sm">
          <p className="terminal-label mb-2">What you&apos;re claiming</p>
          <p className="mb-1">
            <strong>/l/{slug}</strong>
            {urlCount !== null
              ? ` · ${urlCount} URL${urlCount === 1 ? "" : "s"}`
              : ""}
          </p>
          {email ? (
            <p className="terminal-muted text-xs">
              The agent flagged this claim for <strong>{email}</strong>. If
              that&apos;s you, sign up with that address.
            </p>
          ) : null}
          <p className="terminal-muted mt-2 text-xs">
            Claim expires in {expiresDays} day{expiresDays === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={signInHref} className="terminal-action px-4 py-2 text-sm">
            Sign in to claim
          </Link>
          <Link href={signUpHref} className="terminal-secondary px-4 py-2 text-sm">
            Create an account
          </Link>
          <Link href={`/l/${slug}`} className="terminal-secondary px-4 py-2 text-sm">
            Preview the Linky
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default async function ClaimTokenPage({ params }: PageProps) {
  const { token } = await params;

  const lookup = await lookupClaimToken(token);
  if (lookup.status === "not-found") return <ClaimNotFound />;

  const subject = await getAuthSubject();

  // Signed-out: render the landing page with sign-in/up CTAs.
  if (subject.type === "anonymous") {
    if (lookup.status === "expired") {
      return <ClaimExpired slug={lookup.linky!.slug} />;
    }
    if (lookup.status === "consumed") {
      return <ClaimAlreadyConsumed slug={lookup.linky!.slug} />;
    }
    return (
      <ClaimSignInPrompt
        token={token}
        slug={lookup.linky!.slug}
        email={lookup.token?.email ?? null}
        urlCount={null}
        // `expiresInDays` is computed inside the lookup (outside render) so
        // we do not call Date.now() in this component's render path.
        expiresDays={lookup.expiresInDays ?? 0}
      />
    );
  }

  // Signed-in: attempt to consume atomically.
  const result = await consumeClaimToken({
    token,
    clerkUserId: subject.userId,
    clerkOrgId: subject.type === "org" ? subject.orgId : null,
  });

  if (result.status === "ok") {
    // Happy path: drop the user straight into the editor for the claimed
    // Linky. They now own it and can edit + rename + share.
    redirect(`/dashboard/links/${result.slug}`);
  }

  // Edge states — surface explicit messaging rather than a silent redirect.
  if (result.status === "expired") {
    return <ClaimExpired slug={lookup.linky?.slug ?? ""} />;
  }
  if (result.status === "consumed") {
    return <ClaimAlreadyConsumed slug={lookup.linky?.slug ?? ""} />;
  }
  if (result.status === "already-owned") {
    return <ClaimAlreadyConsumed slug={lookup.linky?.slug ?? ""} />;
  }
  if (result.status === "deleted") {
    return <ClaimNotFound />;
  }

  return <ClaimNotFound />;
}
