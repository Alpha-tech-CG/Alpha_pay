import { sendEmail, sendSms } from "./providers";

const TEMPLATE = { version: "v1", subject: "Sujet", body: "Message" };

describe("notification providers (ALP-143)", () => {
  const oldEnv = process.env;
  const oldFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      AT_API_KEY: "at-key",
      AT_USERNAME: "sandbox",
      POSTMARK_TOKEN: "pm-token",
      POSTMARK_FROM: "noreply@paybrain.cg",
    };
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    process.env = oldEnv;
    global.fetch = oldFetch;
  });

  it("extrait le messageId Africa's Talking", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        SMSMessageData: { Recipients: [{ messageId: "at-1" }] },
      }),
    });
    await expect(sendSms("+242061234567", TEMPLATE)).resolves.toMatchObject({
      ok: true,
      provider: "africastalking",
      providerMessageId: "at-1",
    });
  });

  it("extrait le MessageID Postmark", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ErrorCode: 0, MessageID: "pm-1" }),
    });
    await expect(sendEmail("ops@paybrain.cg", TEMPLATE)).resolves.toMatchObject(
      {
        ok: true,
        provider: "postmark",
        providerMessageId: "pm-1",
      },
    );
  });

  it("ne retente que les erreurs HTTP transitoires", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 422 });
    await expect(sendEmail("bad@example.com", TEMPLATE)).resolves.toMatchObject(
      {
        ok: false,
        retryable: false,
      },
    );
  });
});
