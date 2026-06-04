import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import axios from 'axios';
import { OrderEntity } from './order.entity';
import { OrderService } from './order.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrderService', () => {
  let service: OrderService;
  let store: OrderEntity[];

  function buildRepoMock() {
    return {
      create: jest.fn((partial: Partial<OrderEntity>) => ({
        ...partial,
      })) as jest.Mock,
      save: jest.fn(async (entity: OrderEntity) => {
        const idx = store.findIndex((r) => r.id === entity.id);
        if (idx >= 0) {
          store[idx] = { ...store[idx], ...entity };
          return store[idx];
        }
        store.push(entity);
        return entity;
      }),
      find: jest.fn(
        async (opts?: {
          where?: Record<string, unknown>;
          order?: { createdAt: string };
        }) => {
          let rows = [...store];
          const w = opts?.where as
            | { userId?: string; status?: string }
            | undefined;
          if (w?.userId) rows = rows.filter((o) => o.userId === w.userId);
          if (w?.status) rows = rows.filter((o) => o.status === w.status);
          if (opts?.order?.createdAt === 'ASC') {
            rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
          return rows;
        },
      ),
      findOne: jest.fn(async (opts: { where: { id: string } }) => {
        const id = opts.where.id;
        return store.find((r) => r.id === id) ?? null;
      }),
    };
  }

  let repository: ReturnType<typeof buildRepoMock>;

  function mockPaymentApproved(paymentId = 'pay-1') {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { status: 'APPROVED', paymentId },
    });
  }

  function mockPaymentDeclined() {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { status: 'DECLINED' },
    });
  }

  beforeEach(async () => {
    store = [];
    repository = buildRepoMock();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('createOrder', () => {
    it('shouldCreateOrderWhenPaymentIsApproved', async () => {
      // Arrange
      mockPaymentApproved('pay-1');

      // Act
      const order = await service.createOrder('user1', 100);

      // Assert
      expect(order.status).toBe('PAID');
      expect(order.userId).toBe('user1');
      expect(order.amount).toBe(100);
      expect(order.lastPaymentId).toBe('pay-1');
      const orders = await service.getOrders();
      expect(orders.some((o) => o.id === order.id && o.status === 'PAID')).toBe(
        true,
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://payments-ms:3001/payments',
        {
          orderId: order.id,
          amount: 100,
          currency: 'USD',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': `${order.id}:1`,
          }),
        }),
      );
    });

    it('shouldSetStatusFailedWhenPaymentIsDeclined', async () => {
      // Arrange
      mockPaymentDeclined();

      // Act
      const order = await service.createOrder('user1', 100);

      // Assert
      expect(order.status).toBe('FAILED');
    });

    it('shouldSetStatusFailedWhenPaymentNetworkFails', async () => {
      // Arrange
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      // Act
      const order = await service.createOrder('user1', 100);

      // Assert
      expect(order.status).toBe('FAILED');
      expect(order.lastError).toContain('Network error');
    });

    it('shouldSetStatusFailedWhenPaymentHttpReturns500', async () => {
      // Arrange
      mockedAxios.post.mockResolvedValue({ status: 500, data: {} });

      // Act
      const order = await service.createOrder('user1', 100);

      // Assert
      expect(order.status).toBe('FAILED');
    });

    it('shouldSetStatusFailedWhenPaymentStatusIsUnknown', async () => {
      // Arrange
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { status: 'PENDING_REVIEW' },
      });

      // Act
      const order = await service.createOrder('user1', 100);

      // Assert
      expect(order.status).toBe('FAILED');
      expect(order.lastError).toBe('UNKNOWN_PAYMENT_RESPONSE');
    });

    it('shouldRejectCreateWhenUserIdIsEmpty', async () => {
      // Arrange — sin mock de pago: no debe llegar a HTTP

      // Act & Assert
      await expect(service.createOrder('', 100)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('shouldRejectCreateWhenAmountIsNull', async () => {
      // Act & Assert
      await expect(
        service.createOrder('user1', null as unknown as number),
      ).rejects.toThrow(BadRequestException);
    });

    it('shouldRejectCreateWhenAmountIsNaN', async () => {
      // Act & Assert
      await expect(service.createOrder('user1', Number.NaN)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getOrders and getOrderById', () => {
    it('shouldReturnAllOrdersWhenMultipleExist', async () => {
      // Arrange
      mockPaymentDeclined();

      // Act
      await service.createOrder('user1', 100);
      await service.createOrder('user2', 200);
      const orders = await service.getOrders();

      // Assert
      expect(orders.length).toBe(2);
    });

    it('shouldReturnOrderWhenIdExists', async () => {
      // Arrange
      mockPaymentApproved();
      const created = await service.createOrder('user1', 100);

      // Act
      const found = await service.getOrderById(created.id);

      // Assert
      expect(found?.id).toBe(created.id);
      expect(found?.status).toBe('PAID');
    });

    it('shouldReturnNullWhenOrderIdNotFound', async () => {
      // Arrange
      mockPaymentDeclined();
      await service.createOrder('user1', 100);

      // Act
      const found = await service.getOrderById('nonexistent');

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('getOrdersFiltered', () => {
    it('shouldFilterOrdersByUserId', async () => {
      // Arrange
      mockPaymentDeclined();
      await service.createOrder('alice', 10);
      await service.createOrder('bob', 20);

      // Act
      const filtered = await service.getOrdersFiltered('alice');

      // Assert
      expect(filtered).toHaveLength(1);
      expect(filtered[0].userId).toBe('alice');
    });

    it('shouldFilterOrdersByStatus', async () => {
      // Arrange
      mockPaymentApproved();
      await service.createOrder('user1', 10);
      mockPaymentDeclined();
      await service.createOrder('user2', 20);

      // Act
      const paid = await service.getOrdersFiltered(undefined, 'PAID');

      // Assert
      expect(paid).toHaveLength(1);
      expect(paid[0].status).toBe('PAID');
    });
  });

  describe('cancelOrder', () => {
    it('shouldCancelOrderWhenStatusIsPending', async () => {
      // Arrange — orden PENDING sin pasar por el flujo de pago HTTP
      const pending: OrderEntity = {
        id: 'pending-order-1',
        userId: 'user1',
        amount: 50,
        currency: 'USD',
        status: 'PENDING',
        paymentAttemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(pending);

      // Act
      const cancelled = await service.cancelOrder(pending.id);

      // Assert
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('shouldRejectCancelWhenOrderNotFound', async () => {
      // Act & Assert
      await expect(service.cancelOrder('missing-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shouldRejectCancelWhenStatusIsNotPending', async () => {
      // Arrange
      mockPaymentApproved();
      const paid = await service.createOrder('user1', 100);

      // Act & Assert
      await expect(service.cancelOrder(paid.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('retryPayment', () => {
    it('shouldRetryPaymentWhenStatusIsFailed', async () => {
      // Arrange
      mockedAxios.post
        .mockResolvedValueOnce({ status: 200, data: { status: 'DECLINED' } })
        .mockResolvedValueOnce({
          status: 200,
          data: { status: 'APPROVED', paymentId: 'pay-r' },
        });
      const failed = await service.createOrder('user1', 50);
      expect(failed.status).toBe('FAILED');

      // Act
      const after = await service.retryPayment(failed.id);

      // Assert
      expect(after.paymentAttemptCount).toBe(2);
      expect(after.status).toBe('PAID');
    });

    it('shouldRejectRetryWhenOrderNotFound', async () => {
      // Act & Assert
      await expect(service.retryPayment('missing')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shouldRejectRetryWhenStatusIsNotFailed', async () => {
      // Arrange
      mockPaymentApproved();
      const paid = await service.createOrder('user1', 100);

      // Act & Assert
      await expect(service.retryPayment(paid.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('bulkCreate', () => {
    it('shouldRejectBulkWhenCountIsZero', async () => {
      // Act & Assert
      await expect(service.bulkCreate('user1', 0, 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shouldRejectBulkWhenCountIsFiftyOne', async () => {
      // Act & Assert
      await expect(service.bulkCreate('user1', 51, 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shouldCreateBulkWhenCountIsOne', async () => {
      // Arrange
      mockPaymentApproved();

      // Act
      const result = await service.bulkCreate('user1', 1, 25);

      // Assert
      expect(result.requested).toBe(1);
      expect(result.received).toBe(1);
      expect(result.orders).toHaveLength(1);
    });

    it('shouldCreateBulkWhenCountIsFifty', async () => {
      // Arrange
      mockPaymentApproved();

      // Act
      const result = await service.bulkCreate('user1', 50, 1);

      // Assert
      expect(result.received).toBe(50);
      expect(result.orders).toHaveLength(50);
    });
  });

  describe('requestRefund', () => {
    it('shouldRejectRefundWhenAmountIsInvalid', async () => {
      // Act & Assert
      await expect(
        service.requestRefund('any-id', Number.NaN),
      ).rejects.toThrow(BadRequestException);
    });

    it('shouldRejectRefundWhenOrderNotFound', async () => {
      // Act & Assert
      await expect(service.requestRefund('missing', 10)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shouldIncrementRefundCountWhenRefundIsRequested', async () => {
      // Arrange
      mockPaymentApproved();
      const order = await service.createOrder('user1', 100);
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { refundId: 'ref-1' },
      });

      // Act
      const res = await service.requestRefund(order.id, 50);

      // Assert
      expect(res.orderSnapshot.refundRequestCount).toBe(1);
      expect(mockedAxios.post).toHaveBeenLastCalledWith(
        'http://payments-ms:3001/payments/refunds',
        { orderId: order.id, amount: 50 },
        expect.objectContaining({ timeout: 8000 }),
      );
    });
  });

  describe('getOrderLedger', () => {
    it('shouldRejectLedgerWhenOrderNotFound', async () => {
      // Act & Assert
      await expect(service.getOrderLedger('missing')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('shouldReturnLedgerWhenOrderExists', async () => {
      // Arrange
      mockPaymentApproved();
      const order = await service.createOrder('user1', 80);
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: [{ id: 'p1' }] })
        .mockResolvedValueOnce({ status: 200, data: [] });

      // Act
      const ledger = await service.getOrderLedger(order.id);

      // Assert
      expect(ledger.order.id).toBe(order.id);
      expect(ledger.payments).toEqual([{ id: 'p1' }]);
      expect(ledger.refunds).toEqual([]);
      expect(ledger.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('patchOrderMetadata', () => {
    it('shouldRejectMetadataPatchWhenOrderNotFound', async () => {
      // Act & Assert
      await expect(
        service.patchOrderMetadata('missing', { k: 'v' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('shouldMergeMetadataWhenPatchIsValid', async () => {
      // Arrange
      mockPaymentApproved();
      const order = await service.createOrder('user1', 10);
      await service.patchOrderMetadata(order.id, { source: 'web' });

      // Act
      const updated = await service.patchOrderMetadata(order.id, {
        campaign: 'summer',
      });

      // Assert
      expect(updated.metadata).toEqual({ source: 'web', campaign: 'summer' });
    });
  });
});
