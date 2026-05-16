import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { Order, OrderStatus } from './order.interface';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly orders: Order[] = [];
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private get paymentsBaseUrl(): string {
    return process.env.PAYMENTS_MS_URL ?? 'http://payments-ms:3001';
  }

  private now(): string {
    return new Date().toISOString();
  }

  private genId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private assertCreatePayload(userId: string, amount: number) {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('userId is required');
    }
    if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
      throw new BadRequestException('amount is required');
    }
  }

  private scheduleExpiry(orderId: string): void {
    const ms = Number(process.env.ORDER_EXPIRY_MS ?? '120000');
    const timer = setTimeout(() => {
      const o = this.orders.find((x) => x.id === orderId);
      if (
        o &&
        (o.status === 'PENDING' || o.status === 'PAYMENT_IN_FLIGHT')
      ) {
        this.logger.warn(`Order ${orderId} expired by timer (was ${o.status})`);
        o.status = 'EXPIRED';
        o.updatedAt = this.now();
      }
    }, ms);
    this.expiryTimers.set(orderId, timer);
  }

  async createOrder(
    userId: string,
    amount: number,
    currency = 'USD',
  ): Promise<Order> {
    this.assertCreatePayload(userId, amount);

    const id = this.genId();
    const order: Order = {
      id,
      userId,
      amount: Number(amount),
      currency,
      status: 'PENDING',
      paymentAttemptCount: 0,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.orders.push(order);
    this.scheduleExpiry(id);

    await this.executePaymentAttempt(order);
    return order;
  }

  private snapshotStatus(order: Order): OrderStatus {
    return order.status;
  }

  private async executePaymentAttempt(order: Order): Promise<void> {
    const timeoutMs = Number(process.env.PAYMENT_HTTP_TIMEOUT_MS ?? '8000');
    order.status = 'PAYMENT_IN_FLIGHT';
    order.paymentAttemptCount += 1;
    order.updatedAt = this.now();

    const idempotencyKey = `${order.id}:${order.paymentAttemptCount}`;

    try {
      this.logger.log(
        `Calling payments for order ${order.id} attempt=${order.paymentAttemptCount}`,
      );
      const response = await axios.post(
        `${this.paymentsBaseUrl}/payments`,
        {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        },
        {
          timeout: timeoutMs,
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
          validateStatus: () => true,
        },
      );

      if (response.status >= 500) {
        throw new Error(`PAYMENTS_HTTP_${response.status}`);
      }

      const data = response.data as { status?: string; paymentId?: string };

      if (data.paymentId) {
        order.lastPaymentId = data.paymentId;
      }

      if (data.status === 'APPROVED') {
        if (this.snapshotStatus(order) === 'EXPIRED') {
          order.lastError = 'PAYMENT_APPROVED_AFTER_EXPIRY';
          this.logger.warn(
            `Order ${order.id} remains EXPIRED while payment APPROVED`,
          );
        } else {
          order.status = 'PAID';
        }
      } else if (data.status === 'DECLINED') {
        if (this.snapshotStatus(order) !== 'EXPIRED') {
          order.status = 'FAILED';
        }
      } else {
        if (this.snapshotStatus(order) !== 'EXPIRED') {
          order.status = 'FAILED';
          order.lastError = 'UNKNOWN_PAYMENT_RESPONSE';
        }
      }
    } catch (err) {
      const ax = err as AxiosError;
      if (this.snapshotStatus(order) !== 'EXPIRED') {
        order.status = 'FAILED';
      }
      order.lastError = ax.message || String(err);
      this.logger.error(`Payment call failed for ${order.id}: ${order.lastError}`);
    }

    order.updatedAt = this.now();
  }

  getOrders(): Order[] {
    return [...this.orders];
  }

  getOrderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  cancelOrder(id: string): Order {
    const order = this.orders.find((o) => o.id === id);
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    if (order.status !== 'PENDING') {
      throw new ConflictException(`Cannot cancel order in status ${order.status}`);
    }
    order.status = 'CANCELLED';
    order.updatedAt = this.now();
    return order;
  }

  async retryPayment(id: string): Promise<Order> {
    const order = this.orders.find((o) => o.id === id);
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    if (order.status !== 'FAILED') {
      throw new ConflictException('Retry only allowed from FAILED');
    }
    await this.executePaymentAttempt(order);
    return order;
  }

  getOrdersFiltered(userId?: string, status?: string): Order[] {
    let rows = [...this.orders];
    if (userId) {
      rows = rows.filter((o) => o.userId === userId);
    }
    if (status) {
      rows = rows.filter((o) => o.status === (status as OrderStatus));
    }
    return rows;
  }

  async getOrderLedger(orderId: string): Promise<{
    order: Pick<Order, 'id' | 'status' | 'amount' | 'currency' | 'userId'>;
    payments: unknown;
    refunds: unknown;
    generatedAt: string;
  }> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    const timeoutMs = Number(process.env.PAYMENT_HTTP_TIMEOUT_MS ?? '8000');
    const [payRes, refRes] = await Promise.all([
      axios.get(`${this.paymentsBaseUrl}/payments/by-order/${order.id}`, {
        timeout: timeoutMs,
        validateStatus: () => true,
      }),
      axios.get(`${this.paymentsBaseUrl}/payments/refunds`, {
        params: { orderId: order.id },
        timeout: timeoutMs,
        validateStatus: () => true,
      }),
    ]);
    return {
      order: {
        id: order.id,
        userId: order.userId,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
      },
      payments: payRes.data,
      refunds: refRes.data,
      generatedAt: this.now(),
    };
  }

  async requestRefund(orderId: string, amount: number) {
    if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
      throw new BadRequestException('amount is required');
    }
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    order.refundRequestCount = (order.refundRequestCount ?? 0) + 1;
    order.updatedAt = this.now();
    const timeoutMs = Number(process.env.PAYMENT_HTTP_TIMEOUT_MS ?? '8000');
    const res = await axios.post(
      `${this.paymentsBaseUrl}/payments/refunds`,
      { orderId, amount: Number(amount) },
      { timeout: timeoutMs, validateStatus: () => true },
    );
    return {
      orderId,
      httpStatus: res.status,
      refund: res.data,
      orderSnapshot: {
        status: order.status,
        refundRequestCount: order.refundRequestCount,
      },
    };
  }

  async bulkCreate(
    userId: string,
    count: number,
    amount: number,
    currency = 'USD',
  ): Promise<{ requested: number; received: number; orders: Order[] }> {
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      throw new BadRequestException('count must be between 1 and 50');
    }
    this.assertCreatePayload(userId, amount);
    const out: Order[] = [];
    for (let i = 0; i < count; i++) {
      out.push(await this.createOrder(userId, amount, currency));
    }
    return { requested: count, received: out.length, orders: out };
  }

  patchOrderMetadata(id: string, patch: Record<string, string>): Order {
    const order = this.orders.find((o) => o.id === id);
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    order.metadata = { ...(order.metadata ?? {}), ...patch };
    order.updatedAt = this.now();
    return order;
  }
}
