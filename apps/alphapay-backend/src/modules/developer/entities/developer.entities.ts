import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiEnvironment } from '../../../common/types/enums';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() userId: string;
  @Column() name: string;
  @Column({ unique: true }) keyHash: string; // bcrypt — never the raw key
  @Column({ length: 20 }) keyPrefix: string; // 'alp_sk_live' / 'alp_sk_test'
  @Column({ type: 'enum', enum: ApiEnvironment }) environment: ApiEnvironment;
  @Column({ type: 'simple-array' }) scopes: string[];
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('api_logs')
export class ApiLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ nullable: true }) apiKeyId: string;
  @Column() method: string;
  @Column() endpoint: string;
  @Column() statusCode: number;
  @Column() latencyMs: number;
  @Column({ type: 'enum', enum: ApiEnvironment }) environment: ApiEnvironment;
  @Column({ type: 'jsonb', nullable: true }) requestBody: Record<string, unknown> | null;
  @Column({ type: 'jsonb', nullable: true }) responseBody: Record<string, unknown> | null;
  @Column({ nullable: true }) userId: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() userId: string;
  @Column() url: string;
  @Column() secretHash: string; // hashed HMAC secret
  @Column({ type: 'simple-array' }) events: string[];
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('webhook_delivery_logs')
export class WebhookDeliveryLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() webhookId: string;
  @Column() event: string;
  @Column({ nullable: true }) statusCode: number;
  @CreateDateColumn({ type: 'timestamptz' }) timestamp: Date;
}
