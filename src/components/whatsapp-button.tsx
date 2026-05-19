import { MessageCircle } from "lucide-react";

const PHONE = "5518988001823";

export function WhatsAppButton() {
  const msg = encodeURIComponent("Olá! Gostaria de saber mais sobre os produtos.");
  return (
    <a
      href={`https://wa.me/${PHONE}?text=${msg}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elevated transition-transform hover:scale-110"
    >
      <MessageCircle className="h-7 w-7" fill="currentColor" />
    </a>
  );
}
