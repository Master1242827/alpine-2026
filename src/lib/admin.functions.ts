import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "admin@autopremium.local";

function normalize(code: string) {
  return code.replace(/[\s-]/g, "");
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "22582151";
}

function randomPassword() {
  return getAdminPassword();
}

export const adminBootstrap = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (normalize(data.password) !== normalize(getAdminPassword())) {
      throw new Error("Senha administrativa incorreta");
    }
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
    return { email: ADMIN_EMAIL, password };
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
