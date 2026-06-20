import { NotificationService } from "./notification.service";
import { renderTemplate, TEMPLATES } from "./templates";

describe("renderTemplate (ALP-143)", () => {
  it("substitue les placeholders {{var}}", () => {
    const r = renderTemplate("payment.succeeded", {
      externalId: "cmd-1",
      amount: 100,
      currency: "XAF",
    });
    expect(r.body).toBe("Paiement cmd-1 de 100 XAF confirmé.");
    expect(r.version).toBe("v1");
  });

  it("remplace un placeholder sans valeur par vide", () => {
    const r = renderTemplate("webhook.failed", {
      url: "https://x",
      attempts: 7,
    });
    expect(r.body).toContain("https://x");
    expect(r.body).not.toContain("{{");
  });

  it("lève si template inconnu", () => {
    expect(() => renderTemplate("nope", {})).toThrow();
  });

  it("tous les templates ont une version", () => {
    for (const t of Object.values(TEMPLATES)) expect(t.version).toBeTruthy();
  });
});

function createPrisma(pref: any = null) {
  return {
    logs: [] as any[],
    notificationPreference: { findUnique: jest.fn().mockResolvedValue(pref) },
    notificationLog: {
      create: jest.fn(function (this: any, { data }: any) {
        return Promise.resolve(data);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    webhookEndpoint: {
      findMany: jest.fn().mockResolvedValue([{ id: "ep-1" }]),
    },
    webhookDelivery: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe("NotificationService (ALP-143)", () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD };
    delete process.env.AT_API_KEY;
    delete process.env.POSTMARK_TOKEN; // mode stub
  });
  afterEach(() => {
    process.env = OLD;
  });

  it("envoie un email (mode stub) et journalise SENT", async () => {
    const prisma = createPrisma();
    const svc = new NotificationService(prisma as any);
    const res = await svc.send({
      channel: "EMAIL",
      to: "a@b.cg",
      template: "merchant.welcome",
      category: "onboarding",
      data: { name: "Jean" },
    });
    expect(res.ok).toBe(true);
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", channel: "EMAIL" }),
      }),
    );
  });

  it("respecte l'opt-out marchand (SKIPPED, pas d'envoi)", async () => {
    const prisma = createPrisma({ optedOut: true });
    const svc = new NotificationService(prisma as any);
    const res = await svc.send({
      channel: "SMS",
      to: "+242",
      template: "payment.succeeded",
      category: "transaction",
      merchantId: "m1",
      data: {},
    });
    expect(res).toEqual({ ok: false, skipped: true });
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SKIPPED" }),
      }),
    );
  });

  it("marque une notification livrée depuis le callback fournisseur", async () => {
    const prisma = createPrisma();
    const svc = new NotificationService(prisma as any);
    await expect(svc.markDelivery("postmark", "msg-1", true)).resolves.toEqual({
      ok: true,
      matched: 1,
    });
    expect(prisma.notificationLog.updateMany).toHaveBeenCalledWith({
      where: { provider: "postmark", providerMessageId: "msg-1" },
      data: expect.objectContaining({ status: "DELIVERED", error: null }),
    });
  });
  it("enfile le canal WEBHOOK dans le worker de livraison", async () => {
    const prisma = createPrisma();
    const svc = new NotificationService(prisma as any);
    await expect(
      svc.send({
        channel: "WEBHOOK",
        to: "merchant",
        template: "payment.succeeded",
        category: "transaction",
        merchantId: "m1",
        data: { externalId: "tx-1" },
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        endpointId: "ep-1",
        event: "notification.transaction",
      }),
    });
  });
});
