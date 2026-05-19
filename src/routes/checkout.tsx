import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/format";
import { createCheckoutPreference } from "@/lib/checkout.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

function CheckoutPage() {
  const { items, subtotalCents, clear } = useCart();
  const navigate = useNavigate();
  const createPref = useServerFn(createCheckoutPreference);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    notes: "",
  });
  const shippingCostCents = 0; // a combinar
  const total = subtotalCents + shippingCostCents;

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio</h1>
        <Button asChild className="mt-6"><Link to="/produtos">Ver produtos</Link></Button>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id ?? null;
      const res = await createPref({
        data: {
          customer: { name: form.name, email: form.email, phone: form.phone },
          shipping: {
            cep: form.cep,
            street: form.street,
            number: form.number,
            complement: form.complement,
            district: form.district,
            city: form.city,
            state: form.state.toUpperCase(),
          },
          shippingCostCents,
          shippingService: "A combinar",
          notes: form.notes,
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            priceCents: i.priceCents,
            quantity: i.quantity,
            vehicleConfig: i.vehicleConfig,
          })),
          userId,
        },
      });
      clear();
      window.location.href = res.initPoint;
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Falha ao iniciar pagamento");
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto grid gap-8 px-4 py-10 md:grid-cols-[1fr_320px]">
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Seus dados</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nome completo" required value={form.name} onChange={set("name")} className="sm:col-span-2" />
            <Field label="E-mail" type="email" required value={form.email} onChange={set("email")} />
            <Field label="WhatsApp" required value={form.phone} onChange={set("phone")} placeholder="(00) 00000-0000" />
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Endereço de entrega</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-6">
            <Field label="CEP" required value={form.cep} onChange={set("cep")} className="sm:col-span-2" />
            <Field label="Rua" required value={form.street} onChange={set("street")} className="sm:col-span-4" />
            <Field label="Número" required value={form.number} onChange={set("number")} className="sm:col-span-2" />
            <Field label="Complemento" value={form.complement} onChange={set("complement")} className="sm:col-span-4" />
            <Field label="Bairro" required value={form.district} onChange={set("district")} className="sm:col-span-3" />
            <Field label="Cidade" required value={form.city} onChange={set("city")} className="sm:col-span-2" />
            <Field label="UF" required maxLength={2} value={form.state} onChange={set("state")} className="sm:col-span-1" />
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Observações</h2>
          <Textarea className="mt-3" rows={3} value={form.notes} onChange={set("notes")} placeholder="Modelo do veículo, ano, cor da capota, etc." />
        </section>
        <Button type="submit" className="w-full" disabled={loading} size="lg">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecionando…</> : "Pagar com Mercado Pago"}
        </Button>
      </form>

      <aside className="h-fit space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Resumo</h2>
        <ul className="space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-2">
              <span className="truncate">{i.quantity}× {i.name}</span>
              <span className="font-medium">{formatCents(i.priceCents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCents(subtotalCents)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Frete</span><span>A combinar</span></div>
          <div className="mt-2 flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">{formatCents(total)}</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Pagamento processado de forma segura pelo Mercado Pago. Cartão, PIX e boleto disponíveis.</p>
      </aside>
    </div>
  );
}

function Field({
  label, className, required, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs">{label}{required && " *"}</Label>
      <Input required={required} {...props} />
    </div>
  );
}
