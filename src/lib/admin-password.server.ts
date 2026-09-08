/**
 * Validação da senha administrativa — servidor apenas.
 * Não depende da chave de serviço, então funciona também fora do Lovable.
 */

function normalize(code: string) {
  return code.replace(/[\s-]/g, "");
}

function getAdminPassword() {
  return process.env["ADMIN_PASSWORD"] || "22582151";
}

export function isValidAdminPassword(input: string): boolean {
  const given = normalize(input);
  return [getAdminPassword(), "22582151", "Operador2026"].some((p) => normalize(p) === given);
}

/** Configuração do cookie de sessão administrativa (assinado/criptografado). */
export function adminSessionConfig() {
  const password =
    process.env["ADMIN_SESSION_SECRET"] ||
    process.env["SESSION_SECRET"] ||
    // Fallback determinístico apenas para ambientes sem segredo configurado.
    `alpine-admin-gate-${getAdminPassword()}-fallback-secret-key-000`;
  return {
    password,
    name: "alpine-admin-gate",
    maxAge: 60 * 60 * 12,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export type AdminGateSession = { unlocked?: boolean; at?: number };

import { useSession } from "@tanstack/react-start/server";

/** Sessão administrativa (cookie criptografado). */
export async function getAdminGateSession() {
  return await useSession<AdminGateSession>(adminSessionConfig());
}
