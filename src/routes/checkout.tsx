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
import { createCheckoutPreference, createPixPayment, createCardPayment, createBoletoPayment, getPublicStoreSettings } from "@/lib/checkout.functions";
import { quoteShipping } from "@/lib/shipping.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Truck, MapPin, User, ShoppingBag, CheckCircle2, ChevronDown, ChevronUp, Lock, UserPlus, CreditCard, QrCode, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { QRCodeCanvas } from "qrcode.react";


export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

type ShipOption = { id: string; name: string; priceCents: number; deliveryDays: number | null; companyPicture: string | null };

function CheckoutPage() {
  const { items, subtotalCents, clear, shipping: cartShipping, cep: cartCep, setShipping: setCartShipping } = useCart();
  const { user, loading: authLoading } = useAuth();
  const createPref = useServerFn(createCheckoutPreference);
  const createPix = useServerFn(createPixPayment);
  const createCard = useServerFn(createCardPayment);
  const createBoleto = useServerFn(createBoletoPayment);
  const loadPublicSettings = useServerFn(getPublicStoreSettings);
  const quote = useServerFn(quoteShipping);
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [pixInline, setPixInline] = useState<{
    orderId: string;
    qrCode: string;
    qrCodeBase64?: string;
    totalCents: number;
    expiresAt?: string;
  } | null>(null);
  const [pixCountdown, setPixCountdown] = useState("");

  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvv: "", cpf: "" });



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
  const [paymentMethod, setPaymentMethod] = useState<"card" | "boleto" | "pix">("card");
  const [paySettings, setPaySettings] = useState<{
    pix_enabled: boolean;
    pix_discount_percent: number;
    card_discount_percent: number;
    installments_max: number;
    installments_interest_free: number;
    installments_monthly_rate: number;
  } | null>(null);
  const [installmentDiscounts, setInstallmentDiscounts] = useState<Record<number, number>>({});
  const [installments, setInstallments] = useState(1);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", cpf: "",
    cep: cartCep ? formatCep(cartCep) : "", street: "", number: "", complement: "",
    district: "", city: "", state: "", notes: "",
  });
  const [notesImages, setNotesImages] = useState<string[]>([]);
  const [notesVideoUrl, setNotesVideoUrl] = useState<string | null>(null);
  const [uploadingNote, setUploadingNote] = useState(false);
  const [uploadingNoteVideo, setUploadingNoteVideo] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);
  const shippingCostCents = selectedShip?.priceCents ?? 0;
  const baseTotal = subtotalCents + shippingCostCents;
  const pixDiscountPercent = paySettings?.pix_enabled ? Number(paySettings.pix_discount_percent) || 0 : 0;
  // Desconto por parcela (tabela installment_fees) tem prioridade sobre o desconto único do cartão.
  const feeFor = (n: number) =>
    installmentDiscounts[n] != null
      ? Number(installmentDiscounts[n])
      : Number(paySettings?.card_discount_percent ?? 0) || 0;
  const cardDiscountPercent = feeFor(installments);
  const boletoDiscountPercent = feeFor(1);
  const activeDiscountPercent =
    paymentMethod === "pix" ? pixDiscountPercent : paymentMethod === "boleto" ? boletoDiscountPercent : cardDiscountPercent;
  const discountCents = Math.round((subtotalCents * activeDiscountPercent) / 100);
  const total = baseTotal - discountCents;
  const lastQuotedCep = useRef<string>("");

  useEffect(() => {
    (supabase as any)
      .rpc("get_public_payment_settings")
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setPaySettings({
          pix_enabled: !!row?.pix_enabled,
          pix_discount_percent: Number(row?.pix_discount_percent ?? 0),
          card_discount_percent: Number(row?.card_discount_percent ?? 0),
          installments_max: Number(row?.installments_max ?? 10),
          installments_interest_free: Number(row?.installments_interest_free ?? 1),
          installments_monthly_rate: Number(row?.installments_monthly_rate ?? 0),
        });
      })
      .catch((err: any) => console.error("[Checkout] erro ao carregar configurações de pagamento", err));
  }, []);

  // Chave pública do Mercado Pago + SDK para tokenizar o cartão no navegador
  useEffect(() => {
    let alive = true;
    loadPublicSettings()
      .then((s: any) => {
        if (!alive) return;
        const key = String(s?.mp_public_key ?? "");
        setMpPublicKey(key);
        if (key && !document.getElementById("mp-sdk-v2")) {
          const el = document.createElement("script");
          el.id = "mp-sdk-v2";
          el.src = "https://sdk.mercadopago.com/js/v2";
          el.async = true;
          document.body.appendChild(el);
        }
      })
      .catch((err: any) => console.error("[Checkout] erro ao carregar chave de pagamento", err));
    return () => { alive = false; };
  }, [loadPublicSettings]);



  // Descontos por parcela definidos no painel (Configurações → Taxas por parcela)
  useEffect(() => {
    (supabase as any)
      .from("installment_fees")
      .select("installments,fee_percent,active")
      .eq("active", true)
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) { console.error("[Checkout] erro ao carregar taxas por parcela", error); return; }
        const map: Record<number, number> = {};
        for (const r of data ?? []) map[Number(r.installments)] = Number(r.fee_percent) || 0;
        setInstallmentDiscounts(map);
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

  const handleNoteImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 6 - notesImages.length;
    if (remaining <= 0) { toast.error("Máximo de 6 imagens"); return; }
    const arr = Array.from(files).slice(0, remaining);
    setUploadingNote(true);
    try {
      const uploaded: string[] = [];
      for (const file of arr) {
        if (file.size > 6 * 1024 * 1024) { toast.error(`${file.name}: máximo 6MB`); continue; }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `checkout-notes/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false, contentType: file.type });
        if (error) { toast.error(error.message); continue; }
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      if (uploaded.length) setNotesImages((prev) => [...prev, ...uploaded]);
    } finally {
      setUploadingNote(false);
    }
  };

  const handleNoteVideoUpload = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Envie um arquivo de vídeo (mp4/webm/mov)"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Vídeo máximo de 50MB"); return; }
    setUploadingNoteVideo(true);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `checkout-notes/video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false, contentType: file.type });
      if (error) { toast.error(error.message); return; }
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setNotesVideoUrl(data.publicUrl);
      toast.success("Vídeo anexado");
    } finally {
      setUploadingNoteVideo(false);
    }
  };


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

  function validateForm(): string | null {
    if (!form.name.trim() || form.name.trim().length < 3) return "Informe seu nome completo";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Informe um e-mail válido";
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 13) return "WhatsApp inválido. Use DDD + número (ex: 11 91234-5678)";
    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) return "CPF obrigatório para emissão da Nota Fiscal — informe os 11 dígitos";
    if (!isValidCpf(cpfDigits)) return "CPF inválido — confira os dígitos";
    const cepDigits = form.cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) return "CEP inválido";
    if (!form.street.trim()) return "Informe a rua";
    if (!form.number.trim()) return "Informe o número do endereço";
    if (!form.district.trim()) return "Informe o bairro";
    if (!form.city.trim()) return "Informe a cidade";
    if (!/^[A-Za-z]{2}$/.test(form.state.trim())) return "Informe a UF (2 letras)";
    if (!selectedShip) return "Calcule e selecione uma opção de frete";
    return null;
  }

  /** Tokeniza o cartão direto no Mercado Pago (os dados não passam pelo nosso servidor). */
  async function tokenizeCard() {
    const MP = (window as any).MercadoPago;
    if (!MP || !mpPublicKey) throw new Error("Pagamento com cartão indisponível no momento. Tente novamente em instantes.");
    const digits = card.number.replace(/\D/g, "");
    const [mm = "", yy = ""] = card.expiry.split("/").map((s) => s.trim());
    if (digits.length < 13) throw new Error("Número do cartão inválido");
    if (!/^\d{2}$/.test(mm) || !/^\d{2,4}$/.test(yy)) throw new Error("Validade do cartão inválida (MM/AA)");
    if (!card.name.trim()) throw new Error("Informe o nome impresso no cartão");
    if (!/^\d{3,4}$/.test(card.cvv)) throw new Error("Código de segurança inválido");
    const cardCpf = (card.cpf || form.cpf).replace(/\D/g, "");
    if (cardCpf.length !== 11) throw new Error("Informe o CPF do titular do cartão");

    const mp = new MP(mpPublicKey, { locale: "pt-BR" });
    const methods = await mp.getPaymentMethods({ bin: digits.slice(0, 8) });
    const method = methods?.results?.[0];
    if (!method?.id) throw new Error("Não reconhecemos a bandeira deste cartão");

    const token = await mp.createCardToken({
      cardNumber: digits,
      cardholderName: card.name.trim(),
      cardExpirationMonth: mm,
      cardExpirationYear: yy.length === 2 ? `20${yy}` : yy,
      securityCode: card.cvv,
      identificationType: "CPF",
      identificationNumber: cardCpf,
    });
    if (!token?.id) throw new Error("Não foi possível validar o cartão. Confira os dados.");

    return {
      token: String(token.id),
      paymentMethodId: String(method.id),
      issuerId: method.issuer?.id ? String(method.issuer.id) : null,
      identificationNumber: cardCpf,
    };
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) { toast.error(validationError); return; }
    setLoading(true);
    const ship = selectedShip!;
    const payload = {
      customer: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.replace(/\D/g, ""),
        cpf: form.cpf.replace(/\D/g, ""),
      },

      shipping: {
        cep: form.cep, street: form.street, number: form.number,
        complement: form.complement, district: form.district,
        city: form.city, state: form.state.toUpperCase(),
      },
      shippingCostCents,
      shippingService: ship.name,
      notes: form.notes,
      notesImages,
      notesVideoUrl,
      paymentMethod,
      discountCents,
      installments: paymentMethod === "card" ? installments : 1,
      items: items.map((i) => ({
        productId: i.productId, name: i.name,
        priceCents: i.priceCents, quantity: i.quantity,
        vehicleConfig: i.vehicleConfig,
      })),
    };
    try {
      if (paymentMethod === "pix") {
        const res = await createPix({ data: payload });
        if (!res?.qrCode) throw new Error("Mercado Pago não retornou o QR PIX");
        try {
          sessionStorage.setItem(`pix:${res.orderId}`, JSON.stringify({
            qrCode: res.qrCode,
            qrCodeBase64: res.qrCodeBase64,
            ticketUrl: res.ticketUrl,
            expiresAt: res.expiresAt,
          }));
        } catch { /* sessionStorage indisponível */ }
        // Mostra o QR Code imediatamente na própria tela (sem redirecionar).
        // NÃO limpa o carrinho aqui — só quando o pagamento for confirmado.
        setPixInline({
          orderId: res.orderId,
          expiresAt: res.expiresAt,

          qrCode: res.qrCode,
          qrCodeBase64: res.qrCodeBase64,
          totalCents: res.totalCents,
        });
        setLoading(false);
        window.scrollTo({ top: 0 });
        return;
      }


      if (paymentMethod === "boleto") {
        const res = await createBoleto({ data: payload });
        if (!res?.digitableLine && !res?.pdfUrl) throw new Error("Mercado Pago não retornou o boleto");
        sessionStorage.setItem(`boleto:${res.orderId}`, JSON.stringify({
          digitableLine: res.digitableLine,
          pdfUrl: res.pdfUrl,
          expiresAt: res.expiresAt,
          totalCents: res.totalCents,
        }));
        window.location.assign(`/checkout/boleto?order=${res.orderId}`);
        return;
      }

      if (paymentMethod === "card" && mpPublicKey) {
        const tokenized = await tokenizeCard();
        const res = await createCard({
          data: {
            ...payload,
            card: {
              token: tokenized.token,
              paymentMethodId: tokenized.paymentMethodId,
              issuerId: tokenized.issuerId,
              installments,
              cardholderEmail: form.email.trim(),
              identificationType: "CPF",
              identificationNumber: tokenized.identificationNumber,
            },
          },
        });
        if (res.status === "paid") {
          window.location.assign(`/checkout/aprovado?order=${res.orderId}`);
        } else if (res.status === "cancelled") {
          window.location.assign(`/checkout/recusado?order=${res.orderId}`);
        } else {
          window.location.assign(`/checkout/pendente?order=${res.orderId}`);
        }
        return;
      }

      const res = await createPref({ data: payload });
      if (!res?.initPoint) throw new Error("Mercado Pago não retornou link de pagamento");
      // Carrinho preservado até confirmação (ponto 7)
      window.location.assign(res.initPoint);

    } catch (err: any) {
      console.error("[Checkout] erro ao iniciar Mercado Pago", err);
      toast.error(err?.message ?? "Falha ao iniciar pagamento no Mercado Pago");
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
              <Field
                label="CPF (obrigatório para NF)"
                required
                value={form.cpf}
                onChange={(e) => setForm((p) => ({ ...p, cpf: formatCpf(e.target.value) }))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={14}
                className="sm:col-span-2"
              />
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
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${paymentMethod === "card" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <CreditCard className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Cartão{" "}
                    {cardDiscountPercent > 0 && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                        -{cardDiscountPercent}% em {installments}x
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Até {paySettings?.installments_max ?? 10}x</p>
                  <p className="mt-1 text-sm font-bold">
                    {formatCents(baseTotal - Math.round((subtotalCents * cardDiscountPercent) / 100))}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod("boleto")}
                className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition ${paymentMethod === "boleto" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <CreditCard className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Boleto{" "}
                    {cardDiscountPercent > 0 && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                        -{cardDiscountPercent}%
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Compensa em 1-3 dias úteis</p>
                  <p className="mt-1 text-sm font-bold">
                    {formatCents(baseTotal - Math.round((subtotalCents * cardDiscountPercent) / 100))}
                  </p>
                </div>
              </button>

              {paySettings?.pix_enabled && (
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
                    <p className="text-xs text-muted-foreground">Aprovação automática</p>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {formatCents(baseTotal - Math.round((subtotalCents * pixDiscountPercent) / 100))}
                    </p>
                  </div>
                </button>
              )}
            </div>

            {paymentMethod === "pix" && pixInline && (
              <div className="mt-4 space-y-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
                <div className="flex justify-center">
                  {pixInline.qrCodeBase64 ? (
                    <img
                      src={`data:image/png;base64,${pixInline.qrCodeBase64}`}
                      alt="QR Code PIX"
                      className="h-56 w-56 rounded-xl border bg-white object-contain p-2"
                    />
                  ) : (
                    <div className="rounded-xl border bg-white p-3">
                      <QRCodeCanvas value={pixInline.qrCode} size={208} level="M" />
                    </div>
                  )}
                </div>

                {pixCountdown && (
                  <p className="flex items-center justify-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">
                      Código válido por <span className="font-bold text-foreground">{pixCountdown}</span>
                    </span>
                  </p>
                )}

                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="flex-1 truncate font-mono text-xs">{pixInline.qrCode}</span>
                  <button
                    type="button"
                    aria-label="Copiar código PIX"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pixInline.qrCode);
                        toast.success("Código PIX copiado");
                      } catch {
                        toast.error("Não foi possível copiar");
                      }
                    }}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>

                {pixDiscountPercent > 0 && (
                  <p className="rounded-lg bg-primary/10 py-2 text-center text-sm font-medium text-primary">
                    {pixDiscountPercent}% de desconto aplicado no PIX
                  </p>
                )}

                <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Aguardando confirmação automática do pagamento…
                </p>

                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/checkout/pix" search={{ order: pixInline.orderId }}>Acompanhar pagamento</Link>
                </Button>
              </div>
            )}



            {paymentMethod === "card" && (
              <div className="mt-4">
                <Label className="mb-2 block text-xs font-medium">
                  Em quantas vezes? <span className="text-muted-foreground">(até 10x sem juros)</span>
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: Math.min(10, Math.max(1, paySettings?.installments_max ?? 10)) }, (_, idx) => idx + 1).map((n) => {
                    const pct = feeFor(n);
                    const nTotal = baseTotal - Math.round((subtotalCents * pct) / 100);
                    const selected = installments === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallments(n)}
                        className={`flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 text-left text-sm transition ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <span className="font-medium">
                          {n}x de {formatCents(Math.round(nTotal / n))}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">sem juros</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {pct > 0 && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                              -{pct}%
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{formatCents(nTotal)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {mpPublicKey && (
                  <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Lock className="h-4 w-4 text-primary" /> Dados do cartão
                    </p>
                    <div>
                      <Label className="text-xs">Número do cartão</Label>
                      <Input
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="0000 0000 0000 0000"
                        value={card.number}
                        onChange={(e) =>
                          setCard((p) => ({
                            ...p,
                            number: e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Nome impresso no cartão</Label>
                      <Input
                        autoComplete="cc-name"
                        placeholder="Como está no cartão"
                        value={card.name}
                        onChange={(e) => setCard((p) => ({ ...p, name: e.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Validade (MM/AA)</Label>
                        <Input
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          placeholder="12/29"
                          value={card.expiry}
                          onChange={(e) => {
                            const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setCard((p) => ({ ...p, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }));
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Código de segurança</Label>
                        <Input
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          placeholder="CVV"
                          value={card.cvv}
                          onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">CPF do titular</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={card.cpf || form.cpf}
                        onChange={(e) => setCard((p) => ({ ...p, cpf: e.target.value }))}
                      />
                    </div>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Os dados do cartão são enviados criptografados direto ao Mercado Pago.
                    </p>
                  </div>
                )}
              </div>
            )}

          </Section>



          <Section icon={<CheckCircle2 className="h-4 w-4" />} title="Observações" step={5}>
            <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Modelo do veículo, ano, cor da capota, etc. (opcional)" />
            <div className="mt-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-medium">📸 Envie fotos do seu veículo (opcional)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Envie imagens do veículo para conferência. Caso o produto escolhido não seja o ideal,
                nosso time técnico entrará em contato pelo WhatsApp. Até 6 imagens, 6MB cada.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {notesImages.map((url) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="h-16 w-16 rounded object-cover border" />
                    <button
                      type="button"
                      onClick={() => setNotesImages((p) => p.filter((u) => u !== url))}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
                      aria-label="Remover"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {notesImages.length < 6 && (
                  <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border-2 border-dashed border-muted-foreground/40 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                    {uploadingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ foto"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadingNote}
                      onChange={(e) => { handleNoteImagesUpload(e.target.files); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-medium">🎥 Vídeo do veículo (opcional)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Um vídeo curto ajuda a confirmar a compatibilidade do produto. MP4/WEBM/MOV, até 50MB.
              </p>
              {notesVideoUrl ? (
                <div className="mt-2 flex flex-col gap-2">
                  <video src={notesVideoUrl} controls className="max-h-48 w-full rounded border bg-black" />
                  <Button type="button" variant="outline" size="sm" onClick={() => setNotesVideoUrl(null)}>
                    Remover vídeo
                  </Button>
                </div>
              ) : (
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded border-2 border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                  {uploadingNoteVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ enviar vídeo"}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    disabled={uploadingNoteVideo}
                    onChange={(e) => { handleNoteVideoUpload(e.target.files?.[0]); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
          </Section>




          <TrustNotices />

          <Button type="submit" className="hidden h-12 w-full md:flex" disabled={loading || !selectedShip} size="lg">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando pagamento…</> : <><Lock className="mr-2 h-4 w-4" /> Pagar {formatCents(total)}</>}
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
              <Row
                label={`Desconto ${paymentMethod === "pix" ? "PIX" : paymentMethod === "boleto" ? "Boleto" : "Cartão à vista"} (${activeDiscountPercent}%)`}
                value={<span className="text-primary">- {formatCents(discountCents)}</span>}
              />
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
          <div className="mb-2">
            <TrustNotices compact />
          </div>
          <Button type="button" onClick={handleSubmit as any} className="h-12 w-full" disabled={loading || !selectedShip} size="lg">
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando pagamento…</>
              : <><Lock className="mr-2 h-4 w-4" /> Pagar {formatCents(total)}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TrustNotices({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1" : "space-y-2 rounded-xl border border-border bg-card p-4"}>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>Seus dados são criptografados e protegidos. Nós não armazenamos os dados do seu cartão.</span>
      </p>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>Pagamento processado com segurança pelo Mercado Pago.</span>
      </p>
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

function formatCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Valida CPF pelos dígitos verificadores (Módulo 11)
function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(d.slice(0, 9), 10);
  const d2 = calc(d.slice(0, 10), 11);
  return d1 === parseInt(d[9], 10) && d2 === parseInt(d[10], 10);
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
