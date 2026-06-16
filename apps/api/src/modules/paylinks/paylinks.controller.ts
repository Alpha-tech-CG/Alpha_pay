import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PaylinksService } from './paylinks.service';

@Controller('paylinks')
export class PaylinksController {
  constructor(private readonly paylinksService: PaylinksService) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  create(@Body() dto: any, @Req() req: any) {
    return this.paylinksService.create(dto, req.merchant.id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.paylinksService.findById(id);
  }
}
