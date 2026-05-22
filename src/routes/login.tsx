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
  const [code, setCode] = useState("");
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
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail.");
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
      const { email: adminEmail, password: adminPass } = await bootstrap({ data: { code } });
      const { error } = await supabase.auth.signInWithPassword({
        email: adminEmail, password: adminPass,
      });
      if (error) throw error;
      window.location.href = "/admin";
    } catch (err: any) {
      toast.error(err.message || "Código inválido");
    } finally { setLoading(false); }
  };

  if (view === "admin") {
    return (
      <div className="container mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">Acesso administrativo</h1>
        <form onSubmit={adminSubmit} className="mt-6 space-y-4">
          <div>
            <Label>Código de acesso</Label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="0000-0000"
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

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
      <form onSubmit={customerSubmit} className="mt-6 space-y-4">
        <div>
          <Label>E-mail</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Senha</Label>
          <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="text-primary hover:underline self-start"
        >
          {mode === "signin" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
        <button
          onClick={() => setView("admin")}
          className="text-muted-foreground hover:underline self-start"
        >
          Acesso administrativo
        </button>
      </div>
    </div>
  );
}
