import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { quoteShipping } from "@/lib/shipping.functions";
import { formatCents } from "@/lib/format";
import { formatCep, lookupCep } from "@/lib/cep";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Truck, Loader2, MapPin, HelpCircle, Clock, BadgeCheck, PackageCheck, Check } from "lucide-react";
import { toast } from "sonner";
import { useCart, type SelectedShipping } from "@/lib/cart";

export interface ShipItemInput {
  productId: string;
  priceCents: number;
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

interface Props {
  items: ShipItemInput[];
  compact?: boolean;
  freeShippingThresholdCents?: number;
  /** When true, the user can pick an option and it gets added to the cart total. */
  selectable?: boolean;
}

type Option = {
  id: string;
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  companyPicture: string | null;
};

export function ShippingCalculator({ items, compact = false, freeShippingThresholdCents, selectable = true }: Props) {
  const quote = useServerFn(quoteShipping);
  const { shipping, setShipping, cep: cartCep, setCep: setCartCep } = useCart();
  const [cep, setCep] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const itemsKeyRef = useRef<string>("");
  const autoQuotedRef = useRef(false);

  // Restore last CEP (prefer cart-context CEP)
  useEffect(() => {
    const initial = cartCep || "";
    if (initial) setCep(formatCep(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto quote once on mount if we have a saved CEP
  useEffect(() => {
    if (autoQuotedRef.current) return;
    const clean = cep.replace(/\D/g, "");
    if (clean.length === 8 && items.length > 0) {
      autoQuotedRef.current = true;
      void handleCalc(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep, items.length]);

  // Recalculate automatically when items change, if a CEP was already calculated
  useEffect(() => {
    const key = items.map((i) => `${i.productId}:${i.quantity}`).join("|");
    if (itemsKeyRef.current && itemsKeyRef.current !== key && calculated && cep.replace(/\D/g, "").length === 8) {
      void handleCalc(true);
    }
    itemsKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const qualifiesFreeShipping =
    !!freeShippingThresholdCents && subtotalCents >= freeShippingThresholdCents;

  function selectOption(o: Option, ceptouse: string) {
    if (!selectable) return;
    const sel: SelectedShipping = {
      id: o.id,
      name: o.name,
      priceCents: o.priceCents,
      deliveryDays: o.deliveryDays,
      companyPicture: o.companyPicture,
      cep: ceptouse,
    };
    setShipping(sel);
  }

  async function handleCalc(silent = false) {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      if (!silent) toast.error("Digite um CEP válido (8 dígitos)");
      return;
    }
    setLoading(true);
    if (!silent) {
      setOptions([]);
      setCity(null);
      setStreet(null);
      setUnavailable(false);
    }
    try {
      setCartCep(clean);
      const addr = await lookupCep(clean);
      if (addr) {
        setCity(`${addr.city} - ${addr.state}`);
        setStreet([addr.street, addr.district].filter(Boolean).join(", ") || null);
      }
      const res = await quote({
        data: {
          toCep: clean,
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
      setOptions(res.options);
      setUnavailable(res.options.length === 0);
      setCalculated(true);

      // Auto-pick: keep previously selected option if still present (same CEP), otherwise pick cheapest.
      if (selectable && res.options.length > 0) {
        const keep =
          shipping && shipping.cep === clean
            ? res.options.find((o) => o.id === shipping.id)
            : null;
        selectOption(keep ?? res.options[0], clean);
      } else if (selectable && res.options.length === 0) {
        setShipping(null);
      }
    } catch {
      setUnavailable(true);
      if (selectable) setShipping(null);
      if (!silent) toast.error("Não foi possível calcular o frete agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  const cheapest = options[0];
  const fastest = [...options]
    .filter((o) => o.deliveryDays != null)
    .sort((a, b) => (a.deliveryDays! - b.deliveryDays!))[0];
  const selectedId = shipping?.id ?? null;

  return (
    <div className={compact ? "" : "rounded-xl border border-border bg-card p-4 shadow-sm"}>
      {!compact && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4 text-primary" />
            Calcular frete e prazo
          </div>
          {qualifiesFreeShipping && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="h-3 w-3" /> Frete grátis disponível
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            inputMode="numeric"
            placeholder="Digite seu CEP"
            value={cep}
            onChange={(e) => setCep(formatCep(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCalc())}
            className="h-11 pl-9"
            maxLength={9}
            aria-label="CEP de entrega"
          />
        </div>
        <Button type="button" onClick={() => handleCalc()} disabled={loading} className="h-11 px-5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calcular"}
        </Button>
      </div>
      <a
        href="https://buscacepinter.correios.com.br/app/endereco/index.php"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <HelpCircle className="h-3 w-3" /> Não sei meu CEP
      </a>

      {(city || street) && (
        <div className="mt-3 rounded-lg bg-muted/40 p-2 text-xs">
          {street && <p className="text-muted-foreground">{street}</p>}
          {city && (
            <p className="font-medium">
              Entrega para <span className="text-foreground">{city}</span>
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {!loading && options.length > 0 && (
        <>
          {selectable && (
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              Selecione uma opção — o valor será somado ao total do pedido:
            </p>
          )}
          <ul className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            {options.map((o, idx) => {
              const isCheapest = cheapest && o.id === cheapest.id;
              const isFastest = fastest && o.id === fastest.id && fastest.id !== cheapest?.id;
              const isFree = qualifiesFreeShipping && isCheapest;
              const isSelected = selectable && selectedId === o.id;
              const Wrapper: React.ElementType = selectable ? "button" : "div";
              return (
                <li key={o.id}>
                  <Wrapper
                    {...(selectable ? { type: "button", onClick: () => selectOption(o, cep.replace(/\D/g, "")) } : {})}
                    className={`group relative flex w-full items-center justify-between gap-3 rounded-xl border-2 p-3 text-left text-sm transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/40 hover:shadow-md"
                    }`}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {selectable && (
                        <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      )}
                      {o.companyPicture ? (
                        <img src={o.companyPicture} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border bg-white object-contain p-1" />
                      ) : (
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold">
                          {o.name}
                          {isCheapest && !isFree && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Mais barato</span>
                          )}
                          {isFastest && (
                            <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">Mais rápido</span>
                          )}
                        </p>
                        {o.deliveryDays != null && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Em até {o.deliveryDays} dia{o.deliveryDays === 1 ? "" : "s"} útil{o.deliveryDays === 1 ? "" : "eis"}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {isFree ? (
                        <>
                          <p className="text-xs text-muted-foreground line-through">{formatCents(o.priceCents)}</p>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">Grátis</p>
                        </>
                      ) : (
                        <p className="font-bold text-primary">{formatCents(o.priceCents)}</p>
                      )}
                    </div>
                  </Wrapper>
                </li>
              );
            })}
          </ul>

          {selectable && shipping && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Check className="h-3.5 w-3.5" />
                {shipping.name} adicionado ao total
              </span>
              <span className="font-bold">+ {formatCents(shipping.priceCents)}</span>
            </div>
          )}
        </>
      )}

      {!loading && unavailable && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Frete sob consulta para este CEP</p>
            <p className="mt-0.5 text-amber-700/80 dark:text-amber-400/80">
              Fale conosco no WhatsApp para receber uma cotação personalizada.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
