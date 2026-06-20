import { bodyGuard } from "./body-guard";

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
}

function run(
  method: string,
  headers: Record<string, string>,
  maxBytes?: number,
  path = "/",
) {
  const guard = bodyGuard({
    maxBytes,
    formUrlencodedPaths: ["/webhooks/notifications/africastalking"],
  });
  const req: any = { method, headers, path };
  const res = fakeRes();
  const next = jest.fn();
  guard(req, res as any, next);
  return { res, next };
}

describe("bodyGuard (ALP-153)", () => {
  it("laisse passer un GET sans vérifier le content-type", () => {
    const { next, res } = run("GET", {});
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("laisse passer un POST application/json de taille raisonnable", () => {
    const { next } = run("POST", {
      "content-type": "application/json",
      "content-length": "120",
    });
    expect(next).toHaveBeenCalled();
  });

  it("laisse passer un POST sans corps (ex. /:id/test, /:id/rotate)", () => {
    const { next, res } = run("POST", {});
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("rejette un Content-Type text/plain en 415", () => {
    const { next, res } = run("POST", {
      "content-type": "text/plain",
      "content-length": "10",
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(415);
    expect(res.body).toMatchObject({ code: "unsupported_media_type" });
  });

  it("rejette un Content-Type absent en 415", () => {
    const { res } = run("POST", { "content-length": "10" });
    expect(res.statusCode).toBe(415);
  });

  it("rejette un body > 8 KiB en 413", () => {
    const { next, res } = run("POST", {
      "content-type": "application/json",
      "content-length": String(9 * 1024),
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body).toMatchObject({ code: "payload_too_large" });
  });

  it("accepte pile à la limite (8192 octets)", () => {
    const { next } = run("POST", {
      "content-type": "application/json",
      "content-length": String(8 * 1024),
    });
    expect(next).toHaveBeenCalled();
  });

  it("ignore charset dans le content-type (application/json; charset=utf-8)", () => {
    const { next } = run("POST", {
      "content-type": "application/json; charset=utf-8",
      "content-length": "50",
    });
    expect(next).toHaveBeenCalled();
  });

  it("accepte le formulaire Africa's Talking uniquement sur son callback", () => {
    const headers = {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": "50",
    };
    expect(
      run("POST", headers, undefined, "/webhooks/notifications/africastalking")
        .next,
    ).toHaveBeenCalled();
    expect(run("POST", headers, undefined, "/payments").res.statusCode).toBe(
      415,
    );
  });
});
