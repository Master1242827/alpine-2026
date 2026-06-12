import { MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FALLBACK_PHONE = "5518988001823";

function sanitize(num: string | null | undefined) {
  const digits = String(num ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

export function WhatsAppButton() {
  const { data } = useQuery({
    queryKey: ["whatsapp-number"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_whatsapp_number");
      return sanitize(data as any) || FALLBACK_PHONE;
    },
    staleTime: 60_000,
  });
  const phone = data || FALLBACK_PHONE;
  const msg = encodeURIComponent("Olá! Gostaria de saber mais sobre os produtos.");
  return (
    <a
      href={`https://wa.me/${phone}?text=${msg}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elevated transition-transform hover:scale-110"
    >
      <MessageCircle className="h-7 w-7" fill="currentColor" />
    </a>
  );
}
