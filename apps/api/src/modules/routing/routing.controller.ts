import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InternalGuard } from '../../common/guards/internal.guard';
import { RoutingService } from './routing.service';
import { CreateRoutingRuleDto, SimulateRoutingDto, UpdateRoutingRuleDto } from './dto/routing.dto';

@Controller('internal/routing-rules')
@UseGuards(InternalGuard)
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get()
  list() {
    return this.routing.list();
  }

  @Post()
  create(@Body() dto: CreateRoutingRuleDto) {
    return this.routing.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoutingRuleDto) {
    return this.routing.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.routing.remove(id);
  }

  // Simulateur : renvoie le partenaire qui serait choisi pour une demande type.
  @Post('simulate')
  simulate(@Body() dto: SimulateRoutingDto) {
    return this.routing.route(dto);
  }
}
