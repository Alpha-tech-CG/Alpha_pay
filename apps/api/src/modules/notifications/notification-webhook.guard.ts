import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { safeEqual } from "../../common/security/hmac";

@Injectable()
export class NotificationWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.NOTIFICATION_WEBHOOK_SECRET;
    const provided = context.switchToHttp().getRequest().headers[
      "x-notification-webhook-secret"
    ];
    if (!expected || typeof provided !== "string") {
      throw new UnauthorizedException("Callback notification non autorisé");
    }
    if (!safeEqual(Buffer.from(expected), Buffer.from(provided))) {
      throw new UnauthorizedException("Callback notification non autorisé");
    }
    return true;
  }
}
