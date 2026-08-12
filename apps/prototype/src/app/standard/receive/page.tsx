'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, PenSquare, Share2, Download, Info, Copy, MessageCircle, Link2 } from 'lucide-react';
import { standardUser } from '@/lib/mock-data';
import { QRCode } from '@/components/QRCode';
import { cn } from '@/lib/utils';

export default function ReceiveMoney() {
  const router = useRouter();
  const [tab, setTab] = useState<'qr' | 'link'>('qr');

  return (
    <div className="flex flex-col items-center px-5 pt-2">
      <header className="flex w-full items-center pt-4">
        <button onClick={() => router.push('/standard/home')} className="mr-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:bg-accent">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 pr-10 text-center font-heading text-xl font-bold">Receive Money</h1>
      </header>

      {/* tabs */}
      <div className="mt-6 flex w-full max-w-xs rounded-2xl border border-border bg-card p-1">
        <button onClick={() => setTab('qr')} className={cn('flex-1 rounded-xl py-2 text-xs font-bold', tab === 'qr' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}>My QR Code</button>
        <button onClick={() => setTab('link')} className={cn('flex-1 rounded-xl py-2 text-xs font-bold', tab === 'link' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}>Payment Link</button>
      </div>

      {tab === 'qr' ? (
        <>
          <div className="mt-6"><QRCode seed={standardUser.phone} size={220} /></div>
          <div className="mt-6 text-center">
            <h2 className="font-heading text-lg font-bold">{standardUser.name}</h2>
            <p className="text-sm text-muted-foreground">{standardUser.phone}</p>
          </div>

          <div className="mt-6 w-full space-y-4">
            <button className="group flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-primary">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent"><PenSquare size={20} /></div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Set Amount</p>
                  <p className="text-xs text-muted-foreground">Request a specific value</p>
                </div>
              </div>
            </button>
            <div className="grid grid-cols-2 gap-4">
              <button className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 hover:bg-accent">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary"><Share2 size={24} /></div>
                <span className="text-sm font-semibold">Share QR</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 hover:bg-accent">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary"><Download size={24} /></div>
                <span className="text-sm font-semibold">Save Image</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 w-full space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Your payment link</p>
            <p className="break-all font-mono text-sm text-primary">https://pay.alphapay.co/{standardUser.initials.toLowerCase()}-4821</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <LinkBtn Icon={Copy} label="Copy link" />
            <LinkBtn Icon={MessageCircle} label="WhatsApp" />
            <LinkBtn Icon={Link2} label="Share" />
          </div>
        </div>
      )}

      {/* International receive */}
      <div className="mt-6 w-full rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-1 font-heading text-sm font-bold">How to receive internationally</h3>
        <p className="mb-3 text-xs text-muted-foreground">Share your AlphaPay address to receive USDC from abroad.</p>
        <div className="mb-3 rounded-xl border border-border bg-input p-3">
          <p className="break-all font-mono text-sm">{standardUser.alphaPayAddress}</p>
        </div>
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
          <Copy size={16} /> Share your AlphaPay address
        </button>
      </div>

      <div className="mt-6 flex w-full items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
        <Info size={20} className="shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">Show this QR code to any AlphaPay user or merchant to receive money instantly.</p>
      </div>
    </div>
  );
}

function LinkBtn({ Icon, label }: { Icon: typeof Copy; label: string }) {
  return (
    <button className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover:bg-accent">
      <Icon size={20} className="text-primary" />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
