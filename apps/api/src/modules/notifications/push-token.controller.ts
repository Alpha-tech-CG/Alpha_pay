import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushTokenService } from './push-token.service';

@Controller('v1/push-tokens')
@UseGuards(ApiKeyGuard)
export class PushTokenController {
  constructor(private readonly pushToken: PushTokenService) {}

  @Post()
  @HttpCode(200)
  register(@Req() req: any, @Body() dto: RegisterPushTokenDto) {
    return this.pushToken.upsert(req.merchant.id, dto.token, dto.platform);
  }
}
