import { Type } from "class-transformer";
import { NewOrderItemDto } from "./new-order-item.dto";
import { ArrayMinSize, IsArray, IsNumber, ValidateNested } from 'class-validator';

export class CreateNewOrderDto {
    @IsNumber()
    userId: number;

    @IsNumber()
    clientId: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => NewOrderItemDto)
    details: NewOrderItemDto[];
}
