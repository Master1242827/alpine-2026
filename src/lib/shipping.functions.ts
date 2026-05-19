import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ProductSchema = z.object({
  id: z.string().min(1),
  width: z.number().min(1),
  height: z.number().min(1),
  length: z.number().min(1),
  weight: z.number().min(0.01),
  insurance_value: z.number().min(0),
  quantity: z.number().int().min(1),
});

const InputSchema = z.object({
  toCep: z.string().min(8).max(9),
  products: z.array(ProductSchema).min(1).max(50),
});

type MEService = {
  id: number;
  name: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  company?: { id: number; name: string; picture?: string };
  error?: string;
};

export const quoteShipping = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const token = process.env.MELHOR_ENVIO_TOKEN;
    if (!token) throw new Error("MELHOR_ENVIO_TOKEN não configurado");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("origin_cep")
      .eq("id", 1)
      .maybeSingle();
    const fromCep = (settings?.origin_cep || "").replace(/\D/g, "");
    if (fromCep.length !== 8) {
      // Friendly response — do NOT expose admin config details to the client
      return { options: [], unavailable: true as const };
    }

    const base =
      process.env.MELHOR_ENVIO_ENV === "sandbox"
        ? "https://sandbox.melhorenvio.com.br"
        : "https://melhorenvio.com.br";

    const res = await fetch(`${base}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Alpine (contato@alpine.local)",
      },
      body: JSON.stringify({
        from: { postal_code: fromCep },
        to: { postal_code: data.toCep.replace(/\D/g, "") },
        products: data.products,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      console.error(`Melhor Envio [${res.status}]: ${body.slice(0, 500)}`);
      return { options: [], unavailable: true as const };
    }
    let parsed: MEService[];
    try {
      parsed = JSON.parse(body);
    } catch {
      console.error("Melhor Envio: resposta inválida", body.slice(0, 300));
      return { options: [], unavailable: true as const };
    }

    const options = parsed
      .filter((s) => !s.error && (s.price ?? s.custom_price))
      .map((s) => ({
        id: String(s.id),
        name: `${s.company?.name ?? ""} ${s.name}`.trim(),
        priceCents: Math.round(Number(s.custom_price ?? s.price) * 100),
        deliveryDays: s.delivery_time ?? null,
        companyPicture: s.company?.picture ?? null,
      }))
      .sort((a, b) => a.priceCents - b.priceCents);

    return { options, unavailable: false as const };
  });
