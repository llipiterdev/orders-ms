export type OrderStatus =
  | 'PENDING'
  | 'PAYMENT_IN_FLIGHT'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface Order {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentAttemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastPaymentId?: string;
  lastError?: string;
  metadata?: Record<string, string>;
  refundRequestCount?: number;
}
