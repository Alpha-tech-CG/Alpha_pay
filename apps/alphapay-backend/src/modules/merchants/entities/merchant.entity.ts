import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Market } from '../../../common/types/market.enum';
import { MerchantStatus } from '../../../common/types/enums';

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) userId: string;
  @Column() businessName: string;
  @Column({ nullable: true }) businessSector: string;
  @Column({ type: 'enum', enum: Market }) market: Market;
  @Column({ type: 'enum', enum: MerchantStatus, default: MerchantStatus.PENDING }) status: MerchantStatus;
  @Column({ nullable: true }) encryptedBusinessRegistration: string;
  @Column({ default: 'FREE' }) subscriptionPlan: string;
  @Column({ type: 'timestamptz', nullable: true }) subscriptionExpiresAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('terminals')
export class Terminal {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() merchantId: string;
  @Column() name: string;
  @Column({ unique: true }) qrCodeId: string;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
