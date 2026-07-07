import { Shell, StatusCard } from '@/components/Shell';

export default function Home() {
  return (
    <Shell>
      <StatusCard
        icon="🔗"
        tone="muted"
        title="Aucun paiement"
        text="Ouvrez le lien de paiement fourni par votre marchand pour régler votre achat."
      />
    </Shell>
  );
}
