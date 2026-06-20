import { applyLedgerTriggers, prisma } from '../dist/index.js';

await applyLedgerTriggers(prisma);
console.log('Ledger immutability appliquee (triggers anti-UPDATE/DELETE + vue account_balances)');
await prisma.$disconnect();
