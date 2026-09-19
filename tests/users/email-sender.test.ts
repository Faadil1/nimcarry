import { describe, expect, it } from "vitest";
import {
  DisabledUserEmailSender,
  ResendUserEmailSender,
  createUserEmailSender,
} from "../../src/users/email-sender.js";

describe("returning-user email sender", () => {
  it("fails closed when email delivery is not configured", async () => {
    const sender = createUserEmailSender({});
    expect(sender).toBeInstanceOf(DisabledUserEmailSender);
    expect(sender.available).toBe(false);
    await expect(sender.sendLoginCode({
      to: "person@example.com",
      code: "123456",
      expiresAt: Date.now() + 600_000,
    })).rejects.toThrow("EMAIL_DELIVERY_NOT_CONFIGURED");
  });

  it("sends a six-digit login code through Resend without exposing provider keys", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const sender = new ResendUserEmailSender(
      "re_test_secret",
      "NimCarry <signin@example.com>",
      fakeFetch as typeof fetch
    );
    expect(sender.available).toBe(true);

    await sender.sendLoginCode({
      to: "person@example.com",
      code: "482731",
      expiresAt: Date.now() + 600_000,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_secret");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.from).toBe("NimCarry <signin@example.com>");
    expect(body.to).toEqual(["person@example.com"]);
    expect(body.subject).toBe("Your NimCarry sign-in code");
    expect(body.text).toContain("482731");
    expect(body.html).toContain("482731");
    expect(JSON.stringify(body)).not.toContain("re_test_secret");
  });
});
