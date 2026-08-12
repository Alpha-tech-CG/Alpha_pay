import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UssdMenuResponse {
  text: string;
  continueSession: boolean;
}
export interface UssdConnector {
  handleSession(sessionId: string, phoneNumber: string, input: string): Promise<UssdMenuResponse>;
}
export const USSD_CONNECTOR = 'USSD_CONNECTOR';

/** STUB — used while AT_USE_STUB=true. Renders a mock menu. */
@Injectable()
export class UssdConnectorStub implements UssdConnector {
  private readonly logger = new Logger(UssdConnectorStub.name);
  async handleSession(_sessionId: string, _phone: string, input: string): Promise<UssdMenuResponse> {
    this.logger.warn('[STUB] USSD handleSession');
    if (!input) {
      return { text: 'CON AlphaPay\n1. Payer un marchand\n2. Mon solde', continueSession: true };
    }
    return { text: 'END Merci d’utiliser AlphaPay (stub).', continueSession: false };
  }
}

/** REAL — Africa's Talking USSD. Needs AT_API_KEY. */
@Injectable()
export class UssdConnectorReal implements UssdConnector {
  constructor(private readonly config: ConfigService) {}
  async handleSession(): Promise<UssdMenuResponse> {
    throw new Error('AT_USE_STUB=false but not wired. Set AT_API_KEY in .env');
  }
}
