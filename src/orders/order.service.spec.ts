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

  it('should create order and set status to PAID if approved', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { status: 'APPROVED', paymentId: 'pay-1' },
    });

    const order = await service.createOrder('user1', 100);
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

  it('should create order and set status to FAILED if declined', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { status: 'DECLINED', paymentId: 'pay-2' },
    });

    const order = await service.createOrder('user1', 100);
    expect(order.status).toBe('FAILED');
  });

  it('should create order and set status to FAILED on error', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'));

    const order = await service.createOrder('user1', 100);
    expect(order.status).toBe('FAILED');
    expect(order.lastError).toContain('Network error');
  });

  it('should get all orders', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'DECLINED' } });
    await service.createOrder('user1', 100);
    await service.createOrder('user2', 200);
    const orders = await service.getOrders();
    expect(orders.length).toBe(2);
  });

  it('should get order by id', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'APPROVED' } });
    const order = await service.createOrder('user1', 100);
    const found = await service.getOrderById(order.id);
    expect(found?.id).toBe(order.id);
    expect(found?.status).toBe(order.status);
  });

  it('should return null if order not found', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'DECLINED' } });
    await service.createOrder('user1', 100);
    const found = await service.getOrderById('nonexistent');
    expect(found).toBeNull();
  });

  it('should bump attempt counter on retry from FAILED', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { status: 'DECLINED' } })
      .mockResolvedValueOnce({
        data: { status: 'APPROVED', paymentId: 'pay-r' },
      });
    const order = await service.createOrder('user1', 50);
    expect(order.status).toBe('FAILED');
    const after = await service.retryPayment(order.id);
    expect(after.paymentAttemptCount).toBe(2);
    expect(after.status).toBe('PAID');
  });
});
