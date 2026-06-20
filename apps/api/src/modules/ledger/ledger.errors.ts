export class UnbalancedEntryError extends Error {
  constructor(currency: string, debit: string, credit: string) {
    super(`Écriture déséquilibrée pour ${currency}: débit=${debit} crédit=${credit}`);
    this.name = 'UnbalancedEntryError';
  }
}

export class EmptyEntryError extends Error {
  constructor() {
    super('postEntry requiert au moins une ligne d\'écriture');
    this.name = 'EmptyEntryError';
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super('amountCents doit etre un entier positif exprimant des centimes');
    this.name = 'InvalidAmountError';
  }
}
