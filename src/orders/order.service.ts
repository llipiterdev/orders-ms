import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError } from 'axios';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity';
import { Order, OrderStatus } from './order.interface';

@Injectable()
export class OrderService {
  private static readonly BULK_MIN = 1;
  private static readonly BULK_MAX = 50;

  private readonly logger = new Logger(OrderService.name);
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
  ) {}

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
    const timer = setTimeout(async () => {
      const o = await this.orderRepository.findOne({ where: { id: orderId } });
      if (
        o &&
        (o.status === 'PENDING' || o.status === 'PAYMENT_IN_FLIGHT')
      ) {
        this.logger.warn(`Order ${orderId} expired by timer (was ${o.status})`);
        o.status = 'EXPIRED';
        o.updatedAt = new Date();
        await this.orderRepository.save(o);
      }
    }, ms);
    timer.unref?.();
    this.expiryTimers.set(orderId, timer);
  }

  async createOrder(
    userId: string,
    amount: number,
    currency = 'USD',
  ): Promise<OrderEntity> {
    this.assertCreatePayload(userId, amount);

    const id = this.genId();
    const order = this.orderRepository.create({
      id,
      userId,
      amount: Number(amount),
      currency,
      status: 'PENDING',
      paymentAttemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.orderRepository.save(order);
    this.scheduleExpiry(id);

    await this.executePaymentAttempt(id);
    const saved = await this.orderRepository.findOne({ where: { id } });
    return saved!;
  }

  private async executePaymentAttempt(orderId: string): Promise<void> {
    let order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return;

    order.status = 'PAYMENT_IN_FLIGHT';
    order.paymentAttemptCount += 1;
    order.updatedAt = new Date();
    await this.orderRepository.save(order);

    const idempotencyKey = `${order.id}:${order.paymentAttemptCount}`;
    const timeoutMs = Number(process.env.PAYMENT_HTTP_TIMEOUT_MS ?? '8000');

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

      order = (await this.orderRepository.findOne({ where: { id: orderId } }))!;
      const snapshotStatus = order.status;

      if (response.status >= 500) {
        throw new Error(`PAYMENTS_HTTP_${response.status}`);
      }

      const data = response.data as { status?: string; paymentId?: string };

      if (data.paymentId) {
        order.lastPaymentId = data.paymentId;
      }

      if (data.status === 'APPROVED') {
        if (snapshotStatus === 'EXPIRED') {
          order.lastError = 'PAYMENT_APPROVED_AFTER_EXPIRY';
          this.logger.warn(
            `Order ${order.id} remains EXPIRED while payment APPROVED`,
          );
        } else {
          order.status = 'PAID';
        }
      } else if (data.status === 'DECLINED') {
        if (snapshotStatus !== 'EXPIRED') {
          order.status = 'FAILED';
        }
      } else {
        if (snapshotStatus !== 'EXPIRED') {
          order.status = 'FAILED';
          order.lastError = 'UNKNOWN_PAYMENT_RESPONSE';
        }
      }
    } catch (err) {
      const ax = err as AxiosError;
      order = (await this.orderRepository.findOne({ where: { id: orderId } }))!;
      if (order.status !== 'EXPIRED') {
        order.status = 'FAILED';
      }
      order.lastError = ax.message || String(err);
      this.logger.error(`Payment call failed for ${order.id}: ${order.lastError}`);
    }

    order.updatedAt = new Date();
    await this.orderRepository.save(order);
  }

  async getOrders(): Promise<OrderEntity[]> {
    return this.orderRepository.find({ order: { createdAt: 'ASC' } });
  }

  async getOrderById(id: string): Promise<OrderEntity | null> {
    return this.orderRepository.findOne({ where: { id } });
  }

  async cancelOrder(id: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    if (order.status !== 'PENDING') {
      throw new ConflictException(`Cannot cancel order in status ${order.status}`);
    }
    order.status = 'CANCELLED';
    order.updatedAt = new Date();
    return this.orderRepository.save(order);
  }

  async retryPayment(id: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    if (order.status !== 'FAILED') {
      throw new ConflictException('Retry only allowed from FAILED');
    }
    await this.executePaymentAttempt(id);
    return (await this.orderRepository.findOne({ where: { id } }))!;
  }

  async getOrdersFiltered(userId?: string, status?: string): Promise<OrderEntity[]> {
    return this.orderRepository.find({
      where: {
        ...(userId ? { userId } : {}),
        ...(status ? { status: status as OrderStatus } : {}),
      },
      order: { createdAt: 'ASC' },
    });
  }

  async getOrderLedger(orderId: string): Promise<{
    order: Pick<Order, 'id' | 'status' | 'amount' | 'currency' | 'userId'>;
    payments: unknown;
    refunds: unknown;
    generatedAt: string;
  }> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
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
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    order.refundRequestCount = (order.refundRequestCount ?? 0) + 1;
    order.updatedAt = new Date();
    await this.orderRepository.save(order);

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
  ): Promise<{ requested: number; received: number; orders: OrderEntity[] }> {
    if (
      !Number.isFinite(count) ||
      count < OrderService.BULK_MIN ||
      count > OrderService.BULK_MAX
    ) {
      throw new BadRequestException(
        `count must be between ${OrderService.BULK_MIN} and ${OrderService.BULK_MAX}`,
      );
    }
    this.assertCreatePayload(userId, amount);
    const out: OrderEntity[] = [];
    for (let i = 0; i < count; i++) {
      out.push(await this.createOrder(userId, amount, currency));
    }
    return { requested: count, received: out.length, orders: out };
  }

  async patchOrderMetadata(
    id: string,
    patch: Record<string, string>,
  ): Promise<OrderEntity> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new BadRequestException('Order not found');
    }
    order.metadata = { ...(order.metadata ?? {}), ...patch };
    order.updatedAt = new Date();
    return this.orderRepository.save(order);
  }
}
