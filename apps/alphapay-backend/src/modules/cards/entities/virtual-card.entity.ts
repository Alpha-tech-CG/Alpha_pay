import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Market } from '../../../common/types/market.enum';
import { CardNetwork, CardStatus } from '../../../common/types/enums';

@Entity('virtual_cards')
export class VirtualCard {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column() issuerCardId: string; // external ref — never the PAN
  @Column({ type: 'enum', enum: CardNetwork }) network: CardNetwork;
  @Column({ length: 4 }) lastFour: string;
  @Column() expiryMonth: string;
  @Column() expiryYear: string;
  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 }) balanceUsd: string;
  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.ACTIVE }) status: CardStatus;
  @Column({ type: 'enum', enum: Market }) issuedForMarket: Market;
  @CreateDateColumn({ type: 'timestamptz' }) issuedAt: Date;
}
