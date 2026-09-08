import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

// Modo simplificado de login administrativo: só senha, sem Supabase Auth.
// A prova de acesso é um cookie de sessão criptografado (HttpOnly + Secure),
// então funciona tanto dentro do Lovable quanto no servidor externo.

async function gateSession() {
  const { adminSessionConfig } = await import("./admin-password.server");
  return await useSession<{ unlocked?: boolean; at?: number }>(adminSessionConfig());
}

/** Verifica o cookie; lança se não estiver liberado. Uso interno em handlers. */
export async function requireAdminGate() {
  const session = await gateSession();
  if (!session.data.unlocked) throw new Error("Acesso administrativo não autorizado.");
  return true;
}

export const adminGateLogin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { isValidAdminPassword } = await import("./admin-password.server");
    if (!isValidAdminPassword(data.password)) {
      return { ok: false as const, error: "Senha administrativa incorreta" };
    }
    const session = await gateSession();
    await session.update({ unlocked: true, at: Date.now() });
    return { ok: true as const };
  });

export const adminGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await gateSession();
  return { unlocked: !!session.data.unlocked };
});

export const adminGateLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await gateSession();
  await session.clear();
  return { ok: true as const };
});

const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "returned",
  "completed",
  "cancelled",
] as const;

/** Atualiza status do pedido provando acesso pelo cookie da senha administrativa. */
export const gateUpdateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ orderId: z.string().uuid(), status: z.enum(ORDER_STATUSES) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdminGate();
    const { setOrderStatus } = await import("./admin-backend.server");
    await setOrderStatus(data.orderId, data.status);
    return { ok: true as const };
  });
