import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

const EVENTS = ['payment.succeeded', 'payment.failed', 'payment.pending'];

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
