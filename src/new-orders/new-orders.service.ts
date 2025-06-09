import { Injectable, OnModuleInit, Inject, HttpStatus, Logger } from '@nestjs/common';
import { CreateNewOrderDto } from './dto/create-new-order.dto';
import { UpdateNewOrderDto } from './dto/update-new-order.dto';
import { PrismaClient } from '@prisma/client';
import { NATS_SERVICE } from '../config/services';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { v4 } from 'uuid';
import { OrderStatusListEnum } from '../orders/enum/order.status.enum';

@Injectable()
export class NewOrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    console.log('NewOrdersService connected to the database');
  }

  async create(createNewOrderDto: CreateNewOrderDto) {
    try {
      // confirmar los ids de los productos
      const productIds = createNewOrderDto.details.map(
        (item) => item.productId,
      );
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );

      // realizar cálculos de valores
      const totalAmount = createNewOrderDto.details.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;
        return acc + price * orderItem.quantity;
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

  async changeDataOrder(orderDto: UpdateNewOrderDto) {
    try {
      this.logger.log('Update order data init');

      // confirmar los ids de los productos
      const productIds = orderDto.details.map(
        (item) => item.productId,
      );
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );

      // realizar cálculos de valores
      const totalAmount = orderDto.details.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;
        return acc + price * orderItem.quantity;
      }, 0);

      const totalItems = orderDto.details.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      // actualizamos la orden con toda la informacion ya calculada y declarada
      const newOrder = await this.order.update({
        where: { id: orderDto.newOrderId },
        data: {
          userid: orderDto.userId,
          clientid: orderDto.clientId,
          totalAmount: totalAmount,
          totalItems: totalItems,
          updatedAt: new Date(),
          OrderItem: {
            deleteMany: {},
            createMany: {
              data: orderDto.details.map((orderItem) => ({
                id: v4(),
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            }
          }
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            }
          }
        }
      });

      console.log(newOrder);

      this.logger.log('Finish update order data');

      return {
        ...newOrder,
        OrderItem: newOrder.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      };
    } catch (error) {
      this.logger.error('Error changing order data', error);
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error updating order data',
      });
    }
  }
}
