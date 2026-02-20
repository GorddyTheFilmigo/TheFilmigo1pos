// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: intasend-stk-push
// Place at: supabase/functions/intasend-stk-push/index.ts
//
// Handles:
//   POST ?action=initiate  — sends M-Pesa STK Push via IntaSend API
//   GET  ?action=status    — polls payment status + activates subscription
//
// Deploy:
//   supabase functions deploy intasend-stk-push
//
// Secrets to set (run each line in your terminal):
//   supabase secrets set INTASEND_SECRET_KEY=your_secret_key
//   supabase secrets set INTASEND_LIVE_MODE=false
//
// Auto-provided by Supabase (no action needed):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS headers — allow browser calls from any origin ───────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// ── IntaSend base URL (sandbox vs live) ──────────────────────────────────────
function intaSendBase(): string {
  return Deno.env.get('INTASEND_LIVE_MODE') === 'true'
    ? 'https://payment.intasend.com'
    : 'https://sandbox.intasend.com';
}

// ── IntaSend API request headers ─────────────────────────────────────────────
function intaSendHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${Deno.env.get('INTASEND_SECRET_KEY') ?? ''}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
}

// ── Supabase admin client (bypasses RLS — safe in Edge Functions only) ────────
function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')             ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

// ── Format phone number to 2547XXXXXXXX ──────────────────────────────────────
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits.slice(0, 12);
  if (digits.startsWith('0'))   return '254' + digits.slice(1, 10);
  if (digits.startsWith('7') || digits.startsWith('1')) return '254' + digits.slice(0, 9);
  return digits;
}

// ── Days per plan (for subscription activation) ───────────────────────────────
const PLAN_DAYS: Record<string, number> = {
  Monthly:      30,
  Quarterly:    90,
  'Semi-Annual': 180,
  Annual:       365,
  // Short codes used in api_ref
  MON: 30, QUA: 90, SEM: 180, ANN: 365,
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION: initiate
// Sends M-Pesa STK Push and writes a pending_payments row
// ═══════════════════════════════════════════════════════════════════════════
async function handleInitiate(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { phone_number, amount, plan, days, shop_id, user_email, user_name } = body as {
    phone_number?: string;
    amount?:       number | string;
    plan?:         string;
    days?:         number;
    shop_id?:      number | string;
    user_email?:   string;
    user_name?:    string;
  };

  // Validate required fields
  if (!phone_number || !amount || !shop_id || !plan) {
    return jsonRes({
      success: false,
      error: 'Missing required fields: phone_number, amount, shop_id, plan',
    }, 400);
  }

  const formattedPhone = formatPhone(String(phone_number));
  const amountNum      = Number(amount);

  // Build a unique api_ref for this payment
  const planCode = String(plan).toUpperCase().slice(0, 3);
  const api_ref  = `GHS-${shop_id}-${planCode}-${Date.now().toString(36).toUpperCase()}`;

  // Parse user name parts
  const nameParts  = String(user_name || 'G H').trim().split(' ');
  const first_name = nameParts[0] || 'G';
  const last_name  = nameParts.slice(1).join(' ') || 'H';

  // ── Call IntaSend STK Push ─────────────────────────────────────────────────
  const stkBody: Record<string, string> = {
    amount:       String(amountNum),
    phone_number: formattedPhone,
    api_ref,
    first_name,
    last_name,
  };
  if (user_email) stkBody.email = String(user_email);

  let intaSendData: Record<string, unknown>;
  try {
    const resp = await fetch(`${intaSendBase()}/api/v1/payment/mpesa-stk-push/`, {
      method:  'POST',
      headers: intaSendHeaders(),
      body:    JSON.stringify(stkBody),
    });

    intaSendData = await resp.json() as Record<string, unknown>;

    if (!resp.ok) {
      return jsonRes({
        success: false,
        error:   String((intaSendData?.detail as string) || 'IntaSend STK Push failed'),
        raw:     intaSendData,
      }, resp.status);
    }
  } catch (err) {
    return jsonRes({
      success: false,
      error:   `Cannot reach IntaSend: ${(err as Error).message}`,
    }, 502);
  }

  // Extract invoice_id from IntaSend response (structure varies)
  const invoice = intaSendData?.invoice as Record<string, unknown> | undefined;
  const invoice_id = String(
    invoice?.invoice_id ?? intaSendData?.invoice_id ?? intaSendData?.id ?? ''
  );

  // ── Write pending_payments record ─────────────────────────────────────────
  const db = supabaseAdmin();
  const { error: dbErr } = await db.from('pending_payments').insert([{
    shop_id:      String(shop_id),
    plan:         String(plan),
    days:         Number(days ?? PLAN_DAYS[String(plan)] ?? 30),
    amount:       amountNum,
    phone_number: formattedPhone,
    api_ref,
    invoice_id,
    status:       'pending',
    intasend_raw: intaSendData,
    created_at:   new Date().toISOString(),
  }]);

  if (dbErr) {
    // Non-fatal: STK push was sent; log the error but still return success
    console.error('pending_payments insert error:', dbErr.message);
  }

  return jsonRes({
    success:    true,
    invoice_id,
    api_ref,
    message:    'STK Push sent. The customer should check their phone and enter their M-Pesa PIN.',
    raw:        intaSendData,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION: status
// Checks payment status; activates subscription on COMPLETE
// ═══════════════════════════════════════════════════════════════════════════
async function handleStatus(req: Request): Promise<Response> {
  const url        = new URL(req.url);
  const invoice_id = url.searchParams.get('invoice_id');
  const shop_id    = url.searchParams.get('shop_id');

  if (!invoice_id || !shop_id) {
    return jsonRes({ success: false, error: 'Missing invoice_id or shop_id' }, 400);
  }

  const db = supabaseAdmin();

  // ── Check if webhook already resolved it ──────────────────────────────────
  const { data: pendingRow } = await db
    .from('pending_payments')
    .select('*')
    .eq('invoice_id', invoice_id)
    .eq('shop_id', shop_id)
    .maybeSingle();

  if (pendingRow?.status === 'complete') {
    return jsonRes({ success: true, status: 'COMPLETE', payment: pendingRow });
  }
  if (pendingRow?.status === 'failed') {
    return jsonRes({ success: true, status: 'FAILED', reason: pendingRow.failure_reason });
  }

  // ── Poll IntaSend directly ─────────────────────────────────────────────────
  let intaSendData: Record<string, unknown>;
  try {
    const resp = await fetch(`${intaSendBase()}/api/v1/payment/${invoice_id}/`, {
      method:  'GET',
      headers: intaSendHeaders(),
    });
    intaSendData = await resp.json() as Record<string, unknown>;
  } catch (err) {
    return jsonRes({ success: false, error: `Cannot reach IntaSend: ${(err as Error).message}` }, 502);
  }

  // Normalise status field — IntaSend uses different keys across versions
  const invoiceObj = intaSendData?.invoice as Record<string, unknown> | undefined;
  const rawState   = String(
    invoiceObj?.state ?? intaSendData?.state ?? intaSendData?.status ?? 'PENDING'
  ).toUpperCase();

  // ── COMPLETE: activate subscription ───────────────────────────────────────
  if (rawState === 'COMPLETE' || rawState === 'COMPLETED') {
    const plan = String(pendingRow?.plan ?? 'Monthly');
    const days = Number(pendingRow?.days ?? PLAN_DAYS[plan] ?? 30);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await activateSubscription(db, {
      shop_id:          shop_id,
      plan,
      days,
      expiresAt,
      payment_method:   'IntaSend-STK',
      transaction_code: invoice_id,
    });

    // Mark pending_payments as complete
    await db.from('pending_payments').update({
      status:      'complete',
      resolved_at: new Date().toISOString(),
    }).eq('invoice_id', invoice_id);

    return jsonRes({ success: true, status: 'COMPLETE', expires_at: expiresAt.toISOString() });
  }

  // ── FAILED / CANCELLED ────────────────────────────────────────────────────
  if (rawState === 'FAILED' || rawState === 'CANCELLED') {
    await db.from('pending_payments').update({
      status:         'failed',
      failure_reason: String(intaSendData?.failed_reason ?? rawState),
    }).eq('invoice_id', invoice_id);

    return jsonRes({
      success: true,
      status:  'FAILED',
      reason:  intaSendData?.failed_reason ?? rawState,
    });
  }

  // ── Still pending ─────────────────────────────────────────────────────────
  return jsonRes({ success: true, status: 'PENDING', raw_state: rawState });
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED: write / update subscriptions table (scoped to shop_id)
// ═══════════════════════════════════════════════════════════════════════════
async function activateSubscription(
  db: ReturnType<typeof supabaseAdmin>,
  opts: {
    shop_id:          string;
    plan:             string;
    days:             number;
    expiresAt:        Date;
    payment_method:   string;
    transaction_code: string;
  }
) {
  const now = new Date().toISOString();

  const minPayload = {
    shop_id:    opts.shop_id,
    plan:       opts.plan,
    status:     'active',
    expires_at: opts.expiresAt.toISOString(),
  };
  const fullPayload = {
    ...minPayload,
    started_at:       now,
    updated_at:       now,
    payment_method:   opts.payment_method,
    transaction_code: opts.transaction_code,
  };

  // Check for existing row for this shop
  const { data: existing } = await db
    .from('subscriptions')
    .select('id')
    .eq('shop_id', opts.shop_id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  let result;
  if (existing?.id) {
    result = await db.from('subscriptions').update(fullPayload).eq('id', existing.id).eq('shop_id', opts.shop_id);
    // Fallback to minimal payload if optional columns are missing
    if (result.error?.message?.includes('column') || result.error?.message?.includes('schema')) {
      result = await db.from('subscriptions').update(minPayload).eq('id', existing.id).eq('shop_id', opts.shop_id);
    }
  } else {
    result = await db.from('subscriptions').insert([fullPayload]);
    if (result.error?.message?.includes('column') || result.error?.message?.includes('schema')) {
      result = await db.from('subscriptions').insert([minPayload]);
    }
  }

  if (result.error) {
    console.error('subscription upsert error:', result.error.message);
  } else {
    console.log(`✅ Subscription activated for shop ${opts.shop_id} — plan: ${opts.plan}, expires: ${opts.expiresAt.toISOString()}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'initiate';

  try {
    let res: Response;

    if (req.method === 'POST' && action === 'initiate') {
      res = await handleInitiate(req);
    } else if (req.method === 'GET' && action === 'status') {
      res = await handleStatus(req);
    } else {
      res = jsonRes({
        success: false,
        error:   `Unknown: ${req.method} ?action=${action}. Use POST ?action=initiate or GET ?action=status`,
      }, 400);
    }

    // Attach CORS to every response
    const headers = new Headers(res.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    return new Response(res.body, { status: res.status, headers });

  } catch (err) {
    console.error('Edge function unhandled error:', err);
    return jsonRes({ success: false, error: (err as Error).message }, 500);
  }
});

// ── Helper: JSON response ─────────────────────────────────────────────────────
function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}