import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import alpineLogo from "@/assets/alpine-logo-footer.jpg";

function formatBrPhone(num: string | null | undefined) {
  const digits = String(num ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  // Strip BR country code (55) for display if present
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

export function SiteFooter() {
  const { data: phone } = useQuery({
    queryKey: ["whatsapp-number"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_whatsapp_number");
      return formatBrPhone(data as any) || "(18) 98800-1823";
    },
    staleTime: 60_000,
  });
  return (
    <footer className="mt-20 bg-dark text-dark-foreground">
      <div className="container mx-auto grid gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <img src={alpineLogo} alt="Alpine" className="h-12 w-auto" />
          <p className="mt-3 text-sm text-dark-foreground/70">
            Acessórios automotivos premium para sua picape.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wide">Loja</h4>
          <ul className="mt-3 space-y-2 text-sm text-dark-foreground/70">
            <li><Link to="/produtos" className="hover:text-primary">Produtos</Link></li>
            <li><Link to="/configurador" className="hover:text-primary">Configurador</Link></li>
            <li><Link to="/carrinho" className="hover:text-primary">Carrinho</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wide">Atendimento</h4>
          <ul className="mt-3 space-y-2 text-sm text-dark-foreground/70">
            <li>WhatsApp: {phone || "(18) 98800-1823"}</li>
            <li>Seg-Sex 9h-18h</li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wide">Garantias</h4>
          <ul className="mt-3 space-y-2 text-sm text-dark-foreground/70">
            <li>Compra 100% segura</li>
            <li>Troca em 7 dias</li>
            <li>Pagamento via Mercado Pago</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-dark-foreground/10 py-4 text-center text-xs text-dark-foreground/50">
        © {new Date().getFullYear()} Alpine. Todos os direitos reservados.
      </div>
    </footer>
  );
}
