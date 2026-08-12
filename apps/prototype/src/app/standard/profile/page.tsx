'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck, ShieldCheck, Fingerprint, KeyRound, LogOut, Trash2, Plus, ChevronRight, ArrowUpCircle,
} from 'lucide-react';
import { standardUser } from '@/lib/mock-data';
import { Switch } from '@/components/ui/misc';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { cn } from '@/lib/utils';

const LANGS = ['Français', 'English', 'العربية'];

export default function ProfilePage() {
  const router = useRouter();
  const [lang, setLang] = useState('Français');

  return (
    <div className="px-5 pt-4">
      <h1 className="mb-6 font-heading text-2xl font-bold">Profile</h1>

      <div className="flex flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground">{standardUser.initials}</div>
        <h2 className="mt-3 text-lg font-bold">{standardUser.name}</h2>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
          <BadgeCheck size={14} /> Verified (Level {standardUser.kycLevel})
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Market: {standardUser.market}</p>
      </div>

      {/* Upgrade */}
      <Link href="/standard/upgrade" className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <ArrowUpCircle size={22} className="text-primary" />
        <div className="flex-1"><p className="text-sm font-semibold">Upgrade your account</p><p className="text-xs text-muted-foreground">Become a Merchant or Developer</p></div>
        <ChevronRight size={20} className="text-muted-foreground" />
      </Link>

      {/* Linked accounts */}
      <Section title="Linked accounts">
        <Row>
          <span className="flex items-center gap-2 text-sm font-medium"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/15 text-xs font-bold text-warning">MTN</span> MTN MoMo</span>
          <span className="flex items-center gap-1 text-xs font-semibold text-success"><ShieldCheck size={14} /> Preferred</span>
        </Row>
        <p className="px-4 pb-2 text-xs text-muted-foreground">{standardUser.phone}</p>
        <div className="h-px bg-border" />
        <Link href="/standard/link-account" className="flex items-center justify-between p-4">
          <span className="flex items-center gap-2 text-sm font-medium"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary"><Plus size={16} /></span> Choose preferred account</span>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary">MTN · Airtel · Bank <ChevronRight size={14} /></span>
        </Link>
      </Section>

      {/* Appearance / theme */}
      <Section title="Appearance">
        <div className="p-4">
          <p className="mb-3 text-sm text-muted-foreground">Choose your theme</p>
          <ThemeSwitcher />
        </div>
      </Section>

      {/* Language */}
      <Section title="Language">
        <div className="flex gap-2 p-3">
          {LANGS.map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn('flex-1 rounded-xl border py-2 text-sm font-semibold', lang === l ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{l}</button>
          ))}
        </div>
      </Section>

      {/* Security */}
      <Section title="Security">
        <Row><span className="flex items-center gap-2 text-sm font-medium"><KeyRound size={18} className="text-primary" /> Change PIN</span><ChevronRight size={18} className="text-muted-foreground" /></Row>
        <div className="h-px bg-border" />
        <Row><span className="flex items-center gap-2 text-sm font-medium"><Fingerprint size={18} className="text-primary" /> Enable biometrics</span><Switch /></Row>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <button onClick={() => router.push('/login')} className="flex w-full items-center gap-2 p-4 text-sm font-semibold text-foreground"><LogOut size={18} /> Logout</button>
        <div className="h-px bg-border" />
        <button className="flex w-full items-center gap-2 p-4 text-sm font-semibold text-destructive"><Trash2 size={18} /> Delete account</button>
      </Section>

      <p className="mt-6 text-center text-xs text-muted-foreground">AlphaPay v1.0 · Standard account</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between p-4">{children}</div>;
}
