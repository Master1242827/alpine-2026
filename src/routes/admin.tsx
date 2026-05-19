import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({ component: AdminPlaceholder });

function AdminPlaceholder() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Painel administrativo</h1>
      <p className="mt-3 text-muted-foreground">
        Esta área será concluída na próxima etapa, com:
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
        <li>Cadastro e edição de produtos com upload de fotos</li>
        <li>Gestão de estoque</li>
        <li>Visualização de pedidos e status de pagamento Mercado Pago</li>
        <li>Configuração do configurador de veículo (marcas, modelos, cabines)</li>
      </ul>
    </div>
  );
}
