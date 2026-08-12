import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Market } from '../../../common/types/market.enum';
import { AccountType } from '../../../common/types/account-type.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) phoneNumber: string;
  @Column({ nullable: true }) email: string;
  @Column({ type: 'enum', enum: Market }) market: Market;
  @Column({ type: 'enum', enum: AccountType, default: AccountType.STANDARD }) accountType: AccountType;
  @Column({ default: false }) kycVerified: boolean;
  @Column({ type: 'int', default: 0 }) kycLevel: number; // 0=none, 1=ID, 2=ID+selfie
  @Column({ nullable: true }) encryptedFullName: string; // AES-256-GCM
  @Column({ nullable: true }) encryptedNationalId: string; // AES-256-GCM
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastLoginAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
