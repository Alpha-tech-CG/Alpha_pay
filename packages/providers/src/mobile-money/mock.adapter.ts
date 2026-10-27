import { createHash } from 'crypto';
import { ProviderError } from '../core/errors';
import { assertAmount, assertE164 } from '../core/validation';
import type {
  AccountHolderResult,
  CallbackResult,
  IncomingRequest,
  MobileMoneyConnection,
  MobileMoneyProvider,
  MobileMoneyProviderFactory,
  PaymentStatus,
  PaymentStatusResult,
  ProviderDeps,
  RequestPaymentInput,
  RequestPaymentResult,
} from './types';

const PROVIDER = 'mock';

/**
 * Numéros de test de l'opérateur factice (documentés dans le portail
 * développeurs). Tout autre numéro valide réussit après `defaultDelayMs`.
 */
export const MOCK_MOBILE_MONEY_NUMBERS = {
  /** Réussit dès la première lecture du statut. */
  success: '+242060000001',
  /** Échoue : le payeur refuse la demande. */
  failure: '+242060000002',
  /** Reste en attente `slowDelayMs`, puis réussit. */
  slow: '+242060000003',
  /** Reste en attente `expireAfterMs`, puis expire. */
  expire: '+242060000004',
  /** La demande échoue sur une erreur réseau réessayable (test de reprise). */
  networkError: '+242060000005',
  /** Titulaire de compte inactif (verifyAccountHolder). */
  inactive: '+242060000006',
} as const;

type Scenario = 'default' | 'success' | 'failure' | 'slow' | 'expire' | 'inactive';

const SCENARIO_CODES: Record<Scenario, string> = {
  default: 'd',
  success: 's',
  failure: 'f',
  slow: 'w',
  expire: 'e',
  inactive: 'i',
};

function scenarioFor(phone: string): Scenario | 'networkError' {
  for (const [name, number] of Object.entries(MOCK_MOBILE_MONEY_NUMBERS)) {
    if (number === phone) return name as Scenario | 'networkError';
  }
  return 'default';
}

export interface MockMobileMoneyOptions {
  defaultDelayMs?: number;
  slowDelayMs?: number;
  expireAfterMs?: number;
}

/**
 * Opérateur factice sans état partagé : la référence fournisseur encode le
 * scénario et l'instant de création, de sorte que l'API et le worker (deux
 * process) lisent le même statut sans base commune. Une même référence
 * AlphaPay produit toujours la même référence fournisseur dans un process.
 */
export class MockMobileMoneyProvider implements MobileMoneyProvider {
  readonly operator = PROVIDER;
  private readonly now: () => number;
  private readonly createdAt = new Map<string, number>();
  private readonly opts: Required<MockMobileMoneyOptions>;

  constructor(deps: ProviderDeps = {}, opts: MockMobileMoneyOptions = {}) {
    this.now = deps.now ?? Date.now;
    this.opts = {
      defaultDelayMs: opts.defaultDelayMs ?? 3_000,
      slowDelayMs: opts.slowDelayMs ?? 15_000,
      expireAfterMs: opts.expireAfterMs ?? 30_000,
    };
  }

  async requestPayment(input: RequestPaymentInput): Promise<RequestPaymentResult> {
    assertAmount(PROVIDER, input.amount, input.currency);
    assertE164(PROVIDER, input.payerPhone, 'payerPhone');
    const scenario = scenarioFor(input.payerPhone);
    if (scenario === 'networkError') {
      throw new ProviderError('network', 'Erreur réseau simulée', { provider: PROVIDER });
    }
    let created = this.createdAt.get(input.reference);
    if (created === undefined) {
      created = this.now();
      this.createdAt.set(input.reference, created);
    }
    const digest = createHash('sha256').update(input.reference).digest('hex').slice(0, 12);
    return { providerRef: `mock_${SCENARIO_CODES[scenario]}_${created.toString(36)}_${digest}`, status: 'pending' };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatusResult> {
    const m = /^mock_([a-z])_([0-9a-z]+)_[0-9a-f]{12}$/.exec(providerRef);
    if (!m) throw new ProviderError('not_found', 'Paiement factice inconnu', { provider: PROVIDER });
    const scenario = (Object.keys(SCENARIO_CODES) as Scenario[]).find((s) => SCENARIO_CODES[s] === m[1]);
    const elapsed = this.now() - parseInt(m[2], 36);
    switch (scenario) {
      case 'success':
        return { status: 'succeeded' };
      case 'failure':
        return { status: 'failed', failureReason: 'APPROVAL_REJECTED' };
      case 'slow':
        return { status: elapsed >= this.opts.slowDelayMs ? 'succeeded' : 'pending' };
      case 'expire':
        return elapsed >= this.opts.expireAfterMs ? { status: 'expired', failureReason: 'EXPIRED' } : { status: 'pending' };
      default:
        return { status: elapsed >= this.opts.defaultDelayMs ? 'succeeded' : 'pending' };
    }
  }

  async verifyCredentials(): Promise<void> {}

  async verifyAccountHolder(phone: string): Promise<AccountHolderResult> {
    assertE164(PROVIDER, phone);
    return phone === MOCK_MOBILE_MONEY_NUMBERS.inactive ? { active: false } : { active: true, name: 'Client Test' };
  }

  /** Callback factice : `{ providerRef, status, failureReason? }`. */
  parseCallback(req: IncomingRequest): CallbackResult | null {
    const body = req.body as { providerRef?: unknown; status?: unknown; failureReason?: unknown } | undefined;
    const statuses: PaymentStatus[] = ['pending', 'succeeded', 'failed', 'expired', 'canceled'];
    if (!body || typeof body.providerRef !== 'string' || !statuses.includes(body.status as PaymentStatus)) return null;
    return {
      providerRef: body.providerRef,
      status: body.status as PaymentStatus,
      ...(typeof body.failureReason === 'string' ? { failureReason: body.failureReason } : {}),
    };
  }
}

export const mockProviderFactory: MobileMoneyProviderFactory = {
  operator: PROVIDER,
  requiredCredentials: [],
  create: (_connection: MobileMoneyConnection, deps?: ProviderDeps) => new MockMobileMoneyProvider(deps),
};
