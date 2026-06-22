import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { UssdService } from './ussd.service';
import { UssdGatewayGuard } from './ussd-gateway.guard';
import { UssdSessionDto } from './dto/ussd-session.dto';

/**
 * Endpoint USSD entrant (paiement depuis un téléphone à touches).
 * La passerelle (agrégateur USSD, shortcode partagé MTN/Airtel) POST le pas de
 * session ici ; on répond en texte `CON `/`END `.
 */
@Controller('ussd')
export class UssdController {
  constructor(private readonly ussd: UssdService) {}

  @Post()
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  @UseGuards(UssdGatewayGuard)
  handle(@Body() dto: UssdSessionDto) {
    return this.ussd.handleSession({ phoneNumber: dto.phoneNumber, text: dto.text ?? '' });
  }
}
