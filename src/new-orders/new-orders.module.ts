import { Module } from '@nestjs/common';
import { NewOrdersService } from './new-orders.service';
import { NewOrdersController } from './new-orders.controller';
import { NatsModule } from '../transports/nats.module';

@Module({
  controllers: [NewOrdersController],
  providers: [NewOrdersService],
  imports: [NatsModule],
})
export class NewOrdersModule {}
