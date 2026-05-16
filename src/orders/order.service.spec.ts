import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderService],
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
    expect(service.getOrders()).toContainEqual(
      expect.objectContaining({ id: order.id, status: 'PAID' }),
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
    const orders = service.getOrders();
    expect(orders.length).toBe(2);
  });

  it('should get order by id', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'APPROVED' } });
    const order = await service.createOrder('user1', 100);
    const found = service.getOrderById(order.id);
    expect(found).toEqual(order);
  });

  it('should return undefined if order not found', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'DECLINED' } });
    await service.createOrder('user1', 100);
    const found = service.getOrderById('nonexistent');
    expect(found).toBeUndefined();
  });

  it('should bump attempt counter on retry from FAILED', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { status: 'DECLINED' } })
      .mockResolvedValueOnce({ data: { status: 'APPROVED', paymentId: 'pay-r' } });
    const order = await service.createOrder('user1', 50);
    expect(order.status).toBe('FAILED');
    const after = await service.retryPayment(order.id);
    expect(after.paymentAttemptCount).toBe(2);
    expect(after.status).toBe('PAID');
  });
});
