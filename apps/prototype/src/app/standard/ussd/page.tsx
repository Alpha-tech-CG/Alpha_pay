'use client';
// Reproduit verbatim depuis l'export de maquettes AlphaPay : ussd-flow.html
// Corps HTML injecte au montage (client) — robuste sur toute WebView : ne depend
// pas de l'hydratation RSC (une WebView ancienne vidait le contenu prerendu).
// Tailwind v4 scanne ces classes dans ce fichier et les genere ; Iconify (layout)
// rend les icones. Aucune modification du design d'origine.
import { useRef, useEffect } from 'react';

const HTML = "<div class=\"min-h-screen bg-[#000000] text-[#00FF00] font-mono p-4 flex flex-col\">\n      <div class=\"flex-1 flex flex-col\">\n        <div class=\"mb-4\">\n          <p>AlphaPay Menu:</p>\n          <p>1. Send Money</p>\n          <p>2. Withdraw Cash</p>\n          <p>3. Virtual Card</p>\n          <p>4. My Account</p>\n          <p>5. Help</p>\n        </div>\n        <div class=\"mt-auto border-t border-[#00FF00] pt-4\">\n          <div class=\"flex items-center gap-2 mb-4\">\n            <span>&gt;</span><span class=\"bg-[#00FF00] text-black px-1 animate-pulse\">_</span>\n          </div>\n          <div class=\"grid grid-cols-2 gap-4\">\n            <button\n              class=\"border border-[#00FF00] py-3 text-center active:bg-[#00FF00] active:text-black\"\n            >\n              CANCEL</button\n            ><button\n              class=\"border border-[#00FF00] py-3 text-center active:bg-[#00FF00] active:text-black\"\n            >\n              SEND\n            </button>\n          </div>\n        </div>\n      </div>\n      <div\n        class=\"mt-4 p-3 border border-white/20 text-white/50 text-[10px] italic font-sans leading-tight\"\n      >\n        Low-data fallback for non-smartphones. This USSD gateway ensures financial access for the\n        unbanked 60% of the population.\n      </div>\n    </div>";

export default function Page_standard_ussd() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = HTML;
  }, []);
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: HTML }} />;
}
