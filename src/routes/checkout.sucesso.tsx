import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/sucesso")({
  component: () => (
    <div className="container mx-auto max-w-lg px-4 py-20 text-center">
      <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
      <h1 className="mt-4 text-2xl font-bold">Pagamento recebido!</h1>
      <p className="mt-2 text-muted-foreground">
        Seu pedido foi registrado. Em breve entraremos em contato para confirmar entrega e prazo.
      </p>
      <Button asChild className="mt-6"><Link to="/">Voltar para a loja</Link></Button>
    </div>
  ),
});
