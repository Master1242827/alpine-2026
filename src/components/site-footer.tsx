import { Link } from "@tanstack/react-router";
import alpineLogo from "@/assets/alpine-logo-footer.jpg";

export function SiteFooter() {
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
            <li>WhatsApp: (18) 98800-1823</li>
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
