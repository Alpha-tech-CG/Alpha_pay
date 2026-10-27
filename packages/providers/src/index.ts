// Fournisseurs externes d'AlphaPay (D-012) : chaque intégration passe par une
// interface, avec au moins un adaptateur réel et un adaptateur factice (§2.7).
export * from './core/errors';
export * from './core/http';
export * from './core/token-cache';
export { toMajorString, deterministicUuid } from './core/validation';

export * from './mobile-money/types';
export { mtnProviderFactory, MtnMobileMoneyProvider } from './mobile-money/mtn.adapter';
export { airtelProviderFactory, AirtelMobileMoneyProvider } from './mobile-money/airtel.adapter';
export { mockProviderFactory, MockMobileMoneyProvider, MOCK_MOBILE_MONEY_NUMBERS } from './mobile-money/mock.adapter';

export * from './kyc/types';
export { MockKycProvider } from './kyc/mock.adapter';

export * from './messaging/types';
export { MockOutbox, MockSmsProvider, MockWhatsAppProvider, MockEmailProvider } from './messaging/mock.adapters';
export { InfobipSmsProvider } from './messaging/infobip.adapter';
export type { InfobipConfig } from './messaging/infobip.adapter';
export { MetaWhatsAppProvider } from './messaging/meta-whatsapp.adapter';
export type { MetaWhatsAppConfig } from './messaging/meta-whatsapp.adapter';
export { SmtpEmailProvider } from './messaging/smtp.adapter';
export type { MailTransport } from './messaging/smtp.adapter';
export { hmacSha256Hex, safeEqual } from './core/validation';

export * from './card/types';
export { MockCardAcquirer } from './card/mock.adapter';
