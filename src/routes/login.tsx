import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { claimAdminRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const claim = useServerFn(claimAdminRole);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado");
        const trimmed = code.trim();
        if (trimmed) {
          try {
            await claim({ data: { code: trimmed } });
            window.location.href = "/admin";
            return;
          } catch (err: any) {
            toast.error(err.message || "Código administrativo inválido");
          }
        }
        window.location.href = "/";
      }
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally { setLoading(false); }
  };

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><Label>E-mail</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>Senha</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {mode === "signin" && (
          <div>
            <Label>Acesso administrativo</Label>
            <Input placeholder="Código de acesso (opcional)" value={code} onChange={(e) => setCode(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Deixe em branco para acesso de cliente</p>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
        </Button>
      </form>
      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 text-sm text-primary hover:underline">
        {mode === "signin" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
      </button>
    </div>
  );
}
