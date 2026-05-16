import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { OrderModule } from './orders/order.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'orders_ms',
        autoLoadEntities: true,
        synchronize: process.env.DB_SYNCHRONIZE !== 'false',
        logging: process.env.DB_LOGGING === 'true',
      }),
    }),
    OrderModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
