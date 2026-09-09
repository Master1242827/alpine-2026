/**
 * Camada de acesso administrativo com fallback.
 *
 * - Se SUPABASE_SERVICE_ROLE_KEY estiver disponível no runtime, usa o cliente
 *   admin do Supabase diretamente (caminho padrão dentro do Lovable Cloud).
 * - Caso contrário (ex.: servidor Node externo hospedado fora do Lovable),
 *   chama a API administrativa externa em ADMIN_API_BASE_URL usando o token
 *   ADMIN_API_TOKEN no header x-admin-token.
 *
 * Arquivo *.server.ts: nunca é incluído no bundle do cliente.
 */

type Json = Record<string, unknown>;

export function hasServiceRole(): boolean {
  return !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
}

function externalConfig() {
  const baseUrl = process.env["ADMIN_API_BASE_URL"];
  const token = process.env["ADMIN_API_TOKEN"];
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

async function externalRequest<T>(
  method: string,
  path: string,
  body?: Json,
): Promise<T> {
  const cfg = externalConfig();
  if (!cfg) {
    throw new Error(
      "Backend administrativo indisponível: nem a chave de serviço nem a API externa estão configuradas.",
    );
  }
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-admin-token": cfg.token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in (parsed as Json)
        ? String((parsed as Json)["error"])
        : null) ?? `Erro ${res.status} na API administrativa externa`;
    console.error("[admin-backend] external error", { path, status: res.status, message });
    throw new Error(message);
  }
  return parsed as T;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** O usuário possui o cargo de administrador? */
export async function isAdminUser(userId: string): Promise<boolean> {
  if (hasServiceRole()) {
    const db = await admin();
    const { data, error } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) {
      console.error("[admin-backend] role check error", error);
      throw new Error("Falha ao verificar permissões.");
    }
    return !!data;
  }
  const out = await externalRequest<{ data?: { user_id?: string; roles?: string[]; is_admin?: boolean } }>(
    "GET",
    `/users/${encodeURIComponent(userId)}/roles`,
  );
  return !!out?.data?.is_admin;
}

/** Concede o cargo de administrador. */
export async function grantAdminRole(userId: string): Promise<void> {
  if (hasServiceRole()) {
    const db = await admin();
    const { error } = await db
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) {
      console.error("[admin-backend] grant role error", error);
      throw new Error("Falha ao atribuir função de administrador.");
    }
    return;
  }
  await externalRequest("POST", `/users/${encodeURIComponent(userId)}/roles`, { role: "admin" });
}

export type OrderStatus =
  | "pending"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "returned"
  | "completed"
  | "cancelled";

/** Atualiza o status de um pedido. */
export async function setOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  if (hasServiceRole()) {
    const db = await admin();
    const { error } = await db.from("orders").update({ status }).eq("id", orderId);
    if (error) {
      console.error("[admin-backend] update order status error", error);
      throw new Error(`Falha ao atualizar status: ${error.message}`);
    }
    return;
  }
  await externalRequest("PATCH", `/orders/${encodeURIComponent(orderId)}`, { status });
}

/**
 * Garante a existência do usuário administrador com a senha efêmera informada.
 * Exige a chave de serviço: operações de auth não são expostas pela API externa.
 */
export async function ensureAdminAuthUser(email: string, password: string): Promise<string> {
  if (!hasServiceRole()) {
    throw new Error(
      "Acesso administrativo automático indisponível neste ambiente. Entre com e-mail e senha.",
    );
  }
  const db = await admin();
  const list = await db.auth.admin.listUsers();
  if (list.error) {
    console.error("[admin-backend] listUsers error", list.error);
    throw new Error("Falha ao acessar usuários administradores.");
  }
  let user = list.data.users.find((u) => u.email === email);
  if (!user) {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) {
      console.error("[admin-backend] createUser error", created.error);
      throw new Error("Falha ao criar usuário administrador.");
    }
    user = created.data.user!;
  } else {
    const upd = await db.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (upd.error) {
      console.error("[admin-backend] updateUser error", upd.error);
      throw new Error("Falha ao atualizar senha do administrador.");
    }
  }
  await grantAdminRole(user.id);
  return user.id;
}
