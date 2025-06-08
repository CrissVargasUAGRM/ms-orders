import { IsNumber, IsPositive } from "class-validator";

export class NewOrderItemDto {
  @IsNumber()
  @IsPositive()
  productId: number;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  price: number;
}