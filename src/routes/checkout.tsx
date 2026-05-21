import { createFileRoute, Link } from "@tanstack/react-router";
import { forwardRef, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/format";
import { formatCep, lookupCep } from "@/lib/cep";
import { createCheckoutPreference } from "@/lib/checkout.functions";
import { quoteShipping } from "@/lib/shipping.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Truck, MapPin, User, ShoppingBag, CheckCircle2, ChevronDown, ChevronUp, Lock, UserPlus, CreditCard, QrCode } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

type ShipOption = { id: string; name: string; priceCents: number; deliveryDays: number | null; companyPicture: string | null };

function CheckoutPage() {
  const { items, subtotalCents, clear, shipping: cartShipping, cep: cartCep, setShipping: setCartShipping } = useCart();
  const { user, loading: authLoading } = useAuth();
  const createPref = useServerFn(createCheckoutPreference);
  const quote = useServerFn(quoteShipping);

  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [selectedShip, setSelectedShip] = useState<ShipOption | null>(
    cartShipping
      ? {
          id: cartShipping.id,
          name: cartShipping.name,
          priceCents: cartShipping.priceCents,
          deliveryDays: cartShipping.deliveryDays,
          companyPicture: cartShipping.companyPicture,
        }
      : null,
  );
  const [showSummary, setShowSummary] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "pix">("mercadopago");
  const [pixSettings, setPixSettings] = useState<{
    pix_enabled: boolean;
    pix_discount_percent: number;
  } | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    cep: cartCep ? formatCep(cartCep) : "", street: "", number: "", complement: "",
    district: "", city: "", state: "", notes: "",
  });
  const numberRef = useRef<HTMLInputElement>(null);
  const shippingCostCents = selectedShip?.priceCents ?? 0;
  const baseTotal = subtotalCents + shippingCostCents;
  const pixDiscountPercent = pixSettings?.pix_enabled ? Number(pixSettings.pix_discount_percent) || 0 : 0;
  const discountCents =
    paymentMethod === "pix" ? Math.round((baseTotal * pixDiscountPercent) / 100) : 0;
  const total = baseTotal - discountCents;
  const lastQuotedCep = useRef<string>("");

  useEffect(() => {
    supabase
      .from("store_settings")
      .select("pix_enabled, pix_discount_percent")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPixSettings(data as any);
      });
  }, []);

  // Pré-preenche e-mail/nome a partir da conta autenticada
  useEffect(() => {
    if (user) {
      setForm((p) => ({
        ...p,
        email: p.email || user.email || "",
        name: p.name || (user.user_metadata?.full_name as string) || "",
      }));
    }
  }, [user]);

  // Auto address lookup + auto quote when CEP becomes valid.
  // IMPORTANT: declared BEFORE any conditional early-return below so hook order stays stable.
  useEffect(() => {
    const clean = form.cep.replace(/\D/g, "");
    if (clean.length !== 8 || clean === lastQuotedCep.current) return;
    if (items.length === 0) return;
    lastQuotedCep.current = clean;
    (async () => {
      const addr = await lookupCep(clean);
      if (addr) {
        setForm((p) => ({
          ...p,
          street: addr.street || p.street,
          district: addr.district || p.district,
          city: addr.city || p.city,
          state: addr.state || p.state,
        }));
        setTimeout(() => numberRef.current?.focus(), 50);
      }
      runQuote(clean);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cep, items.length]);



  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Seu carrinho está vazio</h1>
        <Button asChild className="mt-6"><Link to="/produtos">Ver produtos</Link></Button>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="container mx-auto flex items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12">
        <Card className="p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Crie sua conta para finalizar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Para concluir a compra com segurança e acompanhar o pedido, é necessário ter um cadastro.
            Você pode continuar olhando os produtos e simulando o frete livremente.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to="/login" search={{ redirect: "/checkout" } as never}>
                <UserPlus className="mr-2 h-4 w-4" /> Criar conta ou entrar
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/carrinho">Voltar ao carrinho</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Seu carrinho fica salvo enquanto você faz o cadastro.
          </p>
        </Card>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function runQuote(cep: string) {
    setQuoting(true);
    setShipOptions([]);
    try {
      const res = await quote({
        data: {
          toCep: cep,
          products: items.map((i) => ({
            id: i.productId,
            width: i.widthCm,
            height: i.heightCm,
            length: i.lengthCm,
            weight: i.weightKg,
            insurance_value: (i.priceCents / 100) * i.quantity,
            quantity: i.quantity,
          })),
        },
      });
      setShipOptions(res.options);
      // Preserve previous selection if same CEP and option still present, else fall back to first.
      const preferredId = (cartShipping && cartShipping.cep === cep) ? cartShipping.id : selectedShip?.id;
      const keep = preferredId ? res.options.find((o) => o.id === preferredId) : null;
      const next = keep ?? res.options[0] ?? null;
      setSelectedShip(next);
      if (next) {
        setCartShipping({
          id: next.id, name: next.name, priceCents: next.priceCents,
          deliveryDays: next.deliveryDays, companyPicture: next.companyPicture, cep,
        });
      } else {
        setCartShipping(null);
      }
      if (res.options.length === 0) {
        toast.error("Frete indisponível para este CEP no momento. Fale conosco no WhatsApp para combinar a entrega.");
      }
    } catch {
      toast.error("Não foi possível calcular o frete agora. Tente novamente em instantes.");
    } finally {
      setQuoting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {

    e.preventDefault();
    if (!selectedShip) { toast.error("Calcule e selecione uma opção de frete"); return; }
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id ?? null;

      if (paymentMethod === "pix") {
        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .insert({
            user_id: userId,
            customer_name: form.name,
            customer_email: form.email,
            customer_phone: form.phone,
            shipping_address: {
              cep: form.cep, street: form.street, number: form.number,
              complement: form.complement, district: form.district,
              city: form.city, state: form.state.toUpperCase(),
            },
            shipping_cost_cents: shippingCostCents,
            shipping_service: selectedShip.name,
            subtotal_cents: subtotalCents,
            discount_cents: discountCents,
            total_cents: total,
            notes: form.notes,
            status: "pending",
            payment_method: "pix",
          } as any)
          .select("id")
          .single();
        if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");
        const itemsRows = items.map((i) => ({
          order_id: order.id,
          product_id: i.productId,
          product_name: i.name,
          unit_price_cents: i.priceCents,
          quantity: i.quantity,
          vehicle_config: i.vehicleConfig ?? null,
        }));
        const { error: itemsErr } = await supabase.from("order_items").insert(itemsRows);
        if (itemsErr) throw new Error(itemsErr.message);
        clear();
        window.location.href = `/checkout/pix?order=${order.id}`;
        return;
      }

      const res = await createPref({
        data: {
          customer: { name: form.name, email: form.email, phone: form.phone },
          shipping: {
            cep: form.cep, street: form.street, number: form.number,
            complement: form.complement, district: form.district,
            city: form.city, state: form.state.toUpperCase(),
          },
          shippingCostCents,
          shippingService: selectedShip.name,
          notes: form.notes,
          items: items.map((i) => ({
            productId: i.productId, name: i.name,
            priceCents: i.priceCents, quantity: i.quantity,
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
    <div className="bg-muted/30 pb-32 md:pb-12">
      {/* Mobile sticky summary */}
      <div className="sticky top-0 z-30 border-b border-border bg-background md:hidden">
        <button
          type="button"
          onClick={() => setShowSummary((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingBag className="h-4 w-4 text-primary" />
            {items.length} {items.length === 1 ? "item" : "itens"} · ver resumo
            {showSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <span className="font-bold text-primary">{formatCents(total)}</span>
        </button>
        {showSummary && (
          <div className="border-t border-border bg-card px-4 py-3 text-sm">
            <ul className="space-y-1.5">
              {items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">{i.quantity}× {i.name}</span>
                  <span>{formatCents(i.priceCents * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
              <Row label="Subtotal" value={formatCents(subtotalCents)} />
              <Row label="Frete" value={selectedShip ? formatCents(shippingCostCents) : "—"} />
            </div>
          </div>
        )}
      </div>

      <div className="container mx-auto grid gap-6 px-4 py-6 md:grid-cols-[1fr_360px] md:py-10">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Section icon={<User className="h-4 w-4" />} title="Seus dados" step={1}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome completo" required value={form.name} onChange={set("name")} className="sm:col-span-2" placeholder="Como aparece no documento" />
              <Field label="E-mail" type="email" required value={form.email} onChange={set("email")} placeholder="voce@email.com" />
              <Field label="WhatsApp" required value={form.phone} onChange={set("phone")} placeholder="(00) 00000-0000" inputMode="tel" />
            </div>
          </Section>

          <Section icon={<MapPin className="h-4 w-4" />} title="Endereço de entrega" step={2}>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <Label className="mb-1 block text-xs font-medium">CEP *</Label>
                <div className="relative">
                  <Input
                    required
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(e) => setForm((p) => ({ ...p, cep: formatCep(e.target.value) }))}
                    className="h-11 pr-10"
                  />
                  {quoting && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
                <a
                  href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                  target="_blank" rel="noreferrer"
                  className="mt-1 inline-block text-xs text-muted-foreground hover:text-primary"
                >Não sei meu CEP</a>
              </div>
              <Field label="Rua" required value={form.street} onChange={set("street")} className="sm:col-span-3" />
              <Field label="Número" required ref={numberRef} value={form.number} onChange={set("number")} className="sm:col-span-2" />
              <Field label="Complemento" value={form.complement} onChange={set("complement")} className="sm:col-span-4" placeholder="Apto, bloco… (opcional)" />
              <Field label="Bairro" required value={form.district} onChange={set("district")} className="sm:col-span-3" />
              <Field label="Cidade" required value={form.city} onChange={set("city")} className="sm:col-span-2" />
              <Field label="UF" required maxLength={2} value={form.state} onChange={set("state")} className="sm:col-span-1" />
            </div>
          </Section>

          <Section icon={<Truck className="h-4 w-4" />} title="Entrega" step={3}>
            {!form.cep && (
              <p className="text-sm text-muted-foreground">Digite o CEP acima para ver opções de entrega.</p>
            )}
            {quoting && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculando opções de frete…
              </div>
            )}
            {!quoting && shipOptions.length > 0 && (
              <ul className="space-y-2">
                {shipOptions.map((o) => {
                  const selected = selectedShip?.id === o.id;
                  return (
                    <li key={o.id}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm transition ${selected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"}`}>
                        <input type="radio" name="ship" checked={selected} onChange={() => { setSelectedShip(o); setCartShipping({ id: o.id, name: o.name, priceCents: o.priceCents, deliveryDays: o.deliveryDays, companyPicture: o.companyPicture, cep: form.cep.replace(/\D/g, "") }); }} className="sr-only" />
                        <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                          {selected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                        </div>
                        {o.companyPicture ? (
                          <img src={o.companyPicture} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
                        ) : (
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-muted">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{o.name}</p>
                          {o.deliveryDays != null && (
                            <p className="text-xs text-muted-foreground">
                              Chega em até {o.deliveryDays} dia{o.deliveryDays === 1 ? "" : "s"} útil{o.deliveryDays === 1 ? "" : "eis"}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-bold text-primary">{formatCents(o.priceCents)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section icon={<CreditCard className="h-4 w-4" />} title="Forma de pagamento" step={4}>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("mercadopago")}
                className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${paymentMethod === "mercadopago" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <CreditCard className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Cartão / Boleto</p>
                  <p className="text-xs text-muted-foreground">Mercado Pago — até 10x</p>
                  <p className="mt-1 text-sm font-bold">{formatCents(baseTotal)}</p>
                </div>
              </button>
              {pixSettings?.pix_enabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pix")}
                  className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${paymentMethod === "pix" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <QrCode className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      PIX{" "}
                      {pixDiscountPercent > 0 && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                          -{pixDiscountPercent}%
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Aprovação rápida</p>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {formatCents(baseTotal - Math.round((baseTotal * pixDiscountPercent) / 100))}
                    </p>
                  </div>
                </button>
              )}
            </div>
          </Section>

          <Section icon={<CheckCircle2 className="h-4 w-4" />} title="Observações" step={5}>
            <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Modelo do veículo, ano, cor da capota, etc. (opcional)" />
          </Section>

          <Button type="submit" className="hidden h-12 w-full md:flex" disabled={loading || !selectedShip} size="lg">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecionando…</> : <><Lock className="mr-2 h-4 w-4" /> Pagar {formatCents(total)}</>}
          </Button>
        </form>

        {/* Desktop summary */}
        <aside className="hidden h-fit space-y-4 rounded-xl border border-border bg-card p-5 md:sticky md:top-6 md:block">
          <h2 className="text-lg font-bold">Resumo do pedido</h2>
          <ul className="space-y-3 text-sm">
            {items.map((i) => (
              <li key={i.productId} className="flex gap-3">
                {i.image && <img src={i.image} alt="" className="h-14 w-14 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">Qtd: {i.quantity}</p>
                </div>
                <span className="text-sm font-semibold">{formatCents(i.priceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatCents(subtotalCents)} />
            <Row label="Frete" value={selectedShip ? formatCents(shippingCostCents) : <span className="text-muted-foreground">A calcular</span>} />
            {discountCents > 0 && (
              <Row label={`Desconto PIX (${pixDiscountPercent}%)`} value={<span className="text-primary">- {formatCents(discountCents)}</span>} />
            )}
            <div className="flex justify-between pt-2 text-base font-bold">
              <span>Total</span><span className="text-primary">{formatCents(total)}</span>
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Pagamento seguro
          </p>
        </aside>

        {/* Mobile bottom bar */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background p-3 shadow-lg md:hidden">
          <Button type="button" onClick={handleSubmit as any} className="h-12 w-full" disabled={loading || !selectedShip} size="lg">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecionando…</>
              : <><Lock className="mr-2 h-4 w-4" /> Pagar {formatCents(total)}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, step, children }: { icon: React.ReactNode; title: string; step: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <header className="mb-4 flex items-center gap-3">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{step}</div>
        <h2 className="flex items-center gap-2 text-base font-bold">{icon}{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}

const Field = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }>(
  ({ label, className, required, ...props }, ref) => (
    <div className={className}>
      <Label className="mb-1 block text-xs font-medium">{label}{required && " *"}</Label>
      <Input ref={ref} required={required} className="h-11" {...props} />
    </div>
  ),
);
Field.displayName = "Field";
