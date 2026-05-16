import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { OrderModule } from './orders/order.module';

@Module({
  imports: [OrderModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
