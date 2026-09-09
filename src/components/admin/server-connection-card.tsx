import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getExternalServerStatus,
  revealExternalServerToken,
} from "@/lib/server-connection.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Copy, Server } from "lucide-react";

type Status = {
  baseUrl: string;
  hasToken: boolean;
  tokenPreview: string | null;
  hasServiceRole: boolean;
  hasMpToken: boolean;
  paymentsReady: boolean;
};

export function ServerConnectionCard() {
  const getStatus = useServerFn(getExternalServerStatus);
  const reveal = useServerFn(revealExternalServerToken);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  useEffect(() => {
    getStatus()
      .then((s) => setStatus(s as Status))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Não foi possível carregar."),
      );
  }, [getStatus]);

  const toggleToken = async () => {
    if (token) {
      setToken(null);
      return;
    }
    setLoadingToken(true);
    try {
      const out = await reveal();
      setToken((out as { token: string }).token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao mostrar a chave.");
    } finally {
      setLoadingToken(false);
    }
  };

  const copyEnv = async () => {
    setLoadingToken(true);
    try {
      const out = (await reveal()) as { token: string; baseUrl: string };
      const text = `CHECKOUT_API_BASE_URL=${out.baseUrl}\nCHECKOUT_API_TOKEN=${out.token}`;
      await navigator.clipboard.writeText(text);
      toast.success("Copiado! Cole no arquivo .env do seu servidor.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao copiar.");
    } finally {
      setLoadingToken(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Conexão do servidor externo</h3>
        {status ? (
          status.paymentsReady ? (
            <Badge variant="secondary">Pronto</Badge>
          ) : (
            <Badge variant="destructive">Falta configurar</Badge>
          )
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Se a loja também roda no seu próprio servidor, copie estas duas linhas para o arquivo
        <span className="font-mono"> .env</span> de lá e reinicie o site. Sem elas, o pagamento
        aparece como “não configurado”.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {status ? (
        <div className="space-y-2 text-sm">
          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">
            <div>CHECKOUT_API_BASE_URL={status.baseUrl}</div>
            <div>
              CHECKOUT_API_TOKEN=
              {token ?? status.tokenPreview ?? "—"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={toggleToken} disabled={!status.hasToken || loadingToken}>
              {loadingToken ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : token ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="ml-2">{token ? "Ocultar chave" : "Mostrar chave"}</span>
            </Button>
            <Button size="sm" onClick={copyEnv} disabled={!status.hasToken || loadingToken}>
              <Copy className="h-4 w-4" />
              <span className="ml-2">Copiar as duas linhas</span>
            </Button>
          </div>
        </div>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : null}
    </Card>
  );
}
