import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Use service role for database operations (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("No Stripe signature found");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Signature verification failed", { error: msg });
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${msg}` }), {
        status: 400,
      });
    }

    logStep("Event verified", { type: event.type, id: event.id });

    // Log the webhook event
    const { error: logError } = await supabaseAdmin.from("webhook_events").upsert({
      stripe_event_id: event.id,
      type: event.type,
      payload: event.data.object as Record<string, unknown>,
      processed: false,
    }, { onConflict: "stripe_event_id" });

    if (logError) {
      logStep("Failed to log webhook event", { error: logError.message });
    }

    // Process the event
    let processed = true;
    let processingError: string | null = null;

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(supabaseAdmin, stripe, session);
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(supabaseAdmin, stripe, subscription);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(supabaseAdmin, stripe, subscription);
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentStatus(supabaseAdmin, stripe, invoice, "failed");
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          await handlePaymentStatus(supabaseAdmin, stripe, invoice, "paid");
          break;
        }
        default:
          logStep("Unhandled event type", { type: event.type });
      }
    } catch (err) {
      processed = false;
      processingError = err instanceof Error ? err.message : String(err);
      logStep("Processing error", { error: processingError });
    }

    // Update the webhook event log
    await supabaseAdmin
      .from("webhook_events")
      .update({ processed, error: processingError })
      .eq("stripe_event_id", event.id);

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("FATAL ERROR", { message });
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

async function findUserByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string
) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

async function getCustomerEmail(stripe: Stripe, customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return (customer as Stripe.Customer).email || null;
}

async function handleCheckoutCompleted(
  supabaseAdmin: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  logStep("Processing checkout.session.completed", { sessionId: session.id });

  const customerEmail = session.customer_email || 
    (session.customer ? await getCustomerEmail(stripe, session.customer as string) : null);
  
  if (!customerEmail) {
    logStep("No customer email found in session");
    return;
  }

  const userId = await findUserByEmail(supabaseAdmin, customerEmail);
  if (!userId) {
    logStep("No user found for email", { email: customerEmail });
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    logStep("No subscription in checkout session");
    return;
  }

  // Fetch the full subscription
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const { error } = await supabaseAdmin.from("stripe_customers").upsert({
    user_id: userId,
    stripe_customer_id: session.customer as string,
    stripe_subscription_id: subscriptionId,
    subscription_status: subscription.status as string,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    price_id: subscription.items.data[0]?.price?.id || null,
    last_payment_status: "paid",
  }, { onConflict: "user_id" });

  if (error) {
    logStep("Error upserting stripe_customers", { error: error.message });
    throw error;
  }

  // Update profile plan
  await supabaseAdmin
    .from("profiles")
    .update({ plan: "premium" })
    .eq("user_id", userId);

  logStep("Checkout processed successfully", { userId, subscriptionId });
}

async function handleSubscriptionChange(
  supabaseAdmin: ReturnType<typeof createClient>,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription change", {
    subscriptionId: subscription.id,
    status: subscription.status,
  });

  const customerEmail = await getCustomerEmail(stripe, subscription.customer as string);
  if (!customerEmail) return;

  const userId = await findUserByEmail(supabaseAdmin, customerEmail);
  if (!userId) {
    logStep("No user found for email", { email: customerEmail });
    return;
  }

  const isActive = ["active", "trialing"].includes(subscription.status);

  await supabaseAdmin.from("stripe_customers").upsert({
    user_id: userId,
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status as string,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    price_id: subscription.items.data[0]?.price?.id || null,
  }, { onConflict: "user_id" });

  await supabaseAdmin
    .from("profiles")
    .update({ plan: isActive ? "premium" : "free" })
    .eq("user_id", userId);

  logStep("Subscription change processed", { userId, status: subscription.status });
}

async function handleSubscriptionDeleted(
  supabaseAdmin: ReturnType<typeof createClient>,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription deletion", { subscriptionId: subscription.id });

  const customerEmail = await getCustomerEmail(stripe, subscription.customer as string);
  if (!customerEmail) return;

  const userId = await findUserByEmail(supabaseAdmin, customerEmail);
  if (!userId) return;

  await supabaseAdmin.from("stripe_customers").upsert({
    user_id: userId,
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    subscription_status: "canceled",
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    price_id: subscription.items.data[0]?.price?.id || null,
  }, { onConflict: "user_id" });

  await supabaseAdmin
    .from("profiles")
    .update({ plan: "free" })
    .eq("user_id", userId);

  logStep("Subscription deleted processed", { userId });
}

async function handlePaymentStatus(
  supabaseAdmin: ReturnType<typeof createClient>,
  stripe: Stripe,
  invoice: Stripe.Invoice,
  status: "paid" | "failed"
) {
  logStep("Processing payment status", { invoiceId: invoice.id, status });

  const customerId = invoice.customer as string;
  const customerEmail = await getCustomerEmail(stripe, customerId);
  if (!customerEmail) return;

  const userId = await findUserByEmail(supabaseAdmin, customerEmail);
  if (!userId) return;

  await supabaseAdmin
    .from("stripe_customers")
    .update({ last_payment_status: status })
    .eq("user_id", userId);

  logStep("Payment status updated", { userId, status });
}
