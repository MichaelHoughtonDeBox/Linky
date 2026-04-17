import "server-only";

import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Stripe client singleton.
//
// Sprint 1 scope: we only use this to mint Customer records during identity
// webhook processing. No Checkout, no subscriptions, no entitlement updates
// yet — those arrive in a later sprint when we launch paid plans.
// ---------------------------------------------------------------------------

declare global {
  var __linkyStripeClient: Stripe | undefined;
}

export class StripeNotConfiguredError extends Error {
  readonly code = "STRIPE_NOT_CONFIGURED";

  constructor() {
    super(
      "STRIPE_SECRET_KEY is not set. Configure it in .env.local before using billing flows.",
    );
    this.name = "StripeNotConfiguredError";
  }
}

export function getStripeClient(): Stripe {
  if (globalThis.__linkyStripeClient) {
    return globalThis.__linkyStripeClient;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new StripeNotConfiguredError();
  }

  // We pin a recent API version so our request shape stays stable across
  // Stripe's periodic releases. Bump deliberately when we need new fields.
  const client = new Stripe(secret, {
    // Pinned to the version the installed SDK's types expect. Bump this
    // deliberately (with a code review) when we actually need new fields.
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
    appInfo: {
      name: "Linky",
      url: "https://getalinky.com",
    },
  });

  globalThis.__linkyStripeClient = client;
  return client;
}

/** Returns true iff Stripe credentials are configured in the environment. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Create a Stripe Customer for a user. Called from the Clerk webhook handler
 * on `user.created`. Idempotent wrt the caller: if the user already has a
 * stripe_customer_id persisted, the caller should skip this function
 * entirely rather than relying on Stripe-side dedupe (Stripe does not dedupe
 * customers by email, which makes retries dangerous).
 */
export async function createStripeCustomerForUser(input: {
  clerkUserId: string;
  email: string | null;
  name: string | null;
}): Promise<string> {
  const stripe = getStripeClient();

  const customer = await stripe.customers.create({
    email: input.email ?? undefined,
    name: input.name ?? undefined,
    metadata: {
      clerk_user_id: input.clerkUserId,
      subject_type: "user",
    },
  });

  return customer.id;
}

/**
 * Create a Stripe Customer for an organization. Called from the Clerk
 * webhook handler on `organization.created`. Org-owned subscriptions give
 * us a single billing relationship per team regardless of member count.
 */
export async function createStripeCustomerForOrganization(input: {
  clerkOrgId: string;
  name: string;
}): Promise<string> {
  const stripe = getStripeClient();

  const customer = await stripe.customers.create({
    name: input.name,
    metadata: {
      clerk_org_id: input.clerkOrgId,
      subject_type: "org",
    },
  });

  return customer.id;
}
