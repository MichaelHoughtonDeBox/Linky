import type { NextRequest } from "next/server";
import { Webhook, type WebhookRequiredHeaders } from "svix";
import type {
  DeletedObjectJSON,
  OrganizationJSON,
  OrganizationMembershipJSON,
  UserJSON,
  WebhookEvent,
} from "@clerk/nextjs/server";

import {
  deleteMembership,
  deleteOrganization,
  deleteUser,
  getOrganizationStripeCustomerId,
  getUserStripeCustomerId,
  setOrganizationStripeCustomerId,
  setUserStripeCustomerId,
  upsertMembership,
  upsertOrganization,
  upsertUser,
} from "@/lib/server/identity-repository";
import {
  createStripeCustomerForOrganization,
  createStripeCustomerForUser,
  isStripeConfigured,
} from "@/lib/server/stripe";

// Must be dynamic and node runtime for svix signature verification to work
// against the raw request body. Edge runtime is not supported here.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
} as const;

// Colored logger for the webhook path. Keeps signal visible during local dev
// where Clerk events fly in quickly.
function logInfo(message: string, detail?: unknown): void {
  const line = `${ANSI.cyan}[clerk-webhook]${ANSI.reset} ${message}`;
  if (detail !== undefined) {
    console.log(line, detail);
  } else {
    console.log(line);
  }
}

function logOk(message: string): void {
  console.log(`${ANSI.green}[clerk-webhook]${ANSI.reset} ${message}`);
}

function logWarn(message: string, detail?: unknown): void {
  const line = `${ANSI.yellow}[clerk-webhook]${ANSI.reset} ${message}`;
  if (detail !== undefined) {
    console.warn(line, detail);
  } else {
    console.warn(line);
  }
}

function logError(message: string, detail?: unknown): void {
  const line = `${ANSI.red}[clerk-webhook]${ANSI.reset} ${message}`;
  if (detail !== undefined) {
    console.error(line, detail);
  } else {
    console.error(line);
  }
}

function extractPrimaryEmail(user: UserJSON): string | null {
  if (!user.email_addresses?.length) return null;

  // Prefer the explicitly-flagged primary address; Clerk always marks one of
  // the verified addresses as primary when the user has any.
  const primary = user.email_addresses.find(
    (address) => address.id === user.primary_email_address_id,
  );

  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null;
}

function extractDisplayName(user: UserJSON): string | null {
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();

  if (first || last) {
    return [first, last].filter(Boolean).join(" ");
  }

  return user.username ?? null;
}

async function handleUserCreated(user: UserJSON): Promise<void> {
  const email = extractPrimaryEmail(user);
  const displayName = extractDisplayName(user);

  await upsertUser({
    clerkUserId: user.id,
    email,
    displayName,
    avatarUrl: user.image_url ?? null,
  });

  if (!isStripeConfigured()) {
    logWarn(
      `Stripe not configured; skipping customer creation for user ${user.id}.`,
    );
    return;
  }

  // Guard against duplicate Stripe customers if Clerk retries this event.
  const existing = await getUserStripeCustomerId(user.id);
  if (existing) {
    logInfo(`User ${user.id} already has Stripe customer ${existing}; skipping.`);
    return;
  }

  try {
    const stripeCustomerId = await createStripeCustomerForUser({
      clerkUserId: user.id,
      email,
      name: displayName,
    });
    await setUserStripeCustomerId(user.id, stripeCustomerId);
    logOk(`Created Stripe customer ${stripeCustomerId} for user ${user.id}.`);
  } catch (error) {
    // Don't fail the webhook on Stripe errors — identity mirror is more
    // critical than billing linkage, which we can backfill later.
    logError(
      `Failed to create Stripe customer for user ${user.id}; identity row saved.`,
      error,
    );
  }
}

async function handleUserUpdated(user: UserJSON): Promise<void> {
  await upsertUser({
    clerkUserId: user.id,
    email: extractPrimaryEmail(user),
    displayName: extractDisplayName(user),
    avatarUrl: user.image_url ?? null,
  });
}

async function handleUserDeleted(deleted: DeletedObjectJSON): Promise<void> {
  if (!deleted.id) return;
  await deleteUser(deleted.id);
}

async function handleOrganizationCreated(
  org: OrganizationJSON,
): Promise<void> {
  await upsertOrganization({
    clerkOrgId: org.id,
    name: org.name,
    slug: org.slug ?? null,
  });

  if (!isStripeConfigured()) {
    logWarn(
      `Stripe not configured; skipping customer creation for org ${org.id}.`,
    );
    return;
  }

  const existing = await getOrganizationStripeCustomerId(org.id);
  if (existing) {
    logInfo(`Org ${org.id} already has Stripe customer ${existing}; skipping.`);
    return;
  }

  try {
    const stripeCustomerId = await createStripeCustomerForOrganization({
      clerkOrgId: org.id,
      name: org.name,
    });
    await setOrganizationStripeCustomerId(org.id, stripeCustomerId);
    logOk(`Created Stripe customer ${stripeCustomerId} for org ${org.id}.`);
  } catch (error) {
    logError(
      `Failed to create Stripe customer for org ${org.id}; identity row saved.`,
      error,
    );
  }
}

async function handleOrganizationUpdated(org: OrganizationJSON): Promise<void> {
  await upsertOrganization({
    clerkOrgId: org.id,
    name: org.name,
    slug: org.slug ?? null,
  });
}

async function handleOrganizationDeleted(
  deleted: DeletedObjectJSON,
): Promise<void> {
  if (!deleted.id) return;
  await deleteOrganization(deleted.id);
}

async function handleMembershipUpserted(
  membership: OrganizationMembershipJSON,
): Promise<void> {
  // Clerk sends the org and user embedded in the membership payload; we
  // upsert both to handle out-of-order delivery (a membership event can
  // reach us before its associated user.created event).
  const user = membership.public_user_data;
  if (user && "user_id" in user && user.user_id) {
    await upsertUser({
      clerkUserId: user.user_id,
      email: user.identifier ?? null,
      displayName:
        [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
      avatarUrl: user.image_url ?? null,
    });
  }

  if (membership.organization) {
    await upsertOrganization({
      clerkOrgId: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug ?? null,
    });
  }

  const clerkUserId =
    user && "user_id" in user ? user.user_id : undefined;
  if (!clerkUserId || !membership.organization?.id) return;

  await upsertMembership({
    clerkUserId,
    clerkOrgId: membership.organization.id,
    role: membership.role,
  });
}

async function handleMembershipDeleted(
  membership: OrganizationMembershipJSON,
): Promise<void> {
  const user = membership.public_user_data;
  const clerkUserId =
    user && "user_id" in user ? user.user_id : undefined;
  if (!clerkUserId || !membership.organization?.id) return;

  await deleteMembership(clerkUserId, membership.organization.id);
}

async function dispatch(event: WebhookEvent): Promise<void> {
  switch (event.type) {
    case "user.created":
      await handleUserCreated(event.data);
      return;
    case "user.updated":
      await handleUserUpdated(event.data);
      return;
    case "user.deleted":
      await handleUserDeleted(event.data);
      return;
    case "organization.created":
      await handleOrganizationCreated(event.data);
      return;
    case "organization.updated":
      await handleOrganizationUpdated(event.data);
      return;
    case "organization.deleted":
      await handleOrganizationDeleted(event.data);
      return;
    case "organizationMembership.created":
    case "organizationMembership.updated":
      await handleMembershipUpserted(event.data);
      return;
    case "organizationMembership.deleted":
      await handleMembershipDeleted(event.data);
      return;
    default:
      // We subscribe to a broad set of events in the Clerk dashboard to keep
      // future additions no-code — unknown types are logged, not errored.
      logInfo(`Unhandled event type "${event.type}"; ignoring.`);
      return;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    logError("CLERK_WEBHOOK_SIGNING_SECRET is not configured.");
    return Response.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  const body = await request.text();

  // Svix sends three headers that together form the signature. Missing any
  // of them is a hard failure (most likely the request is not from Clerk).
  const headers: WebhookRequiredHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  if (
    !headers["svix-id"] ||
    !headers["svix-timestamp"] ||
    !headers["svix-signature"]
  ) {
    logWarn("Rejected webhook with missing svix headers.");
    return Response.json(
      { error: "Missing svix headers." },
      { status: 400 },
    );
  }

  let event: WebhookEvent;
  try {
    const verifier = new Webhook(secret);
    event = verifier.verify(body, headers) as WebhookEvent;
  } catch (error) {
    logWarn("Rejected webhook with invalid signature.", error);
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const eventIdHeader = headers["svix-id"];
  logInfo(
    `${ANSI.dim}[${eventIdHeader}]${ANSI.reset} received ${event.type}`,
  );

  try {
    await dispatch(event);
  } catch (error) {
    logError(`Handler threw for ${event.type}; returning 500 to trigger retry.`, error);
    return Response.json(
      { error: "Internal error processing webhook." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
