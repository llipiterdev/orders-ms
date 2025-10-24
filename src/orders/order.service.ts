import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Order } from './order.interface';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private orders: Order[] = [];

  async createOrder(userId: string, amount: number): Promise<Order> {
    const id = Date.now().toString();
    const order: Order = { id, userId, amount, status: 'PENDING' };
    this.orders.push(order);
    this.logger.log(`Order ${id} created with PENDING status for user ${userId}`);

    try {
      this.logger.log(`Calling payment service for order ${id}`);
      const response = await axios.post('http://payments-ms:3001/payments', { orderId: id, amount });
      this.logger.log(`Payment service responded with status: ${response.data.status}`);
      if (response.data.status === 'APPROVED') {
        order.status = 'PAID';
        this.logger.log(`Order ${id} status updated to PAID`);
      } else {
        order.status = 'FAILED';
        this.logger.log(`Order ${id} status updated to FAILED`);
      }
    } catch (error) {
      this.logger.error(`Error calling payment service for order ${id}: ${error.message}`);
      order.status = 'FAILED';
      this.logger.log(`Order ${id} status set to FAILED due to error`);
    }

    return order;
  }

  getOrders(): Order[] {
    this.logger.log(`Retrieving ${this.orders.length} orders`);
    return this.orders;
  }

  getOrderById(id: string): Order | undefined {
    const order = this.orders.find(o => o.id === id);
    if (order) {
      this.logger.log(`Order ${id} retrieved successfully`);
    } else {
      this.logger.warn(`Order ${id} not found in storage`);
    }
    return order;
  }
}