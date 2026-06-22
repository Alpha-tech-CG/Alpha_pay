import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { InternalGuard } from "../../common/guards/internal.guard";
import { SettlementService } from "./settlement.service";
import {
  RunSettlementDto,
  SettlementConfigDto,
} from "./dto/settlement.dto";

@Controller("internal/settlements")
@UseGuards(InternalGuard)
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Post("run")
  run(@Body() dto: RunSettlementDto) {
    return this.settlement.run(
      dto.merchantId,
      new Date(dto.periodStart),
      new Date(dto.periodEnd),
    );
  }

  @Get()
  list() {
    return this.settlement.listBatches();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.settlement.getBatch(id);
  }

  @Post(":id/validate")
  validate(
    @Param("id") id: string,
    @Headers("x-validator-id") validatorId: string,
    @Headers("x-validator-token") validatorToken: string,
  ) {
    // L'identité du validateur est un credential (en-tête), jamais une simple
    // chaîne du corps : couplée à SETTLEMENT_VALIDATORS, elle garantit deux
    // validateurs réellement distincts pour le 4-eyes (ALP-VULN).
    if (!validatorId) throw new UnauthorizedException("X-Validator-Id requis");
    return this.settlement.validate(id, validatorId, validatorToken);
  }

  @Post(":id/send")
  send(@Param("id") id: string) {
    return this.settlement.send(id);
  }

  @Post(":id/confirm")
  confirm(@Param("id") id: string) {
    return this.settlement.confirm(id);
  }

  @Put("config/:merchantId")
  setConfig(
    @Param("merchantId") merchantId: string,
    @Body() dto: SettlementConfigDto,
  ) {
    return this.settlement.upsertConfig(merchantId, dto);
  }
}
