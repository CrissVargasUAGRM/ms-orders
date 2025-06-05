import { IsEnum, IsUUID } from 'class-validator';
import { OrderStatusList } from '../enum/order.enum';
import { OrderStatusListEnum } from '../enum/order.status.enum';



export class ChangeOrderStatusDto {

  @IsUUID(4)
  id: string;

  @IsEnum( OrderStatusList, {
    message: `Valid status are ${ OrderStatusList }`
  })
  status: OrderStatusListEnum;


}