import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { PaymentsService } from '../payments/payments.service';
import { toMajor } from '../../common/money';

export interface UssdSessionInput {
  /** Numéro du payeur fourni par l'opérateur (E164). */
  phoneNumber: string;
  /** Texte cumulé de la session USSD ("" au début, puis "code", puis "code*1"). */
  text: string;
}

const CODE_RE = /^\d{8}$/;

/**
 * Moteur de session USSD (ALP-USSD) — paiement depuis un téléphone à touches.
 *
 * Le client compose le shortcode (ex. *182#), saisit le code de paiement à
 * 8 chiffres généré par le marchand (qui contient déjà le montant), voit le
 * récapitulatif et confirme. Le débit mobile money est alors initié sur SON
 * numéro (fourni par l'opérateur — pas de saisie de numéro).
 *
 * Réponses au format passerelle (Africa's Talking) : un préfixe `CON ` poursuit
 * la session, `END ` la termine. Indépendant de l'opérateur : c'est l'agrégateur
 * USSD qui route le shortcode partagé MTN/Airtel vers cet endpoint.
 */
@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly payments: PaymentsService,
  ) {}

  async handleSession(input: UssdSessionInput): Promise<string> {
    const text = (input.text ?? '').trim();

    // Écran d'accueil : demande du code.
    if (text === '') {
      return 'CON PayBrain Mobile Money\nEntrez le code de paiement :';
    }

    const parts = text.split('*');
    const code = parts[0];

    if (!CODE_RE.test(code)) {
      return 'END Code invalide. Réessayez avec un code à 8 chiffres.';
    }

    const link = await this.prisma.paymentLink.findUnique({
      where: { code },
      include: { merchant: { select: { name: true } } },
    });

    if (!link) return 'END Code introuvable. Vérifiez auprès du marchand.';
    if (link.usedAt) return 'END Ce code de paiement a déjà été utilisé.';
    if (link.expiresAt && link.expiresAt < new Date()) return 'END Ce code de paiement a expiré.';

    const amount = toMajor(link.amount);
    const recap = `${amount.toLocaleString('fr-FR')} ${link.currency} a ${link.merchant?.name ?? 'marchand'}`;

    // Étape 1 : code saisi → récapitulatif + confirmation.
    if (parts.length === 1) {
      return `CON Payer ${recap}\n1. Confirmer\n2. Annuler`;
    }

    // Étape 2 : choix de l'utilisateur.
    const choice = parts[1];
    if (choice === '2') return 'END Paiement annulé.';
    if (choice !== '1') return 'END Choix invalide.';

    // Confirmation → on marque le code consommé de façon atomique (anti double
    // paiement : seul le 1er confirme passe), puis on initie le débit.
    const claimed = await this.prisma.paymentLink.updateMany({
      where: { code, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) return 'END Ce code de paiement a déjà été utilisé.';

    try {
      const result = await this.payments.initiatePayment(
        {
          amount,
          currency: link.currency,
          phone: input.phoneNumber,
          externalId: `ussd-${code}`,
          description: link.description,
        },
        link.merchantId,
      );
      this.logger.log(`USSD paiement initié (code ${code}, statut ${result.status})`);
      return `END Paiement de ${recap} initié.\nConfirmez avec votre code PIN Mobile Money.`;
    } catch (err: any) {
      // Échec d'initiation : on libère le code pour permettre une nouvelle tentative.
      await this.prisma.paymentLink.updateMany({ where: { code }, data: { usedAt: null } }).catch(() => undefined);
      this.logger.warn(`USSD échec initiation code ${code}: ${err?.message}`);
      return 'END Échec de l\'initiation du paiement. Réessayez plus tard.';
    }
  }
}
