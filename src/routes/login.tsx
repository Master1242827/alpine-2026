import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminBootstrap, claimAdminRole } from "@/lib/admin.functions";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta | Alpine Capotas" },
      {
        name: "description",
        content:
          "Acesse sua conta Alpine Capotas para acompanhar pedidos, salvar seus dados e comprar mais rápido.",
      },
      { property: "og:title", content: "Entrar ou criar conta | Alpine Capotas" },
      {
        property: "og:description",
        content: "Acesse sua conta Alpine Capotas para acompanhar pedidos e comprar mais rápido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function authErrorMessage(error: unknown, action: "signin" | "signup") {
  const details =
    error != null && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : undefined;
  const code = typeof details?.code === "string" ? details.code : "";
  const message = typeof details?.message === "string" ? details.message : "";

  if (code === "weak_password" || /weak|easy to guess|pwned/i.test(message)) {
    return "Essa senha é muito fácil de descobrir. Crie outra usando letras maiúsculas e minúsculas, números e símbolos.";
  }
  if (code === "user_already_exists" || /already registered|already exists/i.test(message)) {
    return "Este e-mail já tem uma conta. Use a opção Entrar ou Esqueci minha senha.";
  }
  if (code === "email_address_invalid" || /invalid email/i.test(message)) {
    return "Digite um e-mail válido.";
  }
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(message)) {
    return "Muitas tentativas foram feitas. Aguarde alguns minutos e tente novamente.";
  }
  if (action === "signin" && /invalid login credentials/i.test(message)) {
    return "E-mail ou senha incorretos.";
  }
  if (action === "signin" && /email not confirmed/i.test(message)) {
    return "Confirme seu e-mail antes de entrar. Verifique também a pasta de spam.";
  }
  return action === "signup"
    ? "Não foi possível criar sua conta agora. Confira os dados e tente novamente."
    : "Não foi possível entrar agora. Tente novamente.";
}

function LoginPage() {
  const { redirect } = Route.useSearch();
  const [view, setView] = useState<"customer" | "admin">("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const bootstrap = useServerFn(adminBootstrap);
  const claimRole = useServerFn(claimAdminRole);
  const { user } = useAuth();

  const safeRedirect =
    typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")
      ? redirect
      : "/";

  const customerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (mode === "signup") {
      if (fullName.trim().length < 3) {
        toast.error("Informe seu nome completo.");
        return;
      }
      if (password.length < 8) {
        toast.error("A senha precisa ter ao menos 8 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("As senhas não coincidem.");
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: { full_name: fullName.trim(), phone: phone.trim() },
          },
        });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setFormError("Este e-mail já tem uma conta. Entre com sua senha ou use Esqueci minha senha.");
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
          return;
        }
        if (data.session) {
          toast.success("Conta criada com sucesso!");
          window.location.href = safeRedirect;
          return;
        }
        setFormSuccess("Conta criada! Enviamos um link de confirmação para seu e-mail. Verifique também a pasta de spam.");
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        toast.success("Login realizado");
        window.location.href = safeRedirect;
      }
    } catch (error: unknown) {
      const message = authErrorMessage(error, mode);
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    const target = email.trim().toLowerCase();
    if (!target || !target.includes("@")) {
      toast.error("Digite seu e-mail no campo acima para receber o link de recuperação.");
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de recuperação para o seu e-mail.");
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setResetting(false);
    }
  };

  const adminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Lê a sessão diretamente: o estado do contexto pode ainda não ter
      // hidratado nesta tela, mesmo com o usuário já autenticado.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await claimRole({ data: { password: adminPassword } });
        toast.success("Acesso administrativo liberado");
        window.location.href = "/admin";
        return;
      }
      // Sem sessão: tenta o acesso direto (exige chave de serviço).
      const res = await bootstrap({ data: { password: adminPassword } });
      if (!res.ok) {
        toast.error(res.error ?? "Senha administrativa incorreta");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: res.email,
        password: res.password,
      });
      if (error) throw error;
      window.location.href = "/admin";
    } catch (err: any) {
      toast.error(err.message || "Senha administrativa incorreta");
    } finally {
      setLoading(false);
    }
  };

  if (view === "admin") {
    return (
      <div className="container mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">Acesso administrativo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user
            ? `Você está conectado como ${user.email}. Digite a senha administrativa para liberar o painel nesta conta.`
            : "Digite a senha administrativa. Se não funcionar no seu servidor, entre primeiro com seu e-mail e senha e volte aqui."}
        </p>
        <form onSubmit={adminSubmit} className="mt-6 space-y-4">
          <div>
            <Label>Senha administrativa</Label>
            <Input
              autoFocus
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Digite a senha administrativa"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Aguarde…" : user ? "Liberar acesso de administrador" : "Entrar"}
          </Button>
        </form>
        {!user && (
          <button
            onClick={() => setView("customer")}
            className="mt-4 w-full text-center text-sm text-primary hover:underline"
          >
            Entrar com e-mail e senha primeiro
          </button>
        )}
        <button
          onClick={() => setView("customer")}
          className="mt-4 text-sm text-muted-foreground hover:underline"
        >
          ← Voltar
        </button>
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      {/* Toggle de modo bem destacado */}
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition ${!isSignup ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition ${isSignup ? "bg-background shadow" : "text-muted-foreground"}`}
        >
          Criar conta
        </button>
      </div>

      <div className={isSignup ? "rounded-xl border-2 border-primary/40 bg-primary/5 p-6" : ""}>
        <h1 className="text-2xl font-bold">
          {isSignup ? "Crie sua conta grátis" : "Bem-vindo de volta"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignup
            ? "Preencha os dados abaixo para acompanhar seus pedidos e agilizar suas compras."
            : "Entre com seu e-mail e senha para continuar."}
        </p>

        {formError && (
          <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        )}
        {formSuccess && (
          <div role="status" className="mt-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {formSuccess}
          </div>
        )}

        <form onSubmit={customerSubmit} className="mt-6 space-y-4">
          {isSignup && (
            <>
              <div>
                <Label>Nome completo</Label>
                <Input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  maxLength={120}
                  autoComplete="name"
                />
              </div>
              <div>
                <Label>Telefone / WhatsApp</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
            </>
          )}
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              required
              minLength={isSignup ? 8 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "Crie uma senha forte (mín. 8 caracteres)" : "Sua senha"}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
            {isSignup && (
              <p className="mt-1 text-xs text-muted-foreground">
                Use 8 ou mais caracteres, misturando letras, números e símbolos.
              </p>
            )}
          </div>
          {isSignup && (
            <div>
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading} size="lg">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Aguarde…" : isSignup ? "Cadastrar" : "Entrar"}
          </Button>
        </form>

        {!isSignup && (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={resetting}
            className="mt-3 w-full text-center text-sm text-primary hover:underline disabled:opacity-60"
          >
            {resetting ? "Enviando…" : "Esqueci minha senha"}
          </button>
        )}

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {isSignup ? (
            <>
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-semibold text-primary hover:underline"
              >
                Faça login
              </button>
            </>
          ) : (
            <>
              Ainda não tem conta?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-semibold text-primary hover:underline"
              >
                Cadastre-se grátis
              </button>
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => setView("admin")}
        className="mt-6 block w-full text-center text-xs text-muted-foreground hover:underline"
      >
        Acesso administrativo
      </button>
    </div>
  );
}
