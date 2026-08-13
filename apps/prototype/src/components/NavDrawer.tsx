'use client';
import { useState } from 'react';

// Lanceur d'ecrans global : bouton flottant -> panneau listant les 20 ecrans.
// Ajoute pour permettre de naviguer entre les maquettes (qui ne sont pas liees
// entre elles dans l'export). N'altere aucune page reproduite.

type Item = { label: string; href: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: 'Client',
    items: [
      { label: 'Home', href: '/standard/home/' },
      { label: 'Send', href: '/standard/send/' },
      { label: 'Receive', href: '/standard/receive/' },
      { label: 'Top-up', href: '/standard/top-up/' },
      { label: 'History', href: '/standard/history/' },
      { label: 'Card', href: '/standard/card/' },
      { label: 'Settings', href: '/standard/settings/' },
      { label: 'USSD', href: '/standard/ussd/' },
    ],
  },
  {
    title: 'Merchant',
    items: [
      { label: 'Dashboard', href: '/merchant/dashboard/' },
      { label: 'Transactions', href: '/merchant/transactions/' },
      { label: 'Payment Links', href: '/merchant/payment-links/' },
      { label: 'API Keys', href: '/merchant/api-keys/' },
      { label: 'Webhooks', href: '/merchant/webhooks/' },
      { label: 'Settlement', href: '/merchant/settlement/' },
      { label: 'Settings', href: '/merchant/settings/' },
    ],
  },
  {
    title: 'Developer',
    items: [
      { label: 'Overview', href: '/developer/overview/' },
      { label: 'Docs', href: '/developer/docs/' },
      { label: 'Sandbox', href: '/developer/sandbox/' },
    ],
  },
  {
    title: 'Autres',
    items: [
      { label: 'Landing', href: '/landing/' },
      { label: 'Onboarding', href: '/onboarding/' },
    ],
  },
];

export function NavDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Bouton flottant (au-dessus de la bottom-nav client) */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ouvrir la liste des ecrans"
        style={{ position: 'fixed', right: '1rem', bottom: '7.5rem', zIndex: 2147483000 }}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00b4d8] text-[#0b1e3d] shadow-2xl shadow-[#0b1e3d]/40 ring-2 ring-white active:scale-90 transition-transform"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2147483001 }}
          className="flex items-end justify-center bg-[#0b1e3d]/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-6 pb-10 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">AlphaPay</p>
                <h2 className="font-heading text-xl font-bold text-[#0b1e3d]">Ecrans</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e2e8f0] text-[#0b1e3d] active:scale-90 transition-transform"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {GROUPS.map((g) => (
              <div key={g.title} className="mb-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#00b4d8]">{g.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((it) => (
                    <a
                      key={it.href}
                      href={it.href}
                      className="rounded-2xl border border-[#e2e8f0] bg-[#f5f7fa] px-4 py-3 text-sm font-bold text-[#0b1e3d] active:scale-95 transition-transform"
                    >
                      {it.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
