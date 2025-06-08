import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { NewOrdersService } from './new-orders.service';
import { CreateNewOrderDto } from './dto/create-new-order.dto';
import { UpdateNewOrderDto } from './dto/update-new-order.dto';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller('new-orders')
export class NewOrdersController {
  constructor(private readonly newOrdersService: NewOrdersService) {}

  @MessagePattern('createNewOrder')
  async create(@Payload() createNewOrderDto: CreateNewOrderDto) {
    const order = await this.newOrdersService.create(createNewOrderDto);
    return {
      order,
    };
  }
}
