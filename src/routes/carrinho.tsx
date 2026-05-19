import { createFileRoute, Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/carrinho")({ component: CartPage });

function CartPage() {
  const { items, remove, setQty, subtotalCents } = useCart();
  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio</h1>
        <Button asChild className="mt-6"><Link to="/produtos">Ver produtos</Link></Button>
      </div>
    );
  }
  return (
    <div className="container mx-auto grid gap-8 px-4 py-10 md:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.productId} className="flex gap-4 rounded-lg border border-border bg-card p-3">
            {i.image && <img src={i.image} alt="" className="h-20 w-20 rounded object-cover" />}
            <div className="flex-1">
              <p className="font-semibold">{i.name}</p>
              <p className="text-sm text-primary font-bold">{formatCents(i.priceCents)}</p>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} value={i.quantity}
                  onChange={(e) => setQty(i.productId, parseInt(e.target.value) || 1)}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-sm" />
                <button onClick={() => remove(i.productId)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <aside className="h-fit rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Resumo</h2>
        <div className="mt-4 flex justify-between text-sm">
          <span>Subtotal</span><span className="font-semibold">{formatCents(subtotalCents)}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Frete e pagamento na próxima etapa.</p>
        <Button asChild className="mt-4 w-full"><Link to="/checkout">Finalizar compra</Link></Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Pagamento seguro via Mercado Pago</p>
      </aside>
    </div>
  );
}
