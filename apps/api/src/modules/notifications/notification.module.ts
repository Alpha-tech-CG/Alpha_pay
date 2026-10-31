import { Module } from "@nestjs/common";
import { PushTokenController } from "./push-token.controller";
import { PushTokenService } from "./push-token.service";

/**
 * Jetons de notification de l'application mobile (hors V1, conservés pour elle).
 * Les envois passent tous par M9 (MessagingService) ; l'ancien envoi
 * Africa's Talking / Postmark et ses accusés de livraison sont retirés.
 */
@Module({
  controllers: [PushTokenController],
  providers: [PushTokenService],
  exports: [PushTokenService],
})
export class NotificationModule {}
