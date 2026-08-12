import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Operator } from '../../../common/types/operator.enum';
import { TransactionStatus } from '../../../common/types/transaction-status.enum';
import { TransactionType } from '../../../common/types/enums';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() userId: string;
  @Column({ type: 'enum', enum: TransactionType }) type: TransactionType;
  @Column({ type: 'enum', enum: Operator, nullable: true }) operator: Operator | null;
  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING }) status: TransactionStatus;
  @Column({ type: 'decimal', precision: 18, scale: 6 }) amount: string;
  @Column({ length: 4 }) currency: string;
  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true }) convertedAmount: string | null;
  @Column({ type: 'varchar', nullable: true }) convertedCurrency: string | null;
  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 }) fee: string;
  @Column({ type: 'varchar', nullable: true }) externalReference: string | null;
  @Column({ type: 'varchar', nullable: true }) recipientPhone: string | null;
  @Column({ type: 'varchar', nullable: true }) corridor: string | null;
  @Column({ type: 'varchar', nullable: true }) merchantId: string | null;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, unknown> | null;
  @Column({ type: 'varchar', nullable: true }) failureReason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
