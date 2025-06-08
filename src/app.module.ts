import { Module } from '@nestjs/common';
import { OrdersModule } from './orders/orders.module';
import { NewOrdersModule } from './new-orders/new-orders.module';


@Module({
  imports: [OrdersModule, NewOrdersModule],

})
export class AppModule {}
