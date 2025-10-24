import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Order } from './order.interface';

@Injectable()
export class OrderService {
  private orders: Order[] = [];

  async createOrder(userId: string, amount: number): Promise<Order> {
    const id = Date.now().toString();
    const order: Order = { id, userId, amount, status: 'PENDING' };
    this.orders.push(order);

    try {
      const response = await axios.post('http://payments-ms:3001/payments', { orderId: id, amount });
      if (response.data.status === 'APPROVED') {
        order.status = 'PAID';
      } else {
        order.status = 'FAILED';
      }
    } catch (error) {
      order.status = 'FAILED';
    }

    return order;
  }

  getOrders(): Order[] {
    return this.orders;
  }

  getOrderById(id: string): Order | undefined {
    return this.orders.find(o => o.id === id);
  }
}