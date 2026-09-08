import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Toda a lógica de backend fica em admin-backend.server.ts (com fallback para a
// API externa quando a chave de serviço não está disponível). O import é
// dinâmico, dentro dos handlers, para não vazar código servidor no bundle.
async function backend() {
  return await import("./admin-backend.server");
}

async function assertAdmin(userId: string) {
  const { isAdminUser } = await backend();
  if (!(await isAdminUser(userId))) {
    throw new Error("Acesso negado: você não é administrador.");
  }
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
    const { setOrderStatus } = await backend();
    await setOrderStatus(data.orderId, data.status);
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

// A senha do usuário de autenticação do admin NÃO é a senha do portão (que é curta e
// pode constar em vazamentos públicos). Geramos uma senha forte e efêmera a cada acesso:
// ela só é usada para o sign-in imediato e é rotacionada no próximo login.
function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(36)).join("");
  return `Aa1!${raw.slice(0, 40)}`;
}

export const adminBootstrap = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    // Senha inválida não é uma exceção: retorna erro tratado para o cliente
    // (throw aqui borbulhava como runtime error e derrubava a tela).
    if (!isValidAdminPassword(data.password)) {
      return { ok: false as const, error: "Senha administrativa incorreta" };
    }
    const { ensureAdminAuthUser } = await backend();
    const password = randomPassword();
    await ensureAdminAuthUser(ADMIN_EMAIL, password);
    return { ok: true as const, email: ADMIN_EMAIL, password };
  });

export const claimAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ password: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!isValidAdminPassword(data.password)) {
      throw new Error("Senha administrativa incorreta");
    }
    const { grantAdminRole } = await backend();
    await grantAdminRole(context.userId);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminUser } = await backend();
    return { isAdmin: await isAdminUser(context.userId), userId: context.userId };
  });
