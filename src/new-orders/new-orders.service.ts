import { Injectable, OnModuleInit, Inject, HttpStatus } from '@nestjs/common';
import { CreateNewOrderDto } from './dto/create-new-order.dto';
import { UpdateNewOrderDto } from './dto/update-new-order.dto';
import { PrismaClient } from '@prisma/client';
import { NATS_SERVICE } from '../config/services';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { v4 } from 'uuid';
import { OrderStatusListEnum } from '../orders/enum/order.status.enum';

@Injectable()
export class NewOrdersService extends PrismaClient implements OnModuleInit{

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    console.log('NewOrdersService connected to the database');
  }

  async create(createNewOrderDto: CreateNewOrderDto) {
    try {
      // confirmar los ids de los productos
      const productIds = createNewOrderDto.details.map((item) => item.productId);
      const products: any[] = await firstValueFrom(this.client.send({ cmd: 'validate_products' }, productIds));

      // realizar cálculos de valores
      const totalAmount = createNewOrderDto.details.reduce((acc, orderItem) => {
        const price = products.find(product => product.id === orderItem.productId).price;
        return acc + (price * orderItem.quantity);
      }, 0);

      const totalItems = createNewOrderDto.details.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      // crear una transacción de base de datos
        const order = await this.order.create({
          data: {
            id: v4(),
            totalAmount: totalAmount,
            totalItems: totalItems,
            status: OrderStatusListEnum.PENDING,
            paid: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            stripeChargeId: v4(),
            userid: createNewOrderDto.userId,
            clientid: createNewOrderDto.clientId,
            OrderItem: {
              createMany: {
                data: createNewOrderDto.details.map((orderItem) => ({
                  id: v4(),
                  price: products.find(
                    (product) => product.id === orderItem.productId,
                  ).price,
                  productId: orderItem.productId,
                  quantity: orderItem.quantity,
                })),
              },
            },
          },
          include: {
            OrderItem: {
              select: {
                price: true,
                quantity: true,
                productId: true,
              },
            },
          },
        });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs',
      });
    }
  }

}
