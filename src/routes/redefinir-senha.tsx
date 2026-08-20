import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/redefinir-senha")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Redefinir senha | Alpine Capotas" },
      { name: "description", content: "Crie uma nova senha para acessar sua conta Alpine Capotas." },
      { property: "og:title", content: "Redefinir senha | Alpine Capotas" },
      { property: "og:description", content: "Crie uma nova senha para acessar sua conta Alpine Capotas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) setHasSession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha precisa ter ao menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      navigate({ to: "/conta" });
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível alterar a senha.");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="container mx-auto flex justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Redefinir senha</h1>
      {!hasSession ? (
        <Card className="mt-6 p-6 text-sm text-muted-foreground">
          <p>
            Este link expirou ou não é mais válido. Volte à tela de login e peça um novo e-mail de
            recuperação.
          </p>
          <Button className="mt-4 w-full" onClick={() => navigate({ to: "/login" })}>
            Ir para o login
          </Button>
        </Card>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input
              type="password"
              autoFocus
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input
              type="password"
              minLength={6}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a senha"
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar nova senha
          </Button>
        </form>
      )}
    </div>
  );
}
