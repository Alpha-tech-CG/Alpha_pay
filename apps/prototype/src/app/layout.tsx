import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'AlphaPay — Prototype',
  description: 'AlphaPay multi-account prototype (Standard · Merchant · Developer)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('alphapay_theme')||'dark';}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
