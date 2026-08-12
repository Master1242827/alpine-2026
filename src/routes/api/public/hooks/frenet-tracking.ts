import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Consulta ativa (polling) de rastreio na Frenet.
 * A Frenet não envia webhooks — este job consulta os pedidos elegíveis.
 *
 * Elegíveis: status 'paid' ou 'shipped' E tracking_code preenchido.
 * Executado por pg_cron a cada 2 horas. Autenticação: header `apikey`.
 */

const BATCH_SIZE = 20;

function log(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ scope: "frenet-tracking", level, event, ts: new Date().toISOString(), ...meta });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

function normalize(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Deriva shipped/delivered a partir do texto dos eventos da Frenet. */
function mapEvents(payload: any): { mapped: "shipped" | "delivered" | null; when: string | null } {
  const events: any[] = Array.isArray(payload?.TrackingEvents) ? payload.TrackingEvents : [];
  const deliveryStatus = normalize(payload?.DeliveryStatus);

  let shippedAt: string | null = null;
  let deliveredAt: string | null = null;

  const texts = events.map((e) => ({
    text: normalize(`${e?.EventDescription ?? ""} ${e?.EventType ?? ""} ${e?.EventLocation ?? ""}`),
    date: e?.EventDateTime || e?.EventDate || null,
  }));

  for (const { text, date } of texts) {
    if (!deliveredAt && /(entregue|delivered|entrega efetuada|objeto entregue)/.test(text)) deliveredAt = date;
    if (!shippedAt && /(postado|coletado|despachado|em transito|em trânsito|saiu para entrega|posted|collected|dispatched|in transit|shipped)/.test(text))
      shippedAt = date;
  }

  if (!deliveredAt && /(entregue|delivered)/.test(deliveryStatus)) deliveredAt = null;
  const deliveredByStatus = /(entregue|delivered)/.test(deliveryStatus);
  const shippedByStatus = /(transito|transit|postado|coletado|despachado|shipped)/.test(deliveryStatus);

  if (deliveredAt || deliveredByStatus) {
    const d = deliveredAt ? new Date(deliveredAt) : new Date();
    return { mapped: "delivered", when: Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() };
  }
  if (shippedAt || shippedByStatus) {
    const d = shippedAt ? new Date(shippedAt) : new Date();
    return { mapped: "shipped", when: Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString() };
  }
  return { mapped: null, when: null };
}

async function getFrenetToken() {
  const { data } = await supabaseAdmin
    .from("admin_integrations")
    .select("frenet_token")
    .eq("id", 1)
    .maybeSingle();
  return ((data as any)?.frenet_token || process.env.FRENET_TOKEN || "").trim();
}

async function runPolling() {
  const token = await getFrenetToken();
  if (!token) {
    log("error", "missing_token");
    return { ok: false, error: "missing_token", processed: 0, updated: 0 };
  }

  const { data: orders, error } = await supabaseAdmin
    .from("orders")
    .select("id,status,tracking_code,tracking_carrier,shipped_at,delivered_at")
    .in("status", ["paid", "shipped"])
    .not("tracking_code", "is", null)
    .neq("tracking_code", "")
    .order("updated_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    log("error", "orders_query_failed", { message: error.message });
    return { ok: false, error: "query_failed", processed: 0, updated: 0 };
  }

  const list = orders ?? [];
  log("info", "batch_start", { count: list.length });

  let updated = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const order of list) {
    const code = (order.tracking_code || "").trim();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("https://api.frenet.com.br/tracking/trackinginfo", {
        method: "POST",
        headers: { token, "Content-Type": "application/json" },
        body: JSON.stringify({
          ShippingServiceCode: order.tracking_carrier || "",
          TrackingNumber: code,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        log("warn", "frenet_http_error", { orderId: order.id, code, status: res.status });
        results.push({ orderId: order.id, result: `http_${res.status}` });
        continue;
      }

      const payload = await res.json().catch(() => null);
      if (!payload) {
        log("warn", "frenet_invalid_payload", { orderId: order.id, code });
        results.push({ orderId: order.id, result: "invalid_payload" });
        continue;
      }

      const { mapped, when } = mapEvents(payload);
      if (!mapped) {
        log("info", "no_event", { orderId: order.id, code });
        results.push({ orderId: order.id, result: "no_event" });
        continue;
      }

      // Nunca regride status
      const rank: Record<string, number> = { pending: 0, paid: 1, shipped: 2, delivered: 3, completed: 4 };
      if ((rank[mapped] ?? 0) <= (rank[order.status] ?? 0)) {
        log("info", "skip_regression", { orderId: order.id, current: order.status, incoming: mapped });
        results.push({ orderId: order.id, result: "no_change" });
        continue;
      }

      const patch: Record<string, unknown> = { status: mapped };
      if (mapped === "shipped" && !order.shipped_at) patch.shipped_at = when;
      if (mapped === "delivered") {
        if (!order.shipped_at) patch.shipped_at = when;
        if (!order.delivered_at) patch.delivered_at = when;
      }

      const { error: updErr } = await supabaseAdmin.from("orders").update(patch as any).eq("id", order.id);
      if (updErr) {
        log("error", "order_update_failed", { orderId: order.id, message: updErr.message });
        results.push({ orderId: order.id, result: "update_failed" });
        continue;
      }

      updated++;
      log("info", "order_updated", { orderId: order.id, from: order.status, to: mapped, code });
      results.push({ orderId: order.id, result: `updated_${mapped}` });
    } catch (e) {
      log("error", "tracking_failed", { orderId: order.id, code, message: e instanceof Error ? e.message : String(e) });
      results.push({ orderId: order.id, result: "error" });
    }
  }

  log("info", "batch_done", { processed: list.length, updated });
  return { ok: true, processed: list.length, updated, results };
}

export const Route = createFileRoute("/api/public/hooks/frenet-tracking")({
  server: {
    handlers: {
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided =
          request.headers.get("apikey") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || provided !== expected) {
          log("warn", "unauthorized");
          return new Response("unauthorized", { status: 401 });
        }

        const result = await runPolling();
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
