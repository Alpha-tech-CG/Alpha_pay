import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PaylinksService } from './paylinks.service';
import { CreatePaylinkDto } from './dto/create-paylink.dto';
import { PayPaylinkDto } from './dto/pay-paylink.dto';

@Controller('paylinks')
export class PaylinksController {
  constructor(private readonly paylinksService: PaylinksService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  create(@Body() dto: CreatePaylinkDto, @Req() req: any) {
    return this.paylinksService.create(dto, req.merchant.id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.paylinksService.findById(id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Body() dto: PayPaylinkDto) {
    return this.paylinksService.pay(id, dto.phone);
  }
}
