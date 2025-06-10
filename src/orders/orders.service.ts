import {HttpStatus, Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, PaidOrderDto } from './dto';
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config';
import { firstValueFrom, throwError } from 'rxjs';
import { OrderWithProducts } from './interfaces/order-with-produts.interface';
import { OrderStatusListEnum } from './enum/order.status.enum';
import { CreateNewOrderDto } from './dto/create-new-order.dto';
import { v4 } from 'uuid';
import { UpdateNewOrderDto } from './dto/update-new-order.dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async create(createOrderDto: CreateNewOrderDto) {
    try {
      //1 Confirmar los ids de los productos
      const productIds = createOrderDto.details.map((item) => item.productId);
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds),
      );

      //2. Cálculos de los valores
      const totalAmount = createOrderDto.details.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;
        return price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.details.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      //3. Crear una transacción de base de datos
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
          userid: createOrderDto.userId,
          clientid: createOrderDto.clientId,
          OrderItem: {
            createMany: {
              data: createOrderDto.details.map((orderItem) => ({
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
      console.log(error);
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs',
      });
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status,
      },
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status,
        },
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
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

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`,
      });
    }

    const productIds = order.OrderItem.map((orderItem) => orderItem.productId);
    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds),
    );

    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)
          .name,
      })),
    };
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);
    if (order.status === status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: { status: status },
    });
  }

  async createPaymentSession(order: OrderWithProducts) {

    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map( item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        }) ),
      }),
    );

    return paymentSession;
  }



  async paidOrder( paidOrderDto: PaidOrderDto ) {

    this.logger.log('Order Paid');
    this.logger.log(paidOrderDto);

    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,

        // La relación
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
            id: '1',
            updatedAt: new Date()
          }
        }
      }
    });

    return order;

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
