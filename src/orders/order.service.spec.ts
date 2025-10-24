import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderService],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('should create order and set status to PAID if approved', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'APPROVED' } });

    const order = await service.createOrder('user1', 100);
    expect(order.status).toBe('PAID');
    expect(order.userId).toBe('user1');
    expect(order.amount).toBe(100);
    expect(service.getOrders()).toContain(order);
  });

  it('should create order and set status to FAILED if declined', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'DECLINED' } });

    const order = await service.createOrder('user1', 100);
    expect(order.status).toBe('FAILED');
  });

  it('should create order and set status to FAILED on error', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'));

    const order = await service.createOrder('user1', 100);
    expect(order.status).toBe('FAILED');
  });

  it('should get all orders', () => {
    service.createOrder('user1', 100);
    service.createOrder('user2', 200);
    const orders = service.getOrders();
    expect(orders.length).toBe(2);
  });

  it('should get order by id', async () => {
    const order = await service.createOrder('user1', 100);
    const found = service.getOrderById(order.id);
    expect(found).toEqual(order);
  });
});