import Image from 'next/image';

/** Vraie capture de l'app mobile dans un cadre de téléphone. */
export function Phone({ src, alt, className = '', priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`relative rounded-[2.6rem] bg-[var(--ap-navy)] p-2.5 shadow-[0_30px_60px_-20px_rgba(11,31,58,0.45)] ring-1 ring-black/10 ${className}`}>
      <div className="absolute left-1/2 top-3.5 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-[var(--ap-navy)]" aria-hidden />
      <Image src={src} alt={alt} width={600} height={1173} priority={priority} className="h-auto w-full rounded-[2.1rem]" sizes="(max-width: 768px) 70vw, 300px" />
    </div>
  );
}

/** Vraie capture du tableau de bord ou de la documentation dans une fenêtre de navigateur. */
export function Browser({ src, alt, url, className = '' }: { src: string; alt: string; url: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-24px_rgba(11,31,58,0.35)] ring-1 ring-[var(--ap-line)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-[var(--ap-line)] bg-[#f3f1ec] px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[var(--ap-burgundy)]/70" aria-hidden />
        <span className="h-3 w-3 rounded-full bg-[var(--ap-mustard)]/80" aria-hidden />
        <span className="h-3 w-3 rounded-full bg-[var(--ap-success)]/70" aria-hidden />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-1 text-xs text-[var(--ap-muted)]">{url}</span>
      </div>
      <Image src={src} alt={alt} width={1600} height={1000} className="h-auto w-full" sizes="(max-width: 768px) 95vw, 900px" />
    </div>
  );
}

/** Logo AlphaPay (disque bordeaux, flèche blanche, pastille moutarde), comme l'icône de l'app. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 100 100" className="h-8 w-8" aria-hidden>
        <circle cx="50" cy="50" r="48" fill="#7A1F2B" />
        <path d="M22 80 L66 26 L52 24 L56 14 L88 16 L80 46 L72 38 L30 86 Z" fill="#FFFFFF" />
        <circle cx="78" cy="78" r="9" fill="#D4A017" />
      </svg>
      <span className="text-xl">
        Alpha<span className="text-[var(--ap-mustard)]">Pay</span>
      </span>
    </span>
  );
}
