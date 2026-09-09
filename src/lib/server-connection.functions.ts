import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Dados de conexão que um servidor externo (ex.: Node na Hostinger) precisa
 * colocar no .env para usar o checkout/pagamentos desta instalação.
 * Somente administradores conseguem ver o token.
 */

async function assertAdminAccess() {
  try {
    const { getAdminGateSession } = await import("./admin-password.server");
    const session = await getAdminGateSession();
    if (session.data.unlocked) return;
  } catch {
    /* segue para o Supabase Auth */
  }

  const token = getRequest()
    ?.headers.get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Acesso negado");

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Acesso negado");

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new Error("Acesso negado");

  const { isAdminUser } = await import("./admin-backend.server");
  if (!(await isAdminUser(userId))) throw new Error("Acesso negado");
}

const DEFAULT_BASE =
  "https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app/api/public/checkout";

function connectionToken(): string {
  return (
    process.env["CHECKOUT_API_TOKEN"] ||
    process.env["ADMIN_API_TOKEN"] ||
    process.env["EXTERNAL_ADMIN_API_TOKEN"] ||
    ""
  ).trim();
}

function connectionBase(): string {
  return (process.env["CHECKOUT_API_BASE_URL"] || DEFAULT_BASE).replace(/\/+$/, "");
}

export const getExternalServerStatus = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdminAccess();
  const token = connectionToken();
  const hasServiceRole = !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const hasMpToken = !!process.env["MERCADO_PAGO_ACCESS_TOKEN"];
  return {
    baseUrl: connectionBase(),
    hasToken: !!token,
    tokenPreview: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : null,
    hasServiceRole,
    hasMpToken,
    paymentsReady: hasMpToken || !!token,
  };
});

export const revealExternalServerToken = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdminAccess();
  const token = connectionToken();
  if (!token) throw new Error("Nenhum token de conexão configurado.");
  return { token, baseUrl: connectionBase() };
});
