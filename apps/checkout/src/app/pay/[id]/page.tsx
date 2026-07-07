import { fetchPaylink, formatAmount } from '@/lib/api';
import { CheckoutClient } from '@/components/CheckoutClient';
import { Shell, StatusCard } from '@/components/Shell';

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await fetchPaylink(id);

  if (result.state === 'not-found') {
    return (
      <Shell>
        <StatusCard
          icon="✕"
          tone="error"
          title="Lien introuvable"
          text="Ce lien de paiement n'existe pas ou a été supprimé. Vérifiez l'adresse auprès du marchand."
        />
      </Shell>
    );
  }

  if (result.state === 'expired') {
    return (
      <Shell>
        <StatusCard
          icon="⏱"
          tone="muted"
          title="Lien expiré"
          text="Ce lien de paiement a expiré. Demandez au marchand de vous en générer un nouveau."
        />
      </Shell>
    );
  }

  if (result.state === 'used') {
    return (
      <Shell>
        <StatusCard
          icon="✓"
          tone="success"
          title="Déjà réglé"
          text={`Ce paiement de ${formatAmount(result.link.amount, result.link.currency)} à ${result.link.merchant.name} a déjà été effectué.`}
        />
      </Shell>
    );
  }

  const { link } = result;
  return (
    <Shell>
      <CheckoutClient
        paylinkId={link.id}
        merchantName={link.merchant.name}
        amountLabel={formatAmount(link.amount, link.currency)}
        description={link.description}
        walletChargeLabel={
          link.walletQuote
            ? `≈ ${formatAmount(link.walletQuote.amount, link.walletQuote.currency)}`
            : null
        }
        rateLabel={
          link.walletQuote
            ? `1 ${link.currency} = ${link.walletQuote.rate.toLocaleString('fr-FR')} ${link.walletQuote.currency}`
            : null
        }
      />
    </Shell>
  );
}
