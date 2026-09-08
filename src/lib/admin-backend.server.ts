/**
 * Camada de acesso administrativo com dois modos:
 *
 * 1. LOCAL  — quando SUPABASE_SERVICE_ROLE_KEY existe no ambiente (Lovable Cloud):
 *             usa o supabaseAdmin diretamente, exatamente como antes.
 * 2. REMOTO — quando a chave NÃO existe (ex.: servidor Node externo na Hostinger):
 *             chama a API externa /api/public/admin/... autenticando com o token
 *             do ambiente (ADMIN_API_TOKEN ou EXTERNAL_ADMIN_API_TOKEN).
 *
 * Env do modo remoto:
 *   ADMIN_API_TOKEN     — token aceito pela API externa (obrigatório)
 *   ADMIN_API_BASE_URL  — origem onde a API roda com a service role
 *                         (padrão: https://https-alpine-2026.lovable.app)
 *
 * SERVER-ONLY: nunca importe este módulo em componentes.
 */

export const ADMIN_EMAIL = "admin@autopremium.local";

export function hasServiceRole() {
  return Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]);
}

function remoteConfig() {
  const token = process.env["ADMIN_API_TOKEN"] || process.env["EXTERNAL_ADMIN_API_TOKEN"];
  const base = (
    process.env["ADMIN_API_BASE_URL"] || "https://https-alpine-2026.lovable.app"
  ).replace(/\/+$/, "");
  if (!token) {
    throw new Error(
      "Backend administrativo indisponível: defina SUPABASE_SERVICE_ROLE_KEY ou ADMIN_API_TOKEN.",
    );
  }
  return { token, base };
}

export async function remoteAdmin<T = any>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const { token, base } = remoteConfig();
  const url = new URL(`${base}/api/public/admin${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }
  if (!res.ok) {
    console.error(
      JSON.stringify({ scope: "admin-remote", path, status: res.status, error: payload?.error }),
    );
    throw new Error(payload?.error || `Falha na API administrativa (${res.status})`);
  }
  return payload as T;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(36)).join("");
  return `Aa1!${raw.slice(0, 40)}`;
}

/** Cria/atualiza o usuário administrador usando a service role local. */
export async function localBootstrapAdmin() {
  const supabaseAdmin = await db();
  const password = randomPassword();
  const list = await supabaseAdmin.auth.admin.listUsers();
  if (list.error) {
    console.error("[admin] listUsers error", list.error);
    throw new Error("Falha ao acessar usuários administradores.");
  }
  let user = list.data.users.find((u: { email?: string }) => u.email === ADMIN_EMAIL);
  if (!user) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
    });
    if (created.error) {
      console.error("[admin] createUser error", created.error);
      throw new Error("Falha ao criar usuário administrador.");
    }
    user = created.data.user;
  } else {
    const upd = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (upd.error) {
      console.error("[admin] updateUser error", upd.error);
      throw new Error("Falha ao atualizar senha do administrador.");
    }
  }
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
  return { email: ADMIN_EMAIL, password };
}

/**
 * Operações administrativas. Cada método escolhe sozinho entre Supabase local
 * (service role) e a API externa.
 */
export const adminBackend = {
  mode: () => (hasServiceRole() ? ("local" as const) : ("remote" as const)),

  async bootstrapAdmin(): Promise<{ email: string; password: string }> {
    if (hasServiceRole()) return localBootstrapAdmin();
    const res = await remoteAdmin<{ data: { email: string; password: string } }>("/bootstrap", {
      method: "POST",
      body: {},
    });
    return res.data;
  },

  async isAdmin(userId: string): Promise<boolean> {
    if (hasServiceRole()) {
      const supabaseAdmin = await db();
      const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (error) {
        console.error("[admin] role check error", error);
        throw new Error("Falha ao verificar permissões.");
      }
      return Boolean(data);
    }
    const res = await remoteAdmin<{ data: { roles: string[] } }>(`/users/${userId}/roles`);
    return (res.data?.roles ?? []).includes("admin");
  },

  async grantRole(userId: string, role: "admin" | "user" = "admin") {
    if (hasServiceRole()) {
      const supabaseAdmin = await db();
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      if (error) {
        console.error("[admin] grant role error", error);
        throw new Error("Falha ao atribuir função de administrador.");
      }
      return;
    }
    await remoteAdmin(`/users/${userId}/roles`, { method: "POST", body: { role } });
  },

  async revokeRole(userId: string, role: "admin" | "user" = "admin") {
    if (hasServiceRole()) {
      const supabaseAdmin = await db();
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      return;
    }
    await remoteAdmin(`/users/${userId}/roles`, { method: "DELETE", body: { role } });
  },

  async listUsers(params: { limit?: number; offset?: number } = {}) {
    if (!hasServiceRole()) {
      return remoteAdmin<{ data: any[] }>("/users", {
        query: { limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) },
      }).then((r) => r.data);
    }
    const supabaseAdmin = await db();
    const limit = params.limit ?? 50;
    const page = Math.floor((params.offset ?? 0) / limit) + 1;
    const list = await supabaseAdmin.auth.admin.listUsers({ page, perPage: limit });
    if (list.error) throw new Error("Falha ao listar usuários");
    const ids = list.data.users.map((u: { id: string }) => u.id);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    const { data: profiles } = await supabaseAdmin.from("profiles").select("*").in("id", ids);
    return list.data.users.map((u: any) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      metadata: u.user_metadata,
      profile: profiles?.find((p: any) => p.id === u.id) ?? null,
      roles: (roles ?? []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role),
    }));
  },

  // ---- CRUD genérico por recurso (orders/products/categories/returns/settings) ----

  async list(resource: string, query: Record<string, string | undefined> = {}) {
    if (!hasServiceRole()) {
      const res = await remoteAdmin<{ data: any[]; count?: number }>(`/${resource}`, { query });
      return res.data ?? [];
    }
    const supabaseAdmin = await db();
    const table = TABLES[resource];
    if (!table) throw new Error(`Recurso desconhecido: ${resource}`);
    let q = supabaseAdmin.from(table).select("*");
    if (query["status"]) q = q.eq("status", query["status"]);
    const limit = Number(query["limit"]) || 50;
    const offset = Number(query["offset"]) || 0;
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async get(resource: string, id: string) {
    if (!hasServiceRole()) {
      const res = await remoteAdmin<{ data: any }>(`/${resource}/${id}`);
      return res.data;
    }
    const supabaseAdmin = await db();
    const { data, error } = await supabaseAdmin
      .from(TABLES[resource]!)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(resource: string, body: Record<string, unknown>) {
    if (!hasServiceRole()) {
      const res = await remoteAdmin<{ data: any }>(`/${resource}`, { method: "POST", body });
      return res.data;
    }
    const supabaseAdmin = await db();
    const { data, error } = await supabaseAdmin
      .from(TABLES[resource]!)
      .insert(body)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async update(resource: string, id: string, body: Record<string, unknown>) {
    if (!hasServiceRole()) {
      const res = await remoteAdmin<{ data: any }>(`/${resource}/${id}`, {
        method: "PATCH",
        body,
      });
      return res.data;
    }
    const supabaseAdmin = await db();
    const { data, error } = await supabaseAdmin
      .from(TABLES[resource]!)
      .update(body)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async remove(resource: string, id: string) {
    if (!hasServiceRole()) {
      await remoteAdmin(`/${resource}/${id}`, { method: "DELETE" });
      return { ok: true };
    }
    const supabaseAdmin = await db();
    const { error } = await supabaseAdmin.from(TABLES[resource]!).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async getSettings() {
    if (!hasServiceRole()) {
      const res = await remoteAdmin<{ data: any }>("/settings");
      return res.data;
    }
    const supabaseAdmin = await db();
    const { data, error } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateSettings(body: Record<string, unknown>) {
    if (!hasServiceRole()) {
      const res = await remoteAdmin<{ data: any }>("/settings", { method: "PATCH", body });
      return res.data;
    }
    const supabaseAdmin = await db();
    const { data, error } = await supabaseAdmin
      .from("store_settings")
      .update(body)
      .eq("id", 1)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateOrderStatus(orderId: string, status: string) {
    if (!hasServiceRole()) {
      await remoteAdmin(`/orders/${orderId}`, { method: "PATCH", body: { status } });
      return { ok: true };
    }
    const supabaseAdmin = await db();
    const { error } = await supabaseAdmin.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      console.error("[admin] update order status error", error);
      throw new Error(`Falha ao atualizar status: ${error.message}`);
    }
    return { ok: true };
  },
};

const TABLES: Record<string, string> = {
  orders: "orders",
  products: "products",
  categories: "categories",
  returns: "return_requests",
};
