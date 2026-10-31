import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

/** Événements de webhook (§7). Liste vide = tous les événements. */
export const WEBHOOK_EVENTS = [
  'payment.succeeded',
  'payment.failed',
  'payment.expired',
  'refund.succeeded',
  'refund.failed',
  'dispute.created',
  'dispute.closed',
  'invoice.paid',
  'installment.paid',
  'message.delivered',
  'message.failed',
] as const;
const EVENTS = [...WEBHOOK_EVENTS];

export class CreateWebhookEndpointDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  url!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(EVENTS, { each: true })
  events?: string[];
}

export class UpdateWebhookEndpointDto {
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(EVENTS, { each: true })
  events?: string[];

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
