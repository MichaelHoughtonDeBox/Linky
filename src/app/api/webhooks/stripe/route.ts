import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripeClient, isStripeConfigured } from "@/lib/server/stripe";

// Stripe signs webhook requests by hashing the raw body — we must read the
// request as text, not JSON, or the signature check will fail.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
} as const;

function logInfo(message: string, detail?: unknown): void {
  const line = `${ANSI.magenta}[stripe-webhook]${ANSI.reset} ${message}`;
  if (detail !== undefined) console.log(line, detail);
  else console.log(line);
}

function logWarn(message: string, detail?: unknown): void {
  const line = `${ANSI.yellow}[stripe-webhook]${ANSI.reset} ${message}`;
  if (detail !== undefined) console.warn(line, detail);
  else console.warn(line);
}

function logError(message: string, detail?: unknown): void {
  const line = `${ANSI.red}[stripe-webhook]${ANSI.reset} ${message}`;
  if (detail !== undefined) console.error(line, detail);
  else console.error(line);
}

// ---------------------------------------------------------------------------
// Sprint 1 behavior: verify the signature and log every event so we can
// inspect the stream while we build the rest of the product. No state
// changes are performed here yet — entitlement updates land in a later
// sprint when paid plans actually exist.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  if (!webhookSecret || !isStripeConfigured()) {
    logError("Stripe webhook or secret not configured; rejecting.");
    return Response.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    logWarn("Rejected webhook with missing stripe-signature header.");
    return Response.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (error) {
    logWarn("Rejected webhook with invalid signature.", error);
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  logInfo(
    `${ANSI.dim}[${event.id}]${ANSI.reset} received ${event.type} (scaffold; no-op)`,
  );

  // Intentional no-op. When paid plans launch, switch on event.type here and
  // update the `entitlements` table accordingly. Do not add logic that
  // silently succeeds for unknown event types — prefer loud logging so we
  // notice when Stripe starts delivering something new.

  return Response.json({ ok: true, handled: false });
}
