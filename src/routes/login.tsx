import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminBootstrap } from "@/lib/admin.functions";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const [view, setView] = useState<"customer" | "admin">("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const bootstrap = useServerFn(adminBootstrap);

  const customerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw error;
        toast.success("Cadastro realizado com sucesso! Enviamos um e-mail de confirmação. Faça login para continuar.");
        setMode("signin");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado");
        const safe = typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
        window.location.href = safe;
      }
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally { setLoading(false); }
  };

  const adminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { email: adminEmail, password: adminPass } = await bootstrap({ data: { password: adminPassword } });
      const { error } = await supabase.auth.signInWithPassword({
        email: adminEmail, password: adminPass,
      });
      if (error) throw error;
      window.location.href = "/admin";
    } catch (err: any) {
      toast.error(err.message || "Senha administrativa incorreta");
    } finally { setLoading(false); }
  };

  if (view === "admin") {
    return (
      <div className="container mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">Acesso administrativo</h1>
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
            {loading ? "Aguarde…" : "Entrar"}
          </Button>
        </form>
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

        <form onSubmit={customerSubmit} className="mt-6 space-y-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "Crie uma senha (mín. 6 caracteres)" : "Sua senha"}
            />
            {isSignup && (
              <p className="mt-1 text-xs text-muted-foreground">
                Use pelo menos 6 caracteres. Você receberá um e-mail de confirmação.
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading} size="lg">
            {loading ? "Aguarde…" : isSignup ? "Cadastrar" : "Entrar"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {isSignup ? (
            <>Já tem conta? <button type="button" onClick={() => setMode("signin")} className="font-semibold text-primary hover:underline">Faça login</button></>
          ) : (
            <>Ainda não tem conta? <button type="button" onClick={() => setMode("signup")} className="font-semibold text-primary hover:underline">Cadastre-se grátis</button></>
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
