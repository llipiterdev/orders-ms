import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  @Post('bulk')
  async bulk(
    @Body()
    body: { userId: string; count: number; amount: number; currency?: string },
  ) {
    this.logger.log(`Bulk create ${body.count} orders for ${body.userId}`);
    return this.orderService.bulkCreate(
      body.userId,
      body.count,
      body.amount,
      body.currency,
    );
  }

  @Post()
  async create(
    @Body()
    body: { userId: string; amount: number; currency?: string },
  ) {
    this.logger.log(`Creating order for user ${body.userId}`);
    const order = await this.orderService.createOrder(
      body.userId,
      body.amount,
      body.currency,
    );
    this.logger.log(`Order ${order.id} final status=${order.status}`);
    return order;
  }

  @Get()
  findAll(@Query('userId') userId?: string, @Query('status') status?: string) {
    if (userId || status) {
      return this.orderService.getOrdersFiltered(userId, status);
    }
    return this.orderService.getOrders();
  }

  @Get(':id/ledger')
  async ledger(@Param('id') id: string) {
    return this.orderService.getOrderLedger(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    this.logger.log(`Cancel request for ${id}`);
    return this.orderService.cancelOrder(id);
  }

  @Post(':id/retry-payment')
  async retry(@Param('id') id: string) {
    this.logger.log(`Retry payment for ${id}`);
    return this.orderService.retryPayment(id);
  }

  @Post(':id/refund-request')
  async refund(
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    return this.orderService.requestRefund(id, body.amount);
  }

  @Patch(':id/metadata')
  patchMetadata(
    @Param('id') id: string,
    @Body() body: Record<string, string>,
  ) {
    return this.orderService.patchOrderMetadata(id, body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.getOrderById(id);
  }
}
