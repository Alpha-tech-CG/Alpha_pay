import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePaymentDto } from './create-payment.dto';

describe('CreatePaymentDto (validation stricte ALP-152)', () => {
  // Réplique la config du pipe global (cf. main.ts).
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const meta: ArgumentMetadata = { type: 'body', metatype: CreatePaymentDto, data: '' };

  const valid = {
    amount: 100,
    currency: 'XAF',
    phone: '+242066000000',
    externalId: 'order_123-abc',
    description: 'Paiement test',
  };

  async function expectReject(payload: unknown) {
    await expect(pipe.transform(payload, meta)).rejects.toBeInstanceOf(BadRequestException);
  }

  it('accepte un payload valide', async () => {
    await expect(pipe.transform({ ...valid }, meta)).resolves.toMatchObject({ amount: 100, currency: 'XAF' });
  });

  it('rejette un champ inconnu (anti-injection)', async () => {
    await expectReject({ ...valid, extra: '<svg onload=alert(1)>' });
  });

  it('rejette un montant non entier', async () => {
    await expectReject({ ...valid, amount: 100.5 });
  });

  it('rejette un montant au-dessus du plafond', async () => {
    await expectReject({ ...valid, amount: 9_999_999_999 });
  });

  it('rejette un montant négatif ou nul', async () => {
    await expectReject({ ...valid, amount: 0 });
  });

  it('rejette un téléphone invalide', async () => {
    await expectReject({ ...valid, phone: '242066xxx' });
  });

  it('rejette une devise non supportée', async () => {
    await expectReject({ ...valid, currency: 'BTC' });
  });

  it('rejette un externalId hors charset', async () => {
    await expectReject({ ...valid, externalId: 'bad id!' });
  });

  it('rejette une description > 200 caractères', async () => {
    await expectReject({ ...valid, description: 'x'.repeat(201) });
  });
});
