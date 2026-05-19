import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_CODE = "2258-2151";
const ADMIN_EMAIL = "admin@autopremium.local";

function normalize(code: string) {
  return code.replace(/[\s-]/g, "");
}

export const adminBootstrap = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    if (normalize(data.code) !== normalize(ADMIN_CODE)) {
      throw new Error("Código inválido");
    }
    // Ensure admin user exists with password == code (idempotent)
    const password = ADMIN_CODE;
    const list = await supabaseAdmin.auth.admin.listUsers();
    if (list.error) throw new Error(list.error.message);
    let user = list.data.users.find((u) => u.email === ADMIN_EMAIL);
    if (!user) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password,
        email_confirm: true,
      });
      if (created.error) throw new Error(created.error.message);
      user = created.data.user!;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
    }
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
    return { email: ADMIN_EMAIL, password };
  });

export const claimAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data, context }) => {
    if (normalize(data.code) !== normalize(ADMIN_CODE)) {
      throw new Error("Código inválido");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { isAdmin: !!data, userId: context.userId };
  });
