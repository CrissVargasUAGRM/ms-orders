import { OrderStatusListEnum } from '../enum/order.status.enum';


export interface OrderWithProducts {
  OrderItem: {
      name: any;
      productId: number;
      quantity: number;
      price: number;
  }[];
  id: string;
  totalAmount: number;
  totalItems: number;
  status: OrderStatusListEnum;
  paid: boolean;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
}