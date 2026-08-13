import type { Metadata } from 'next';
import { Inter, Playfair_Display, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { NavDrawer } from '@/components/NavDrawer';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'AlphaPay — Prototype',
  description: 'AlphaPay multi-account prototype (Standard · Merchant · Developer)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Iconify web-component — mêmes icônes que l'export (solar/mdi/…).
            Stratégie par défaut (afterInteractive) : le custom element upgrade
            les <iconify-icon> rendus côté serveur dès que le script est chargé. */}
        <Script src="https://code.iconify.design/iconify-icon/3.0.0/iconify-icon.min.js" />
        {children}
        <NavDrawer />
      </body>
    </html>
  );
}
