# @paybrain/sdk

SDK TypeScript officiel pour l'API PayBrain (agrégation mobile money — Congo).

## Installation

```bash
npm install @paybrain/sdk
```

## Usage

```ts
import { PayBrain } from '@paybrain/sdk';

const pb = new PayBrain({ apiKey: process.env.PAYBRAIN_KEY! });

const payment = await pb.createPayment({
  amount: 1000,
  currency: 'XAF',
  phone: '+242066123456',
  externalId: 'cmd-001',
});
console.log(payment.transactionId, payment.status);
```

### Vérifier un webhook entrant

```ts
import { verifyWebhookSignature } from '@paybrain/sdk';

const ok = verifyWebhookSignature({
  secret: process.env.WEBHOOK_SECRET!,
  signatureHeader: req.headers['x-signature-256'],
  timestampHeader: req.headers['x-timestamp'],
  rawBody: req.rawBody,
});
```

## Publication (mainteneurs)

```bash
npm run build
npm publish --access public
```
