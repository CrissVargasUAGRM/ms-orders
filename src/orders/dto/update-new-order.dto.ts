import { PartialType } from '@nestjs/mapped-types';
import { CreateNewOrderDto } from './create-new-order.dto';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UpdateNewOrderDto extends PartialType(CreateNewOrderDto) {

    @IsString()
    @IsNotEmpty()
    @IsUUID(4)
    newOrderId: string;
}
