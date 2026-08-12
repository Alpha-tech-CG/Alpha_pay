import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { KycLevel, KycStatus } from '../../../common/types/enums';

@Entity('kyc_submissions')
export class KycSubmission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() userId: string;
  @Column({ type: 'enum', enum: KycLevel }) level: KycLevel;
  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.PENDING }) status: KycStatus;
  @Column() provider: string;
  @Column({ nullable: true }) providerSubmissionId: string;
  @Column({ nullable: true }) documentType: string;
  @Column({ type: 'jsonb', nullable: true }) providerResponse: Record<string, unknown> | null;
  @Column({ nullable: true }) rejectionReason: string;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) submittedAt: Date;
}
