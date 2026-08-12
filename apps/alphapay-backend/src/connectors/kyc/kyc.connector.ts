import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Market } from '../../common/types/market.enum';

export interface KycSubmitParams {
  userId: string;
  level: 'LEVEL_1' | 'LEVEL_2';
  documentType?: string;
  documentImageBase64?: string;
  selfieImageBase64?: string;
}
export interface KycSubmitResult {
  providerSubmissionId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  provider: string;
}
export interface KycConnector {
  submit(params: KycSubmitParams): Promise<KycSubmitResult>;
  getStatus(providerSubmissionId: string): Promise<KycSubmitResult>;
}
export const KYC_CONNECTOR = 'KYC_CONNECTOR';

@Injectable()
export class SmileConnectorStub implements KycConnector {
  private readonly logger = new Logger(SmileConnectorStub.name);
  async submit(_p: KycSubmitParams): Promise<KycSubmitResult> {
    this.logger.warn('[STUB] Smile Identity submit — auto-approve');
    return { providerSubmissionId: `stub-smile-${randomUUID()}`, status: 'APPROVED', provider: 'smile_identity' };
  }
  async getStatus(id: string): Promise<KycSubmitResult> {
    return { providerSubmissionId: id, status: 'APPROVED', provider: 'smile_identity' };
  }
}
@Injectable()
export class SmileConnectorReal implements KycConnector {
  constructor(private readonly config: ConfigService) {}
  async submit(): Promise<KycSubmitResult> { throw new Error('SMILE_USE_STUB=false but not wired. Set SMILE_API_KEY'); }
  async getStatus(): Promise<KycSubmitResult> { throw new Error('Smile real getStatus not implemented'); }
}
@Injectable()
export class SumsubConnectorStub implements KycConnector {
  private readonly logger = new Logger(SumsubConnectorStub.name);
  async submit(_p: KycSubmitParams): Promise<KycSubmitResult> {
    this.logger.warn('[STUB] Sumsub submit — auto-approve');
    return { providerSubmissionId: `stub-sumsub-${randomUUID()}`, status: 'APPROVED', provider: 'sumsub' };
  }
  async getStatus(id: string): Promise<KycSubmitResult> {
    return { providerSubmissionId: id, status: 'APPROVED', provider: 'sumsub' };
  }
}
@Injectable()
export class SumsubConnectorReal implements KycConnector {
  constructor(private readonly config: ConfigService) {}
  async submit(): Promise<KycSubmitResult> { throw new Error('SUMSUB_USE_STUB=false but not wired. Set SUMSUB_APP_TOKEN'); }
  async getStatus(): Promise<KycSubmitResult> { throw new Error('Sumsub real getStatus not implemented'); }
}

/** Congo → Smile Identity, Libya → Sumsub. */
@Injectable()
export class KycFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly smileStub: SmileConnectorStub,
    private readonly smileReal: SmileConnectorReal,
    private readonly sumsubStub: SumsubConnectorStub,
    private readonly sumsubReal: SumsubConnectorReal,
  ) {}
  getConnector(market: Market): KycConnector {
    if (market === Market.CONGO) {
      return this.config.get<boolean>('connectors.smileUseStub') ? this.smileStub : this.smileReal;
    }
    return this.config.get<boolean>('connectors.sumsubUseStub') ? this.sumsubStub : this.sumsubReal;
  }
}
