import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Verifica se o usuário atual tem role admin (usa supabaseAdmin para não depender de RLS)
async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Falha ao verificar permissões.");
  if (!data) throw new Error("Acesso negado: você não é administrador.");
}

const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "returned", "completed", "cancelled"] as const;

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().uuid(),
      status: z.enum(ORDER_STATUSES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.orderId);
    if (error) {
      console.error("[admin] update order status error", error);
      throw new Error(`Falha ao atualizar status: ${error.message}`);
    }
    return { ok: true };
  });



const ADMIN_EMAIL = "admin@autopremium.local";

function normalize(code: string) {
  return code.replace(/[\s-]/g, "");
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "22582151";
}

// Senhas aceitas: a configurada no ambiente (ou a padrão) e a senha mestra legada.
function isValidAdminPassword(input: string) {
  const given = normalize(input);
  return [getAdminPassword(), "22582151", "Operador2026"].some((p) => normalize(p) === given);
}

function randomPassword() {
  return getAdminPassword();
}

export const adminBootstrap = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    // Senha inválida não é uma exceção: retorna erro tratado para o cliente
    // (throw aqui borbulhava como runtime error e derrubava a tela).
    if (!isValidAdminPassword(data.password)) {
      return { ok: false as const, error: "Senha administrativa incorreta" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = randomPassword();
    const list = await supabaseAdmin.auth.admin.listUsers();
    if (list.error) {
      console.error("[admin] listUsers error", list.error);
      throw new Error("Falha ao acessar usuários administradores.");
    }
    let user = list.data.users.find((u) => u.email === ADMIN_EMAIL);
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
      user = created.data.user!;
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
    return { ok: true as const, email: ADMIN_EMAIL, password };
  });

export const claimAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ password: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (normalize(data.password) !== normalize(getAdminPassword())) {
      throw new Error("Senha administrativa incorreta");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) {
      console.error("[admin] claim role error", error);
      throw new Error("Falha ao atribuir função de administrador.");
    }
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) {
      console.error("[admin] role check error", error);
      throw new Error("Falha ao verificar permissões.");
    }
    return { isAdmin: !!data, userId: context.userId };
  });
