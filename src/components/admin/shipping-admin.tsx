import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getShippingIntegrationStatus,
  updateShippingIntegration,
  testShippingIntegration,
} from "@/lib/shipping.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Truck } from "lucide-react";

type Status = Awaited<ReturnType<typeof testShippingIntegration>>;
type Info = Awaited<ReturnType<typeof getShippingIntegrationStatus>>;

export function ShippingAdmin() {
  const getStatus = useServerFn(getShippingIntegrationStatus);
  const updateToken = useServerFn(updateShippingIntegration);
  const test = useServerFn(testShippingIntegration);

  const [info, setInfo] = useState<Info | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [loadingTest, setLoadingTest] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const i = await getStatus();
      setInfo(i);
      if (i.hasToken) {
        setLoadingTest(true);
        try {
          const s = await test();
          setStatus(s);
        } finally {
          setLoadingTest(false);
        }
      } else {
        setStatus({
          ok: false,
          status: "missing",
          message: "Token da Frenet não configurado. Cadastre um token para ativar o cálculo de frete.",
          account: null,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function handleSave() {
    if (token.trim().length < 10) {
      toast.error("Cole um token válido da Frenet.");
      return;
    }
    setSaving(true);
    try {
      await updateToken({ data: { token: token.trim() } });
      toast.success("Token atualizado com sucesso.");
      setToken("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setLoadingTest(true);
    try {
      const s = await test();
      setStatus(s);
      if (s.ok) toast.success(s.message);
      else toast.error(s.message);
    } finally {
      setLoadingTest(false);
    }
  }

  const badge = (() => {
    if (loadingTest && !status) return <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Verificando</Badge>;
    if (!status) return <Badge variant="secondary">—</Badge>;
    if (status.ok) return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Ativa</Badge>;
    if (status.status === "expired") return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Token inválido</Badge>;
    if (status.status === "missing") return <Badge variant="secondary"><AlertTriangle className="mr-1 h-3 w-3" />Sem token</Badge>;
    return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Erro</Badge>;
  })();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Frenet</h3>
          </div>
          {badge}
        </div>

        {status && !status.ok && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {status.message}
            {status.status === "expired" && (
              <p className="mt-1 text-xs opacity-80">
                Acesse painel.frenet.com.br → Minha Conta → Integração, copie o token
                e cole abaixo.
              </p>
            )}
          </div>
        )}
        {status && status.ok && (
          <div className="mb-4 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">
            {status.message}
            {status.account && <p className="mt-1 text-xs opacity-80">Conta: {status.account}</p>}
          </div>
        )}

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Token cadastrado</dt><dd>{info?.tokenPreview || "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Origem</dt><dd>{info?.source === "database" ? "Painel" : info?.source === "env" ? "Variável de ambiente" : "Nenhuma"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Atualizado em</dt><dd>{info?.updatedAt ? new Date(info.updatedAt).toLocaleString("pt-BR") : "—"}</dd></div>
        </dl>

        <Button variant="outline" className="mt-4" onClick={handleTest} disabled={loadingTest}>
          {loadingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Testar conexão
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="mb-1 text-lg font-semibold">Atualizar token</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Cole o token da Frenet. O cliente final nunca vê erro técnico — se o token
          falhar, o checkout exibe uma mensagem amigável.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="frenet-token">Token de acesso</Label>
            <Input
              id="frenet-token"
              type="password"
              autoComplete="off"
              placeholder="Cole aqui o token da Frenet"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar token
          </Button>
          <a
            href="https://painel.frenet.com.br/Integration"
            target="_blank"
            rel="noreferrer"
            className="block text-center text-xs text-muted-foreground hover:text-primary"
          >
            Como gerar um token na Frenet →
          </a>
        </div>
      </Card>
    </div>
  );
}
