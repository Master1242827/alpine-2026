import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * API administrativa para servidores externos (ex.: painel Node na Hostinger).
 * Autenticação: header `x-admin-token` (ou `Authorization: Bearer <token>`)
 * com o valor do segredo EXTERNAL_ADMIN_API_TOKEN.
 *
 * Rotas (prefixo /api/public/admin):
 *   GET    /orders?status=&search=&limit=&offset=
 *   GET    /orders/:id
 *   PATCH  /orders/:id            { status?, tracking_code?, tracking_carrier? }
 *   GET    /products?search=&limit=&offset=
 *   POST   /products              { ...campos }
 *   PATCH  /products/:id          { ...campos }
 *   DELETE /products/:id
 *   GET    /categories
 *   POST   /categories            { name, slug, display_order? }
 *   PATCH  /categories/:id
 *   DELETE /categories/:id
 *   GET    /returns?status=
 *   PATCH  /returns/:id           { status: approved|rejected|pending }
 *   GET    /settings
 *   PATCH  /settings              { ...campos }
 *   GET    /users?limit=&offset=
 *   GET    /users/:id/roles
 *   POST   /users/:id/roles       { role: admin|user }
 *   DELETE /users/:id/roles       { role: admin|user }
 *   GET    /bootstrap             (config + categorias + contagens)
 *   POST   /bootstrap
 */

const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "returned",
  "completed",
  "cancelled",
] as const;

const PRODUCT_FIELDS = [
  "name",
  "slug",
  "description",
  "short_description",
  "price_cents",
  "compare_at_cents",
  "stock",
  "active",
  "featured",
  "category_id",
  "images",
  "video_url",
  "video_file_url",
  "weight_kg",
  "length_cm",
  "width_cm",
  "height_cm",
  "shipping_weight_kg",
  "shipping_length_cm",
  "shipping_width_cm",
  "shipping_height_cm",
  "requires_vehicle_config",
  "allowed_carriers",
  "blocked_carriers",
] as const;

const SETTINGS_FIELDS = [
  "store_name",
  "cnpj",
  "whatsapp_number",
  "origin_cep",
  "hero_image_url",
  "card_discount_percent",
  "installments_max",
  "installments_interest_free",
  "installments_monthly_rate",
  "pix_enabled",
  "pix_discount_percent",
  "pix_key",
  "pix_key_type",
  "pix_bank",
  "pix_holder_name",
  "pix_message",
  "pix_copy_paste",
  "pix_qr_image_url",
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function pick<T extends readonly string[]>(input: Record<string, unknown>, fields: T) {
  const out: Record<string, unknown> = {};
  for (const key of fields) if (key in input) out[key] = input[key];
  return out;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorize(request: Request): Response | null {
  const expected = process.env["EXTERNAL_ADMIN_API_TOKEN"];
  if (!expected) return json({ error: "API não configurada" }, 503);
  const provided =
    request.headers.get("x-admin-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

const uuid = z.string().uuid();

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function handle(request: Request, splat: string): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const seg = splat.split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const q = url.searchParams;
  const limit = Math.min(Number(q.get("limit")) || 50, 200);
  const offset = Math.max(Number(q.get("offset")) || 0, 0);

  const fail = (error: { message: string } | null, msg: string) => {
    if (!error) return null;
    console.error(JSON.stringify({ scope: "admin-api", path: splat, error: error.message }));
    return json({ error: msg }, 500);
  };

  // ---------- ORDERS ----------
  if (seg[0] === "orders") {
    if (method === "GET" && !seg[1]) {
      let query = db
        .from("orders")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      const status = q.get("status");
      if (status && (ORDER_STATUSES as readonly string[]).includes(status)) {
        query = query.eq("status", status);
      }
      const search = q.get("search");
      if (search) {
        query = query.or(
          `customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`,
        );
      }
      const { data, count, error } = await query;
      return fail(error, "Falha ao listar pedidos") ?? json({ data, count });
    }
    if (method === "GET" && seg[1]) {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const { data, error } = await db
        .from("orders")
        .select("*, order_items(*), order_status_history(*)")
        .eq("id", seg[1])
        .maybeSingle();
      const failed = fail(error, "Falha ao buscar pedido");
      if (failed) return failed;
      return data ? json({ data }) : json({ error: "não encontrado" }, 404);
    }
    if ((method === "PATCH" || method === "PUT") && seg[1]) {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const body = await readBody(request);
      const parsed = z
        .object({
          status: z.enum(ORDER_STATUSES).optional(),
          tracking_code: z.string().max(80).nullable().optional(),
          tracking_carrier: z.string().max(80).nullable().optional(),
        })
        .safeParse(body);
      if (!parsed.success) return json({ error: "dados inválidos" }, 400);
      if (Object.keys(parsed.data).length === 0) return json({ error: "nada a atualizar" }, 400);
      const { data, error } = await db
        .from("orders")
        .update(parsed.data)
        .eq("id", seg[1])
        .select()
        .maybeSingle();
      return fail(error, "Falha ao atualizar pedido") ?? json({ data });
    }
  }

  // ---------- PRODUCTS ----------
  if (seg[0] === "products") {
    if (method === "GET" && !seg[1]) {
      let query = db
        .from("products")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      const search = q.get("search");
      if (search) query = query.ilike("name", `%${search}%`);
      const { data, count, error } = await query;
      return fail(error, "Falha ao listar produtos") ?? json({ data, count });
    }
    if (method === "GET" && seg[1]) {
      const { data, error } = await db.from("products").select("*").eq("id", seg[1]).maybeSingle();
      const failed = fail(error, "Falha ao buscar produto");
      if (failed) return failed;
      return data ? json({ data }) : json({ error: "não encontrado" }, 404);
    }
    if (method === "POST" && !seg[1]) {
      const body = pick(await readBody(request), PRODUCT_FIELDS);
      if (!body["name"] || !body["slug"]) return json({ error: "name e slug obrigatórios" }, 400);
      const { data, error } = await db.from("products").insert(body).select().maybeSingle();
      return fail(error, "Falha ao criar produto") ?? json({ data }, 201);
    }
    if ((method === "PATCH" || method === "PUT") && seg[1]) {
      const body = pick(await readBody(request), PRODUCT_FIELDS);
      if (Object.keys(body).length === 0) return json({ error: "nada a atualizar" }, 400);
      const { data, error } = await db
        .from("products")
        .update(body)
        .eq("id", seg[1])
        .select()
        .maybeSingle();
      return fail(error, "Falha ao atualizar produto") ?? json({ data });
    }
    if (method === "DELETE" && seg[1]) {
      const { error } = await db.from("products").delete().eq("id", seg[1]);
      return fail(error, "Falha ao excluir produto") ?? json({ ok: true });
    }
  }

  // ---------- CATEGORIES ----------
  if (seg[0] === "categories") {
    if (method === "GET") {
      const { data, error } = await db
        .from("categories")
        .select("*")
        .order("display_order", { ascending: true });
      return fail(error, "Falha ao listar categorias") ?? json({ data });
    }
    if (method === "POST" && !seg[1]) {
      const body = pick(await readBody(request), ["name", "slug", "display_order"] as const);
      if (!body["name"] || !body["slug"]) return json({ error: "name e slug obrigatórios" }, 400);
      const { data, error } = await db.from("categories").insert(body).select().maybeSingle();
      return fail(error, "Falha ao criar categoria") ?? json({ data }, 201);
    }
    if ((method === "PATCH" || method === "PUT") && seg[1]) {
      const body = pick(await readBody(request), ["name", "slug", "display_order"] as const);
      if (Object.keys(body).length === 0) return json({ error: "nada a atualizar" }, 400);
      const { data, error } = await db
        .from("categories")
        .update(body)
        .eq("id", seg[1])
        .select()
        .maybeSingle();
      return fail(error, "Falha ao atualizar categoria") ?? json({ data });
    }
    if (method === "DELETE" && seg[1]) {
      const { error } = await db.from("categories").delete().eq("id", seg[1]);
      return fail(error, "Falha ao excluir categoria") ?? json({ ok: true });
    }
  }

  // ---------- RETURNS ----------
  if (seg[0] === "returns") {
    if (method === "GET" && !seg[1]) {
      let query = db
        .from("return_requests")
        .select("*, orders(id, customer_name, customer_email, total_cents, status)")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      const status = q.get("status");
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      return fail(error, "Falha ao listar devoluções") ?? json({ data });
    }
    if ((method === "PATCH" || method === "PUT") && seg[1]) {
      const body = await readBody(request);
      const parsed = z
        .object({ status: z.enum(["pending", "approved", "rejected"]) })
        .safeParse(body);
      if (!parsed.success) return json({ error: "status inválido" }, 400);
      const { data, error } = await db
        .from("return_requests")
        .update({ status: parsed.data.status })
        .eq("id", seg[1])
        .select("*, orders(id)")
        .maybeSingle();
      const failed = fail(error, "Falha ao atualizar devolução");
      if (failed) return failed;
      if (parsed.data.status === "approved" && data?.order_id) {
        await db.from("orders").update({ status: "returned" }).eq("id", data.order_id);
      }
      return json({ data });
    }
  }

  // ---------- SETTINGS ----------
  if (seg[0] === "settings") {
    if (method === "GET") {
      const { data, error } = await db.from("store_settings").select("*").eq("id", 1).maybeSingle();
      return fail(error, "Falha ao carregar configurações") ?? json({ data });
    }
    if (method === "PATCH" || method === "PUT") {
      const body = pick(await readBody(request), SETTINGS_FIELDS);
      if (Object.keys(body).length === 0) return json({ error: "nada a atualizar" }, 400);
      const { data, error } = await db
        .from("store_settings")
        .update(body)
        .eq("id", 1)
        .select()
        .maybeSingle();
      return fail(error, "Falha ao salvar configurações") ?? json({ data });
    }
  }

  // ---------- BOOTSTRAP ----------
  // Dados iniciais para o painel externo: configurações, categorias e contagens.
  if (seg[0] === "bootstrap" && !seg[1] && (method === "POST" || method === "GET")) {
    const [settings, categories, products, orders, returns] = await Promise.all([
      db.from("store_settings").select("*").eq("id", 1).maybeSingle(),
      db.from("categories").select("*").order("display_order", { ascending: true }),
      db.from("products").select("id", { count: "exact", head: true }),
      db.from("orders").select("status"),
      db.from("return_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const firstError =
      settings.error ?? categories.error ?? products.error ?? orders.error ?? returns.error;
    const failed = fail(firstError, "Falha ao carregar dados iniciais");
    if (failed) return failed;

    const ordersByStatus: Record<string, number> = {};
    for (const s of ORDER_STATUSES) ordersByStatus[s] = 0;
    for (const row of (orders.data ?? []) as { status: string }[]) {
      ordersByStatus[row.status] = (ordersByStatus[row.status] ?? 0) + 1;
    }

    return json({
      data: {
        settings: settings.data ?? null,
        categories: categories.data ?? [],
        order_statuses: ORDER_STATUSES,
        counts: {
          products: products.count ?? 0,
          orders: (orders.data ?? []).length,
          orders_by_status: ordersByStatus,
          returns_pending: returns.count ?? 0,
        },
      },
    });
  }

  // ---------- USERS ----------
  if (seg[0] === "users") {
    if (method === "GET" && !seg[1]) {
      const page = Math.floor(offset / limit) + 1;
      const list = await db.auth.admin.listUsers({ page, perPage: limit });
      if (list.error) return fail(list.error, "Falha ao listar usuários")!;
      const ids = list.data.users.map((u: { id: string }) => u.id);
      const { data: roles } = await db.from("user_roles").select("user_id, role").in("user_id", ids);
      const { data: profiles } = await db.from("profiles").select("*").in("id", ids);
      const data = list.data.users.map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        metadata: u.user_metadata,
        profile: profiles?.find((p: any) => p.id === u.id) ?? null,
        roles: (roles ?? []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role),
      }));
      return json({ data });
    }
    if (seg[1] && seg[2] === "roles" && method === "GET") {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const { data, error } = await db
        .from("user_roles")
        .select("role, created_at")
        .eq("user_id", seg[1]);
      const failed = fail(error, "Falha ao listar cargos");
      if (failed) return failed;
      const roles = (data ?? []).map((r: { role: string }) => r.role);
      return json({ data: { user_id: seg[1], roles, is_admin: roles.includes("admin") } });
    }
    if (seg[1] && seg[2] === "roles" && (method === "POST" || method === "DELETE")) {
      if (!uuid.safeParse(seg[1]).success) return json({ error: "id inválido" }, 400);
      const parsed = z
        .object({ role: z.enum(["admin", "user"]) })
        .safeParse(await readBody(request));
      if (!parsed.success) return json({ error: "role inválida" }, 400);
      if (method === "POST") {
        const { error } = await db
          .from("user_roles")
          .upsert({ user_id: seg[1], role: parsed.data.role }, { onConflict: "user_id,role" });
        return fail(error, "Falha ao atribuir cargo") ?? json({ ok: true });
      }
      const { error } = await db
        .from("user_roles")
        .delete()
        .eq("user_id", seg[1])
        .eq("role", parsed.data.role);
      return fail(error, "Falha ao remover cargo") ?? json({ ok: true });
    }
  }

  return json({ error: "rota não encontrada" }, 404);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,x-admin-token,authorization",
};

async function withCors(request: Request, splat: string) {
  const res = await handle(request, splat);
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

export const Route = createFileRoute("/api/public/admin/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request, params }) => withCors(request, params._splat ?? ""),
      POST: async ({ request, params }) => withCors(request, params._splat ?? ""),
      PATCH: async ({ request, params }) => withCors(request, params._splat ?? ""),
      PUT: async ({ request, params }) => withCors(request, params._splat ?? ""),
      DELETE: async ({ request, params }) => withCors(request, params._splat ?? ""),
    },
  },
});
