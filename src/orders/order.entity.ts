import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { OrderStatus } from './order.interface';

@Entity('orders')
export class OrderEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'double precision' })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 32 })
  status: OrderStatus;

  @Column({ name: 'payment_attempt_count', type: 'int', default: 0 })
  paymentAttemptCount: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'last_payment_id', type: 'varchar', length: 128, nullable: true })
  lastPaymentId?: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, string> | null;

  @Column({ name: 'refund_request_count', type: 'int', nullable: true })
  refundRequestCount?: number | null;
}
