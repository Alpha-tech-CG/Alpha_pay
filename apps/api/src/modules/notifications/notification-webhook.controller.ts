import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { NotificationWebhookGuard } from "./notification-webhook.guard";

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${key} requis`);
  }
  return value;
}

@Controller("webhooks/notifications")
@UseGuards(NotificationWebhookGuard)
export class NotificationWebhookController {
  constructor(private readonly notifications: NotificationService) {}

  @Post("africastalking")
  africaTalking(@Body() body: Record<string, unknown>) {
    const messageId = requiredString(body, "id");
    const status = requiredString(body, "status");
    const delivered = ["success", "delivered"].includes(status.toLowerCase());
    return this.notifications.markDelivery(
      "africastalking",
      messageId,
      delivered,
      delivered ? undefined : String(body.failureReason ?? status),
    );
  }

  @Post("postmark")
  postmark(@Body() body: Record<string, unknown>) {
    const messageId = requiredString(body, "MessageID");
    const recordType = requiredString(body, "RecordType");
    if (!["Delivery", "Bounce"].includes(recordType)) {
      return { ok: true, ignored: true };
    }
    const delivered = recordType === "Delivery";
    return this.notifications.markDelivery(
      "postmark",
      messageId,
      delivered,
      delivered
        ? undefined
        : String(body.Description ?? body.Details ?? "bounce"),
    );
  }
}
