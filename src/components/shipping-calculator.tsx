import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { quoteShipping } from "@/lib/shipping.functions";
import { formatCents } from "@/lib/format";
import { formatCep, lookupCep } from "@/lib/cep";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Truck, Loader2, MapPin, HelpCircle } from "lucide-react";
import { toast } from "sonner";

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
}

type Option = {
  id: string;
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  companyPicture: string | null;
};

export function ShippingCalculator({ items, compact = false }: Props) {
  const quote = useServerFn(quoteShipping);
  const [cep, setCep] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleCalc() {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      toast.error("Digite um CEP válido (8 dígitos)");
      return;
    }
    setLoading(true);
    setOptions([]);
    setCity(null);
    try {
      const addr = await lookupCep(clean);
      if (addr) setCity(`${addr.city} - ${addr.state}`);
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
      if (res.options.length === 0) {
        toast.error("Frete indisponível para este CEP no momento. Fale conosco no WhatsApp.");
      }
    } catch {
      toast.error("Não foi possível calcular o frete agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "" : "rounded-xl border border-border bg-card p-4"}>
      {!compact && (
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4 text-primary" />
          Simular frete e prazo
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
          />
        </div>
        <Button type="button" onClick={handleCalc} disabled={loading} className="h-11 px-5">
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

      {city && (
        <p className="mt-3 text-xs text-muted-foreground">Entrega para <strong className="text-foreground">{city}</strong></p>
      )}

      {options.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {options.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 bg-background p-3 text-sm">
              <div className="flex items-center gap-3 min-w-0">
                {o.companyPicture ? (
                  <img src={o.companyPicture} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />
                ) : (
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-muted">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.name}</p>
                  {o.deliveryDays != null && (
                    <p className="text-xs text-muted-foreground">
                      Em até {o.deliveryDays} dia{o.deliveryDays === 1 ? "" : "s"} útil{o.deliveryDays === 1 ? "" : "eis"}
                    </p>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-bold text-primary">{formatCents(o.priceCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
