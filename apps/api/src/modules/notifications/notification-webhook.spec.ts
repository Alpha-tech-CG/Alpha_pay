import { UnauthorizedException } from "@nestjs/common";
import { NotificationWebhookController } from "./notification-webhook.controller";
import { NotificationWebhookGuard } from "./notification-webhook.guard";

describe("notification delivery webhooks (ALP-143)", () => {
  const oldSecret = process.env.NOTIFICATION_WEBHOOK_SECRET;

  afterEach(() => {
    if (oldSecret === undefined) delete process.env.NOTIFICATION_WEBHOOK_SECRET;
    else process.env.NOTIFICATION_WEBHOOK_SECRET = oldSecret;
  });

  it("authentifie le callback avec comparaison constante", () => {
    process.env.NOTIFICATION_WEBHOOK_SECRET = "secret-long-et-aleatoire";
    const guard = new NotificationWebhookGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            "x-notification-webhook-secret": "secret-long-et-aleatoire",
          },
        }),
      }),
    } as any;
    expect(guard.canActivate(context)).toBe(true);
    context.switchToHttp = () => ({ getRequest: () => ({ headers: {} }) });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("traduit un statut Africa's Talking en livraison", async () => {
    const service = { markDelivery: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new NotificationWebhookController(service as any);
    await controller.africaTalking({ id: "at-1", status: "Success" });
    expect(service.markDelivery).toHaveBeenCalledWith(
      "africastalking",
      "at-1",
      true,
      undefined,
    );
  });

  it("traduit un bounce Postmark en échec", async () => {
    const service = { markDelivery: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new NotificationWebhookController(service as any);
    await controller.postmark({
      MessageID: "pm-1",
      RecordType: "Bounce",
      Description: "Hard bounce",
    });
    expect(service.markDelivery).toHaveBeenCalledWith(
      "postmark",
      "pm-1",
      false,
      "Hard bounce",
    );
  });
});
