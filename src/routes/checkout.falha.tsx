import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/checkout/falha")({
  component: () => (
    <div className="container mx-auto max-w-lg px-4 py-20 text-center">
      <XCircle className="mx-auto h-16 w-16 text-destructive" />
      <h1 className="mt-4 text-2xl font-bold">Pagamento não concluído</h1>
      <p className="mt-2 text-muted-foreground">
        Ocorreu um problema com seu pagamento. Você pode tentar novamente ou nos chamar no WhatsApp.
      </p>
      <Button asChild className="mt-6"><Link to="/carrinho">Voltar ao carrinho</Link></Button>
    </div>
  ),
});
