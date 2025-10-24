import { Controller, Get, Post, Body, Param, Logger } from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  @Post()
  async create(@Body() body: { userId: string; amount: number }) {
    this.logger.log(`Creating order for user ${body.userId} with amount ${body.amount}`);
    const order = await this.orderService.createOrder(body.userId, body.amount);
    this.logger.log(`Order created with ID ${order.id} and status ${order.status}`);
    return order;
  }

  @Get()
  findAll() {
    this.logger.log('Retrieving all orders');
    return this.orderService.getOrders();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.logger.log(`Retrieving order with ID ${id}`);
    const order = this.orderService.getOrderById(id);
    if (order) {
      this.logger.log(`Order found: ${order.id}`);
    } else {
      this.logger.warn(`Order with ID ${id} not found`);
    }
    return order;
  }
}